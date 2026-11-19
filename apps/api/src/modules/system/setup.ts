import { timingSafeEqual } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { Router } from "express";
import { setupBody } from "@xboard/contracts";
import { db, type Tx } from "../../db";
import { notFound, unauthorized } from "../../http/errors";
import { rateLimit } from "../../http/rate-limit";
import { parse } from "../../http/validate";
import { log } from "../../logging";
import { audit } from "../admin/shared";
import { hashPassword } from "../auth/password";
import { claimMailbox, mailboxKey } from "../auth/registration";
import { readSettings } from "../site/service";
import { applicationKey, installationSecret, secretPath } from "./secrets";

async function requireUnconfigured(tx: Tx = db) {
    if (
        await tx.user.findFirst({
            where: { role: "admin" },
            select: { id: true },
        })
    )
        throw notFound("安装已经完成。");
}

export async function initializeInstallation() {
    applicationKey();
    const admin = await db.user.findFirst({
        where: { role: "admin" },
        select: { id: true },
    });
    if (!admin)
        log("info", "setup.available", {
            code: installationSecret("setup.code"),
        });
}

export const setupRoutes = Router();
setupRoutes.get("/setup", async (_req, res) => {
    await requireUnconfigured();
    res.json({ ok: true });
});
setupRoutes.post(
    "/setup",
    rateLimit({ limit: 5, windowMs: 60_000, scope: "setup" }),
    async (req, res) => {
        await requireUnconfigured();
        const { code, email, password } = parse(setupBody, req.body);
        let expected: Buffer;
        try {
            expected = Buffer.from(
                readFileSync(secretPath("setup.code"), "utf8").trim(),
            );
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT")
                await requireUnconfigured();
            throw error;
        }
        const supplied = Buffer.from(code);
        if (
            expected.length !== supplied.length ||
            !timingSafeEqual(expected, supplied)
        )
            throw unauthorized("安装码不正确。");
        const encoded = await hashPassword(password);
        await db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('xboard:administrator-setup'))::text`;
            await requireUnconfigured(tx);
            await claimMailbox(tx, email, await readSettings(tx));
            const user = await tx.user.create({
                data: {
                    email,
                    emailKey: mailboxKey(email),
                    password: encoded,
                    role: "admin",
                    verifiedAt: new Date(),
                },
                select: { id: true },
            });
            await audit(tx, user.id, "admin.bootstrap", user.id, {
                source: "setup",
            });
        });
        try {
            rmSync(secretPath("setup.code"), { force: true });
        } catch {
            log("warn", "setup.code_cleanup_failed");
        }
        res.status(201).json({ ok: true });
    },
);
