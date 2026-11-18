import { Prisma } from "@prisma/client";
import type { Invite } from "@xboard/contracts";
import { db } from "../../db";
import { newInviteCode } from "../auth/registration";

/** "alice@example.com" → "al***@example.com". */
export function maskEmail(email: string): string {
    const at = email.lastIndexOf("@");
    const local = email.slice(0, at);
    return `${local.slice(0, local.length > 2 ? 2 : 1)}***${email.slice(at)}`;
}

/** Store a fresh code; a clash with another user's code retries. */
async function assignCode(userId: number): Promise<string> {
    for (let attempt = 0; ; attempt++) {
        const code = newInviteCode();
        try {
            await db.user.update({
                where: { id: userId },
                data: { inviteCode: code },
            });
            return code;
        } catch (error) {
            const clash =
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002";
            if (!clash || attempt >= 4) throw error;
        }
    }
}

/** The user's invite code (created on first view) and who used it. */
export async function getInvite(userId: number): Promise<Invite> {
    const user = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { inviteCode: true },
    });
    const code = user.inviteCode ?? (await assignCode(userId));
    const [invitedCount, recent] = await Promise.all([
        db.user.count({ where: { invitedById: userId } }),
        db.user.findMany({
            where: { invitedById: userId },
            orderBy: { id: "desc" },
            take: 20,
            select: { email: true, createdAt: true },
        }),
    ]);
    return {
        code,
        invitedCount,
        recent: recent.map((u) => ({
            email: maskEmail(u.email),
            createdAt: u.createdAt.toISOString(),
        })),
    };
}

/** Replace the code; links with the old one stop working. */
export async function resetInvite(userId: number): Promise<Invite> {
    await assignCode(userId);
    return getInvite(userId);
}
