import { PrismaService } from "../src/database/prisma.service";
import { hashPassword, normalizeEmail } from "../src/modules/auth/password";

async function main() {
    const db = new PrismaService();
    const email = normalizeEmail(process.env.ADMIN_EMAIL ?? "");
    const password = process.env.ADMIN_PASSWORD;
    if (!email.includes("@")) throw new Error("Set ADMIN_EMAIL.");
    try {
        const existing = await db.user.findUnique({ where: { email } });
        if (
            !existing &&
            (!password || password.length < 12 || password.length > 128)
        )
            throw new Error("Set ADMIN_PASSWORD (12–128 characters).");
        await db.$transaction(async (tx) => {
            const user = existing
                ? await tx.user.update({
                      where: { id: existing.id },
                      data: { role: "admin" },
                  })
                : await tx.user.create({
                      data: {
                          email,
                          password: await hashPassword(password!),
                          role: "admin",
                          verifiedAt: new Date(),
                      },
                  });
            await tx.audit.create({
                data: {
                    actorId: user.id,
                    action: "admin.bootstrap",
                    target: String(user.id),
                    detail: { source: "local CLI" },
                },
            });
        });
        console.log(`Administrator ready: ${email}`);
    } finally {
        await db.$disconnect();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
