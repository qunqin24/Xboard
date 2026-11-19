import express, { Router } from "express";
import { telegramSettingsBody } from "@xboard/contracts";
import { rateLimit } from "../../http/rate-limit";
import { currentUser, requireUser } from "../../http/session";
import { parse } from "../../http/validate";
import {
    configureTelegram,
    createTelegramLink,
    disconnectTelegram,
    processTelegramUpdate,
    telegramAccount,
    telegramSettings,
} from "./service";

export const telegramRoutes = Router();
telegramRoutes.use("/account/telegram", requireUser);
telegramRoutes.get("/account/telegram", async (req, res) => {
    res.json(await telegramAccount(currentUser(req).id));
});
telegramRoutes.post("/account/telegram/link", async (req, res) => {
    res.json(await createTelegramLink(currentUser(req).id));
});
telegramRoutes.delete("/account/telegram", async (req, res) => {
    res.json(await disconnectTelegram(currentUser(req).id));
});

export const telegramAdminRoutes = Router();
telegramAdminRoutes.get("/settings/telegram", async (_req, res) => {
    const settings = await telegramSettings();
    res.json(
        settings.tokenSet ? settings : { tokenSet: false, username: null },
    );
});
telegramAdminRoutes.put("/settings/telegram", async (req, res) => {
    const { telegramBotToken } = parse(telegramSettingsBody, req.body);
    res.json(await configureTelegram(currentUser(req).id, telegramBotToken));
});

export const telegramWebhook = Router();
telegramWebhook.post(
    "/webhook",
    rateLimit({ limit: 240, windowMs: 60_000, scope: "telegram-webhook" }),
    express.json({ limit: "128kb" }),
    async (req, res) => {
        await processTelegramUpdate(
            req.get("X-Telegram-Bot-Api-Secret-Token") ?? "",
            req.body,
        );
        res.sendStatus(200);
    },
);
