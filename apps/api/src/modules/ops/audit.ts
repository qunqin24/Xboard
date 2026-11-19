import { randomUUID } from "node:crypto";
import type { OpsToken, Prisma } from "@prisma/client";
import {
    idParam,
    mailTemplateKey,
    OPS_API_PREFIX,
    opsEndpoints,
    templateFormatSchema,
    uuidParam,
} from "@xboard/contracts";
import type { Request, Response } from "express";
import type { Tx } from "../../db";

export interface OpsCall {
    token?: OpsToken;
    replayKey?: Buffer;
    clientIp?: string;
    endpoint?: string;
    requestId: string;
    summary?: Prisma.InputJsonObject;
}

declare global {
    namespace Express {
        interface Request {
            ops?: OpsCall;
        }
    }
}

const routes = opsEndpoints.map(({ method, path }) => ({
    method: method.toUpperCase(),
    path,
    matches: new RegExp(`^${path.replace(/:\w+/g, "[^/]+")}/?$`, "i"),
}));

/** Keep a route template even when authentication fails before routing. */
export function startOpsCall(req: Request, res: Response): OpsCall {
    const method = req.method === "HEAD" ? "GET" : req.method;
    const endpoint = routes.find(
        (route) => route.method === method && route.matches.test(req.path),
    );
    const header = res.getHeader("X-Request-Id");
    const requestId = typeof header === "string" ? header : randomUUID();
    res.setHeader("X-Request-Id", requestId);
    return (req.ops = {
        endpoint: endpoint?.path,
        requestId,
    });
}

export function markOpsRoute(req: Request) {
    if (!req.ops) return;
    if (typeof req.route?.path === "string") req.ops.endpoint = req.route.path;

    const summary: Record<string, Prisma.InputJsonValue> = {};
    const { id, key, format } = req.params;
    if (
        typeof id === "string" &&
        (idParam.safeParse(id).success || uuidParam.safeParse(id).success)
    )
        summary.id = id;
    if (typeof key === "string" && mailTemplateKey.safeParse(key).success)
        summary.key = key;
    if (
        typeof format === "string" &&
        templateFormatSchema.safeParse(format).success
    )
        summary.format = format;
    for (const field of ["page", "pageSize", "days", "topDays"] as const) {
        const value = req.query[field];
        if (typeof value === "string" && /^\d{1,6}$/.test(value))
            summary[field] = Number(value);
    }
    if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
        const body = req.body as Record<string, unknown>;
        summary.bodyFields = Object.keys(body).length;
        for (const field of [
            "userId",
            "planId",
            "amountMinor",
            "maxUses",
        ] as const) {
            const value = body[field];
            if (typeof value === "number" && Number.isSafeInteger(value))
                summary[field] = value;
        }
        for (const field of [
            "enabled",
            "banned",
            "published",
            "closed",
        ] as const) {
            const value = body[field];
            if (typeof value === "boolean") summary[field] = value;
        }
        if (Array.isArray(body.ids)) summary.targetCount = body.ids.length;
    }
    req.ops.summary = summary;
}

export function opsAuditDetail(
    req: Request,
    status: number,
    replayed = false,
): Prisma.InputJsonObject {
    const context = req.ops!;
    return {
        method: req.method,
        endpoint: context.endpoint
            ? `${OPS_API_PREFIX}${context.endpoint}`
            : null,
        tokenName: context.token?.name ?? null,
        status,
        replayed,
        requestId: context.requestId,
        params: context.summary ?? {},
    };
}

export function recordOpsCall(
    tx: Tx,
    req: Request,
    status: number,
    replayed = false,
) {
    const detail = opsAuditDetail(req, status, replayed);
    return tx.audit.create({
        data: {
            action: "ops.request",
            actorId: req.ops?.token?.createdById ?? 0,
            target: `${req.method} ${detail.endpoint ?? OPS_API_PREFIX}`,
            opsTokenId: req.ops?.token?.id,
            detail,
        },
        select: { id: true },
    });
}
