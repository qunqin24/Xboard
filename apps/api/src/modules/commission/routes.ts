import { Router } from "express";
import {
    commissionAmountBody,
    commissionWithdrawalBody,
    uuidParam,
    withdrawalReviewBody,
} from "@xboard/contracts";
import { db } from "../../db";
import { notFound } from "../../http/errors";
import { currentUser, requireUser } from "../../http/session";
import { parse } from "../../http/validate";
import { adminActorId, adminRead, adminWrite } from "../admin/operations";
import { audit } from "../admin/shared";
import {
    commissionSettings,
    myCommission,
    receiver,
    requestWithdrawal,
    reviewWithdrawal,
    saveCommissionSettings,
    transferCommission,
    withdrawalView,
} from "./service";

export const commissionRoutes = Router();
commissionRoutes.use("/account/commission", requireUser);
commissionRoutes.get("/account/commission", async (req, res) => {
    res.json(await myCommission(currentUser(req).id));
});
commissionRoutes.post("/account/commission/transfer", async (req, res) => {
    res.json(
        await transferCommission(
            currentUser(req).id,
            parse(commissionAmountBody, req.body),
        ),
    );
});
commissionRoutes.post("/account/commission/withdrawals", async (req, res) => {
    res.status(201).json(
        await requestWithdrawal(
            currentUser(req).id,
            parse(commissionWithdrawalBody, req.body),
        ),
    );
});

export const commissionAdminRoutes = Router();
commissionAdminRoutes.get(
    "/settings/commission",
    adminRead(() => commissionSettings()),
);
commissionAdminRoutes.put(
    "/settings/commission",
    adminWrite(200, (req, tx) =>
        saveCommissionSettings(tx, adminActorId(req), req.body),
    ),
);
commissionAdminRoutes.get(
    "/withdrawals",
    adminRead(async () => {
        const records = await db.withdrawal.findMany({
            orderBy: [{ status: "asc" }, { createdAt: "desc" }],
            take: 100,
            include: { user: { select: { email: true } } },
        });
        return records.map((row) => ({
            ...withdrawalView(row),
            email: row.user.email,
        }));
    }),
);
commissionAdminRoutes.post(
    "/withdrawals/:id/recipient",
    adminWrite(200, async (req, tx) => {
        const id = parse(uuidParam, req.params.id);
        const row = await tx.withdrawal.findUnique({ where: { id } });
        if (!row) throw notFound("提现申请不存在。");
        await audit(tx, adminActorId(req), "commission.recipient_access", id);
        return { recipient: receiver(row) };
    }),
);
commissionAdminRoutes.put(
    "/withdrawals/:id",
    adminWrite(200, (req, tx) =>
        reviewWithdrawal(
            tx,
            adminActorId(req),
            parse(uuidParam, req.params.id),
            parse(withdrawalReviewBody, req.body),
        ),
    ),
);
