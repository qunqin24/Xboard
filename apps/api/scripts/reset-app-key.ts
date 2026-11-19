// Last resort when app.key is lost for good: drop everything sealed with it,
// install a new key and record what was cleared. Restore the key from a backup
// instead whenever one exists; this cannot be undone.
import { rmSync } from "node:fs";
import { closeDb, db } from "../src/db";
import { audit } from "../src/modules/admin/shared";
import {
    SEALED_SETTINGS,
    KEY_CHECK_SETTING,
    storeKeyCheck,
} from "../src/modules/system/application-key";
import {
    createSecretFile,
    sealApplicationSecret,
    secretPath,
} from "../src/modules/system/secrets";

const LOST_RECIPIENT = "收款信息已随应用密钥重置丢失，请联系用户重新提供。";

async function main() {
    if (!process.argv.includes("--confirm")) {
        process.stdout.write(
            "This clears two-step verification for every account, all saved\n" +
                "service secrets (SMTP, alert webhook, backup storage, captcha,\n" +
                "Telegram), payment gateway credentials and withdrawal recipients,\n" +
                "then creates a new application key.\n" +
                "Restore app.key from a backup instead if you can.\n" +
                "Run again with --confirm to proceed.\n",
        );
        process.exitCode = 2;
        return;
    }
    rmSync(secretPath("app.key"), { force: true });
    createSecretFile("app.key");
    const cleared = await db.$transaction(async (tx) => {
        const users = await tx.user.updateMany({
            where: { totpSecret: { not: null } },
            data: {
                totpSecret: null,
                totpLastStep: null,
                totpRecoveryHashes: [],
            },
        });
        await tx.session.updateMany({
            where: { pendingTotp: { not: null } },
            data: { pendingTotp: null, pendingTotpExpiresAt: null },
        });
        const settings = await tx.setting.deleteMany({
            where: { key: { in: [...SEALED_SETTINGS, KEY_CHECK_SETTING] } },
        });
        const gateways = await tx.paymentGateway.updateMany({
            where: { secrets: { not: "" } },
            data: { secrets: "", enabled: false },
        });
        const withdrawals = await tx.withdrawal.findMany({
            select: { id: true },
        });
        for (const { id } of withdrawals)
            await tx.withdrawal.update({
                where: { id },
                data: {
                    recipient: sealApplicationSecret(
                        `withdrawal:${id}`,
                        Buffer.from(LOST_RECIPIENT),
                    ),
                },
            });
        await storeKeyCheck(tx);
        const detail = {
            twoFactorAccounts: users.count,
            settings: settings.count,
            paymentGateways: gateways.count,
            withdrawals: withdrawals.length,
        };
        await audit(tx, 0, "system.app_key_reset", "app.key", detail);
        return detail;
    });
    process.stdout.write(
        `New application key installed. Cleared: ${JSON.stringify(cleared)}\n`,
    );
}

main()
    .catch((error: unknown) => {
        process.stderr.write(
            `Reset failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
    })
    .finally(() => closeDb());
