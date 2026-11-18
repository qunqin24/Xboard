import type { Request, RequestHandler, Response } from "express";
import { db, type Tx } from "../../db";
import { currentUser } from "../../http/session";
import { markOpsRoute, recordOpsCall } from "../ops/audit";
import { executeOpsWrite, serializeOpsBody } from "../ops/requests";

export function adminActorId(req: Request) {
    return req.ops?.token?.createdById ?? currentUser(req).id;
}

function sendOpsJson(res: Response, status: number, body: string) {
    // The no-store API returns the audited status even on conditional GETs.
    res.status(status)
        .set({
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": String(Buffer.byteLength(body)),
        })
        .end(body);
}

/** Share the operation between the admin UI and the Bearer API. */
export function adminRead(
    read: (req: Request) => Promise<unknown>,
): RequestHandler {
    return async (req, res) => {
        markOpsRoute(req);
        const result = await read(req);
        if (!req.ops) {
            res.json(result);
            return;
        }
        const body = serializeOpsBody(result);
        await recordOpsCall(db, req, 200);
        sendOpsJson(res, 200, body);
    };
}

/** The handler uses this transaction for all database effects and returns JSON. */
export function adminWrite(
    status: 200 | 201,
    write: (req: Request, tx: Tx) => Promise<unknown>,
    options?: { timeout: number },
): RequestHandler {
    return async (req, res) => {
        if (!req.ops) {
            const result = await db.$transaction(
                (tx) => write(req, tx),
                options,
            );
            res.status(status).json(result);
            return;
        }
        markOpsRoute(req);
        const result = await executeOpsWrite(req, status, (tx) =>
            write(req, tx),
        );
        if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
        sendOpsJson(res, result.status, result.body);
    };
}
