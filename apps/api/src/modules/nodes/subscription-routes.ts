import { Router } from "express";
import { getConfig } from "../../config";
import { db } from "../../db";
import { badRequest, unauthorized } from "../../http/errors";
import { currentUser, requireUser } from "../../http/session";
import { canUseNodes } from "../account/entitlement";
import { unixSeconds } from "../account/service";
import { newToken, sessionDigest } from "../auth/service";
import { mihomo, singbox } from "./subscription";

export const subscriptionRoutes = Router();

/** Issue a new subscription link; the previous link stops working. */
subscriptionRoutes.post(
    "/account/subscription",
    requireUser,
    async (req, res) => {
        const token = newToken();
        await db.user.update({
            where: { id: currentUser(req).id },
            data: { subscribeHash: sessionDigest(token) },
        });
        const base = `${getConfig().origin}/api/subscription/${token}`;
        res.status(201).json({
            mihomo: `${base}?format=mihomo`,
            singbox: `${base}?format=singbox`,
        });
    },
);

/** The client config itself. The token in the path is the only credential. */
subscriptionRoutes.get("/subscription/:token", async (req, res) => {
    const { token } = req.params;
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw unauthorized("订阅不可用。");
    const user = await db.user.findUnique({
        where: { subscribeHash: sessionDigest(token) },
    });
    if (!user || !canUseNodes(user)) throw unauthorized("订阅不可用。");
    const format = req.query.format;
    if (format !== "mihomo" && format !== "singbox")
        throw badRequest("支持 mihomo 或 singbox。");
    const nodes = await db.node.findMany({
        where: {
            enabled: true,
            deletedAt: null,
            plans: { some: { planId: user.planId! } },
        },
        orderBy: { id: "asc" },
    });
    if (!nodes.length) throw badRequest("当前套餐暂无可用节点。");
    res.setHeader(
        "subscription-userinfo",
        `upload=${user.upload}; download=${user.download}; total=${user.transferEnable}; expire=${unixSeconds(user.expiredAt) ?? 0}`,
    );
    res.setHeader("content-disposition", 'attachment; filename="xboard.json"');
    // JSON is valid YAML, so Mihomo reads it too, with no YAML string escaping to get wrong.
    res.type("application/json").send(
        JSON.stringify(
            format === "mihomo"
                ? mihomo(nodes, user.proxyUuid)
                : singbox(nodes, user.proxyUuid),
        ),
    );
});
