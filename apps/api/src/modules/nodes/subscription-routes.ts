import { Router } from "express";
import { getConfig } from "../../config";
import { db, lockUser } from "../../db";
import { badRequest, unauthorized } from "../../http/errors";
import { currentUser, requireUser } from "../../http/session";
import { canUseNodes } from "../account/entitlement";
import { unixSeconds } from "../account/service";
import { newToken, sessionDigest } from "../auth/service";
import { iniProfile } from "./ini-profile";
import { loon } from "./loon";
import { quantumultx } from "./quantumultx";
import { shadowrocket } from "./shadowrocket";
import type { SubscriptionLinks } from "@xboard/contracts";
import { readSettings } from "../site/service";
import {
    loadTemplate,
    quantumultxFilters,
    renderLoon,
    renderMihomo,
    renderSingbox,
} from "../templates/service";
import { entryFor, mihomoProxies, singboxOutbounds } from "./subscription";

const FORMATS = [
    "mihomo",
    "singbox",
    "shadowrocket",
    "quantumultx",
    "loon",
    "surge",
    "surfboard",
    // Rule/group configurations that pull the nodes from the formats above.
    "loon-config",
    "shadowrocket-rules",
] as const;
type Format = (typeof FORMATS)[number];

/**
 * The format a client expects, from its User-Agent: Shadowrocket gets base64
 * share links, Quantumult X and Loon their own node lines; sing-box based apps (sing-box, SFA/SFI/SFM, Hiddify, Karing)
 * get sing-box JSON; Surge and Surfboard get INI profiles. All other apps, including Clash Verge Rev, Clash Party,
 * FlClash, Clash Meta and Stash, get Mihomo.
 */
export function formatForUserAgent(userAgent: string | undefined): Format {
    const agent = userAgent ?? "";
    if (/shadowrocket/i.test(agent)) return "shadowrocket";
    if (/quantumult/i.test(agent)) return "quantumultx";
    if (/\bloon\b/i.test(agent)) return "loon";
    if (/\bsurfboard\b/i.test(agent)) return "surfboard";
    if (/\bsurge\b/i.test(agent)) return "surge";
    return /sing-box|\bSF[AIM]\b|hiddify|karing/i.test(agent)
        ? "singbox"
        : "mihomo";
}

export const subscriptionRoutes = Router();

/**
 * The subscription URLs, and app links that also carry the rule templates.
 * Quantumult X's add-resource takes the node subscription and the template's
 * filter_remote entries at once; Loon installs a whole configuration whose
 * [Remote Proxy] points back at the node list; Shadowrocket adds a rules
 * configuration next to the node subscription.
 */
async function links(token: string): Promise<SubscriptionLinks> {
    const base = `${getConfig().origin}/api/subscription/${token}`;
    const [{ siteName }, filters] = await Promise.all([
        readSettings(),
        loadTemplate("quantumultx").then((template) =>
            quantumultxFilters(template, getConfig().origin),
        ),
    ]);
    const resource = {
        server_remote: [
            `${base}?format=quantumultx, tag=${siteName.replace(/,/g, " ")}`,
        ],
        filter_remote: filters,
    };
    return {
        url: base,
        mihomo: `${base}?format=mihomo`,
        singbox: `${base}?format=singbox`,
        imports: {
            quantumultx: `quantumult-x:///add-resource?remote-resource=${encodeURIComponent(JSON.stringify(resource))}`,
            loon: `loon://import?sub=${encodeURIComponent(`${base}?format=loon-config`)}`,
            shadowrocketRules: `shadowrocket://config/add/${base}?format=shadowrocket-rules`,
        },
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
        res.json(await links(token));
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
        res.status(201).json(await links(token));
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
    if (format === "loon-config" || format === "shadowrocket-rules") {
        const template = await loadTemplate(
            format === "loon-config" ? "loon" : "shadowrocket",
        );
        res.setHeader("subscription-userinfo", usage);
        res.type("text/plain").send(
            format === "loon-config"
                ? renderLoon(
                      template,
                      `${getConfig().origin}/api/subscription/${token}?format=loon`,
                  )
                : template,
        );
        return;
    }
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
    if (format === "surge" || format === "surfboard") {
        const config = iniProfile(entries, user.proxyUuid, format);
        if (!config) throw empty();
        res.setHeader("subscription-userinfo", usage);
        res.setHeader(
            "content-disposition",
            'attachment; filename="xboard.conf"',
        );
        res.type("text/plain").send(config);
        return;
    }
    // Mihomo and sing-box: the admin's template with the nodes injected.
    if (format === "mihomo") {
        if (!mihomoProxies(entries, user.proxyUuid).length) throw empty();
        const yaml = renderMihomo(
            await loadTemplate("mihomo"),
            entries,
            user.proxyUuid,
            { stash: /stash/i.test(userAgent ?? "") },
        );
        res.setHeader("subscription-userinfo", usage);
        res.setHeader(
            "content-disposition",
            'attachment; filename="xboard.yaml"',
        );
        res.type("text/yaml").send(yaml);
        return;
    }
    if (!singboxOutbounds(entries, user.proxyUuid).length) throw empty();
    const json = renderSingbox(
        await loadTemplate("singbox"),
        entries,
        user.proxyUuid,
    );
    res.setHeader("subscription-userinfo", usage);
    res.setHeader("content-disposition", 'attachment; filename="xboard.json"');
    res.type("application/json").send(json);
});
