import { randomBytes } from "node:crypto";
import { Router, type Request } from "express";
import {
    totpSetupBody,
    totpEnableBody,
    twoFactorProofBody,
    uuidParam,
    type DeviceSession,
} from "@xboard/contracts";
import { db, lockUser, type Tx } from "../../db";
import {
    badRequest,
    conflict,
    notFound,
    unauthorized,
} from "../../http/errors";
import { enforce, rateLimit } from "../../http/rate-limit";
import { currentUser, requireUser } from "../../http/session";
import { parse } from "../../http/validate";
import { audit } from "../admin/shared";
import { verifyPassword } from "../auth/password";
import { SESSION_COOKIE, sessionDigest } from "../auth/service";
import {
    releaseTwoFactorAttempt,
    reserveTwoFactorAttempt,
} from "../auth/two-factor-limit";
import { readSettings } from "../site/service";
import {
    encodeSecret,
    factorUpdate,
    makeRecoveryCodes,
    openSecret,
    otpauthUri,
    sealSecret,
    verifyTotp,
} from "../auth/totp";

export const securityRoutes = Router();
const SETUP_MINUTES = 10;

function currentSessionId(req: Request) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string") throw unauthorized("请先登录。");
    return sessionDigest(token);
}

async function checkSession(tx: Tx, req: Request, now: Date) {
    const userId = currentUser(req).id;
    await lockUser(tx, userId);
    const session = await tx.session.findFirst({
        where: { id: currentSessionId(req), userId, expiresAt: { gt: now } },
    });
    if (!session) throw unauthorized("登录已失效，请重新登录。");
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.banned) throw unauthorized("登录已失效，请重新登录。");
    return { user, session };
}

securityRoutes.use("/account/sessions", requireUser);
securityRoutes.get("/account/sessions", async (req, res) => {
    const currentId = currentSessionId(req);
    const sessions = await db.session.findMany({
        where: { userId: currentUser(req).id, expiresAt: { gt: new Date() } },
        orderBy: [{ createdAt: "desc" }, { publicId: "asc" }],
    });
    res.json(
        sessions.map((session): DeviceSession => ({
            id: session.publicId,
            current: session.id === currentId,
            userAgent: session.userAgent,
            createdAt: session.createdAt.toISOString(),
            expiresAt: session.expiresAt.toISOString(),
        })),
    );
});

securityRoutes.delete("/account/sessions/:id", async (req, res) => {
    const id = parse(uuidParam, req.params.id);
    await db.$transaction(async (tx) => {
        const { user, session } = await checkSession(tx, req, new Date());
        if (id === session.publicId)
            throw badRequest("请通过退出登录结束当前会话。");
        const removed = await tx.session.deleteMany({
            where: { userId: user.id, publicId: id },
        });
        if (!removed.count) throw notFound("登录设备不存在。");
        await audit(tx, user.id, "session.revoke", user.id);
    });
    res.json({ ok: true });
});

securityRoutes.post("/account/sessions/revoke-others", async (req, res) => {
    const revoked = await db.$transaction(async (tx) => {
        const { user, session } = await checkSession(tx, req, new Date());
        const removed = await tx.session.deleteMany({
            where: { userId: user.id, id: { not: session.id } },
        });
        await audit(tx, user.id, "session.revoke_others", user.id, {
            count: removed.count,
        });
        return removed.count;
    });
    res.json({ revoked });
});

securityRoutes.use(
    "/account/totp",
    requireUser,
    rateLimit({ limit: 12, windowMs: 60_000, scope: "totp" }),
    async (req, _res, next) => {
        await enforce(`totp:${currentUser(req).id}`, 15 * 60_000, 20);
        next();
    },
);

securityRoutes.post("/account/totp/setup", async (req, res) => {
    const { password } = parse(totpSetupBody, req.body);
    const { siteName } = await readSettings();
    const result = await db.$transaction(async (tx) => {
        const now = new Date();
        const { user, session } = await checkSession(tx, req, now);
        if (user.totpSecret) throw conflict("两步验证已启用。");
        if (!(await verifyPassword(password, user.password)))
            throw badRequest("当前密码不正确。");
        const secret = randomBytes(20);
        const expiresAt = new Date(now.getTime() + SETUP_MINUTES * 60_000);
        await tx.session.update({
            where: { id: session.id },
            data: {
                pendingTotp: sealSecret(user.id, secret),
                pendingTotpExpiresAt: expiresAt,
            },
        });
        const encoded = encodeSecret(secret);
        return {
            secret: encoded,
            uri: otpauthUri(siteName, user.email, encoded),
            expiresAt: expiresAt.toISOString(),
        };
    });
    res.status(201).json(result);
});

securityRoutes.post("/account/totp/enable", async (req, res) => {
    const { code } = parse(totpEnableBody, req.body);
    const result = await db.$transaction(async (tx) => {
        const now = new Date();
        const { user, session } = await checkSession(tx, req, now);
        if (user.totpSecret) throw conflict("两步验证已启用。");
        if (
            !session.pendingTotp ||
            !session.pendingTotpExpiresAt ||
            session.pendingTotpExpiresAt <= now
        )
            throw badRequest("设置已过期，请重新开始。");
        const step = verifyTotp(
            openSecret(user.id, session.pendingTotp),
            code,
            null,
            now.getTime(),
        );
        if (step === null) throw badRequest("动态验证码不正确。");
        const { codes, hashes } = makeRecoveryCodes();
        await tx.user.update({
            where: { id: user.id },
            data: {
                totpSecret: session.pendingTotp,
                totpLastStep: step,
                totpRecoveryHashes: hashes,
            },
        });
        await tx.session.update({
            where: { id: session.id },
            data: { pendingTotp: null, pendingTotpExpiresAt: null },
        });
        await tx.session.deleteMany({
            where: { userId: user.id, id: { not: session.id } },
        });
        await audit(tx, user.id, "totp.enable", user.id);
        return { codes };
    });
    res.status(201).json(result);
});

async function proofs(req: Request, action: "disable" | "recovery") {
    const { password, code } = parse(twoFactorProofBody, req.body);
    const userId = currentUser(req).id;
    // The password is checked first, so typos cannot lock the second factor;
    // the code guess is counted before it is checked, so parallel requests
    // cannot exceed the per-user limit.
    const before = await db.user.findUnique({ where: { id: userId } });
    if (!before?.totpSecret) throw conflict("两步验证尚未启用。");
    if (!(await verifyPassword(password, before.password)))
        throw badRequest("当前密码不正确。");
    await reserveTwoFactorAttempt(userId);
    const result = await db.$transaction(async (tx) => {
        const now = new Date();
        const { user } = await checkSession(tx, req, now);
        if (!user.totpSecret) throw conflict("两步验证尚未启用。");
        if (user.password !== before.password)
            throw badRequest("账户状态已变化，请重试。");
        const proof = factorUpdate(user, code, now);
        if (proof === null) throw badRequest("动态验证码或恢复码无效。");
        if (action === "disable") {
            await tx.user.update({
                where: { id: user.id },
                data: {
                    totpSecret: null,
                    totpLastStep: null,
                    totpRecoveryHashes: [],
                },
            });
            await audit(tx, user.id, "totp.disable", user.id);
            return { ok: true };
        }
        const { codes, hashes } = makeRecoveryCodes();
        await tx.user.update({
            where: { id: user.id },
            data: { ...proof, totpRecoveryHashes: hashes },
        });
        await audit(tx, user.id, "totp.recovery_rotate", user.id);
        return { codes };
    });
    await releaseTwoFactorAttempt(userId);
    return result;
}

securityRoutes.post("/account/totp/disable", async (req, res) => {
    res.json(await proofs(req, "disable"));
});
securityRoutes.post("/account/totp/recovery-codes", async (req, res) => {
    res.status(201).json(await proofs(req, "recovery"));
});
