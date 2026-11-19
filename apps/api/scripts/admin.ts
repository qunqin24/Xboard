import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { emailSchema, registerBody } from "@xboard/contracts";
// Create an administrator, or promote an existing account.
// Promotion also replaces the password and signs the account out everywhere,
// so whoever held the account before cannot keep using it as an admin.
import { closeDb, db } from "../src/db";
import { hashPassword } from "../src/modules/auth/password";
import { revokeAccess } from "../src/modules/auth/service";

async function main() {
    let silent = false;
    const terminal = process.stdin.isTTY && process.stdout.isTTY;
    const output = new Writable({
        write(chunk, _encoding, done) {
            if (!silent) process.stdout.write(chunk);
            done();
        },
    });
    const prompt = createInterface({ input: process.stdin, output, terminal });
    let email: string;
    let password: string;
    try {
        email = emailSchema.parse(
            await prompt.question("Administrator email: "),
        );
        process.stdout.write("Administrator password: ");
        silent = true;
        password = registerBody.shape.password.parse(await prompt.question(""));
    } finally {
        prompt.close();
        if (terminal) process.stdout.write("\n");
    }
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
