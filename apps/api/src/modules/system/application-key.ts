import { db, type Tx } from "../../db";
import { log } from "../../logging";
import {
    applicationKey,
    applicationKeyExists,
    createSecretFile,
    openApplicationSecret,
    sealApplicationSecret,
    secretPath,
} from "./secrets";

/** A known value sealed with the key, so a key from another install is caught. */
export const KEY_CHECK_SETTING = "applicationKeyCheck";
const KEY_CHECK_CONTEXT = "application-key-check";
const KEY_CHECK_VALUE = "xboard";

/** Every setting stored with sealApplicationSecret under `setting:<key>`. */
export const SEALED_SETTINGS = [
    "smtpPassword",
    "alertWebhookUrl",
    "backupSecretAccessKey",
    "captchaSecretKey",
    "telegramBotToken",
    "telegramWebhookSecret",
] as const;

const RECOVERY_DOCS = "docs/typescript-deployment.md#应用密钥";

export class ApplicationKeyError extends Error {}

/** One sealed value from the database, with the context it was sealed under. */
async function sealedSample(
    tx: Tx,
): Promise<{ context: string; value: string } | undefined> {
    const user = await tx.user.findFirst({
        where: { totpSecret: { not: null } },
        select: { id: true, totpSecret: true },
    });
    if (user?.totpSecret)
        return { context: `totp:${user.id}`, value: user.totpSecret };
    const setting = await tx.setting.findFirst({
        where: { key: { in: [...SEALED_SETTINGS] } },
    });
    if (typeof setting?.value === "string")
        return { context: `setting:${setting.key}`, value: setting.value };
    const gateway = await tx.paymentGateway.findFirst({
        where: { secrets: { not: "" } },
        select: { secrets: true },
    });
    if (gateway) return { context: "payment-gateway", value: gateway.secrets };
    const withdrawal = await tx.withdrawal.findFirst({
        select: { id: true, recipient: true },
    });
    if (withdrawal)
        return {
            context: `withdrawal:${withdrawal.id}`,
            value: withdrawal.recipient,
        };
    const session = await tx.session.findFirst({
        where: { pendingTotp: { not: null } },
        select: { userId: true, pendingTotp: true },
    });
    if (session?.pendingTotp)
        return {
            context: `totp:${session.userId}`,
            value: session.pendingTotp,
        };
    return undefined;
}

function opens(context: string, value: string) {
    try {
        openApplicationSecret(context, value);
        return true;
    } catch {
        return false;
    }
}

function refuse(event: string, message: string): never {
    log("error", event, { path: secretPath("app.key"), help: RECOVERY_DOCS });
    throw new ApplicationKeyError(message);
}

/**
 * Run once at startup, before serving requests. A fresh install gets a new
 * key; an install that already holds sealed data must bring its own key, and
 * that key must open the data.
 */
export async function prepareApplicationKey(tx: Tx = db) {
    const check = await tx.setting.findUnique({
        where: { key: KEY_CHECK_SETTING },
    });
    if (!applicationKeyExists()) {
        if (check || (await sealedSample(tx)))
            refuse(
                "app_key.missing",
                "The application key file is missing but the database holds data sealed with it. Restore app.key from a backup, or run the key reset script if it is lost.",
            );
        createSecretFile("app.key");
        log("info", "app_key.created", { path: secretPath("app.key") });
    }
    applicationKey();
    if (typeof check?.value === "string") {
        if (!opens(KEY_CHECK_CONTEXT, check.value))
            refuse(
                "app_key.mismatch",
                "The application key file does not belong to this database.",
            );
        return;
    }
    const sample = await sealedSample(tx);
    if (sample && !opens(sample.context, sample.value))
        refuse(
            "app_key.mismatch",
            "The application key file does not belong to this database.",
        );
    await storeKeyCheck(tx);
}

export async function storeKeyCheck(tx: Tx) {
    const value = sealApplicationSecret(
        KEY_CHECK_CONTEXT,
        Buffer.from(KEY_CHECK_VALUE),
    );
    await tx.setting.upsert({
        where: { key: KEY_CHECK_SETTING },
        create: { key: KEY_CHECK_SETTING, value },
        update: { value },
    });
}
