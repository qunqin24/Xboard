import { Router } from "express";
import { getConfig } from "../../config";
import { db, lockUser } from "../../db";
import { badRequest, unauthorized } from "../../http/errors";
import { currentUser, requireUser } from "../../http/session";
import { canUseNodes } from "../account/entitlement";
import { unixSeconds } from "../account/service";
import { newToken, sessionDigest } from "../auth/service";
import { loon } from "./loon";
import { quantumultx } from "./quantumultx";
import { shadowrocket } from "./shadowrocket";
import { entryFor, mihomo, singbox } from "./subscription";

const FORMATS = [
    "mihomo",
    "singbox",
    "shadowrocket",
    "quantumultx",
    "loon",
] as const;
type Format = (typeof FORMATS)[number];

/**
 * The format a client expects, from its User-Agent: Shadowrocket gets base64
 * share links, Quantumult X and Loon their own node lines; sing-box based apps (sing-box, SFA/SFI/SFM, Hiddify, Karing)
 * get sing-box JSON; everything else, including Clash Verge Rev, FlClash,
 * Clash Meta and Stash, gets Mihomo.
 */
export function formatForUserAgent(userAgent: string | undefined): Format {
    const agent = userAgent ?? "";
    if (/shadowrocket/i.test(agent)) return "shadowrocket";
    if (/quantumult/i.test(agent)) return "quantumultx";
    if (/\bloon\b/i.test(agent)) return "loon";
    return /sing-box|\bSF[AIM]\b|hiddify|karing/i.test(agent)
        ? "singbox"
        : "mihomo";
}

export const subscriptionRoutes = Router();

function links(token: string) {
    const base = `${getConfig().origin}/api/subscription/${token}`;
    return {
        url: base,
        mihomo: `${base}?format=mihomo`,
        singbox: `${base}?format=singbox`,
    };
}

/**
 * The user's subscription link, created on first visit. It stays the same
 * until the user resets it, so the page can show it every time.
 *
 * The token is stored as is, like the proxy UUID it hands out: anyone who can
 * read the user row already holds the node credentials, so hashing it would
 * only make the link impossible to show again.
 */
subscriptionRoutes.get(
    "/account/subscription",
    requireUser,
    async (req, res) => {
        const userId = currentUser(req).id;
        const token = await db.$transaction(async (tx) => {
            await lockUser(tx, userId);
            const user = await tx.user.findUniqueOrThrow({
                where: { id: userId },
                select: { subscribeToken: true },
            });
            if (user.subscribeToken) return user.subscribeToken;
            const created = newToken();
            await tx.user.update({
                where: { id: userId },
                data: { subscribeToken: created },
            });
            return created;
        });
        res.json(links(token));
    },
);

/** Replace the link; the previous one (and any pre-upgrade link) stops working. */
subscriptionRoutes.post(
    "/account/subscription",
    requireUser,
    async (req, res) => {
        const token = newToken();
        await db.user.update({
            where: { id: currentUser(req).id },
            data: { subscribeToken: token, subscribeHash: null },
        });
        res.status(201).json(links(token));
    },
);

/** The client config itself. The token in the path is the only credential. */
subscriptionRoutes.get("/subscription/:token", async (req, res) => {
    const { token } = req.params;
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw unauthorized("订阅不可用。");
    // Links issued before tokens were stored are still matched by their digest.
    const user = await db.user.findFirst({
        where: {
            OR: [
                { subscribeToken: token },
                { subscribeHash: sessionDigest(token) },
            ],
        },
    });
    if (!user || !canUseNodes(user)) throw unauthorized("订阅不可用。");
    // `?format=` pins a format; without it the client's User-Agent decides.
    const requested = req.query.format;
    if (requested !== undefined && !FORMATS.includes(requested as Format))
        throw badRequest(`支持 ${FORMATS.join("、")}。`);
    const userAgent = req.headers["user-agent"];
    const format: Format =
        (requested as Format | undefined) ?? formatForUserAgent(userAgent);
    // Visible nodes of the user's plan; a relay child only while its parent runs.
    const nodes = await db.node.findMany({
        where: {
            enabled: true,
            visible: true,
            deletedAt: null,
            plans: { some: { planId: user.planId! } },
            OR: [
                { parentId: null },
                { parent: { enabled: true, deletedAt: null } },
            ],
        },
        include: { parent: true },
        orderBy: { id: "asc" },
    });
    const entries = nodes.map((node) => entryFor(node, node.parent));
    const usage = `upload=${user.upload}; download=${user.download}; total=${user.transferEnable}; expire=${unixSeconds(user.expiredAt) ?? 0}`;
    const empty = () =>
        badRequest(
            nodes.length
                ? "当前套餐的节点均不支持此客户端格式。"
                : "当前套餐暂无可用节点。",
        );
    if (format === "shadowrocket") {
        const { body, count } = shadowrocket(
            entries,
            user.proxyUuid,
            {
                upload: user.upload,
                download: user.download,
                total: user.transferEnable,
                expiredAt: user.expiredAt,
            },
            userAgent,
        );
        if (!count) throw empty();
        res.setHeader("subscription-userinfo", usage);
        res.type("text/plain").send(body);
        return;
    }
    if (format === "quantumultx" || format === "loon") {
        const lines =
            format === "quantumultx"
                ? quantumultx(entries, user.proxyUuid)
                : loon(entries, user.proxyUuid);
        if (!lines.length) throw empty();
        res.setHeader("subscription-userinfo", usage);
        res.type("text/plain").send(`${lines.join("\n")}\n`);
        return;
    }
    const config =
        format === "mihomo"
            ? mihomo(entries, user.proxyUuid)
            : singbox(entries, user.proxyUuid);
    const count =
        "proxies" in config
            ? config.proxies.length
            : config.outbounds.length - 1;
    if (!count) throw empty();
    res.setHeader("subscription-userinfo", usage);
    res.setHeader("content-disposition", 'attachment; filename="xboard.json"');
    // JSON is valid YAML, so Mihomo reads it too, with no YAML string escaping to get wrong.
    res.type("application/json").send(JSON.stringify(config));
});
