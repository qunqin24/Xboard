// Create an administrator, or promote an existing account.
// Promotion also replaces the password and signs the account out everywhere,
// so whoever held the account before cannot keep using it as an admin.
import { closeDb, db } from "../src/db";
import { hashPassword, normalizeEmail } from "../src/modules/auth/password";
import { revokeAccess } from "../src/modules/auth/service";

async function main() {
    const email = normalizeEmail(process.env.ADMIN_EMAIL ?? "");
    const password = process.env.ADMIN_PASSWORD;
    if (!email.includes("@")) throw new Error("Set ADMIN_EMAIL.");
    if (!password || password.length < 12 || password.length > 128)
        throw new Error("Set ADMIN_PASSWORD (12–128 characters).");
    const encoded = await hashPassword(password);
    try {
        await db.$transaction(async (tx) => {
            const existing = await tx.user.findUnique({ where: { email } });
            const user = existing
                ? await tx.user.update({
                      where: { id: existing.id },
                      data: {
                          role: "admin",
                          password: encoded,
                          verifiedAt: existing.verifiedAt ?? new Date(),
                      },
                  })
                : await tx.user.create({
                      data: {
                          email,
                          password: encoded,
                          role: "admin",
                          verifiedAt: new Date(),
                      },
                  });
            if (existing) await revokeAccess(tx, user.id);
            await tx.audit.create({
                data: {
                    actorId: user.id,
                    action: "admin.bootstrap",
                    target: String(user.id),
                    detail: { source: "local CLI", promoted: !!existing },
                },
            });
        });
        console.log(`Administrator ready: ${email}`);
    } finally {
        await closeDb();
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
