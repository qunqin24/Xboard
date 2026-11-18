import type { User } from "@prisma/client";

/** The user holds a plan that has not expired (null expiry = never expires). */
export function hasActivePlan(
    user: Pick<User, "planId" | "expiredAt">,
    now = new Date(),
): boolean {
    return (
        user.planId !== null &&
        (user.expiredAt === null || user.expiredAt > now)
    );
}

/** May use proxy nodes: not banned, active plan, traffic left. */
export function canUseNodes(
    user: Pick<
        User,
        | "banned"
        | "planId"
        | "expiredAt"
        | "upload"
        | "download"
        | "transferEnable"
    >,
    now = new Date(),
): boolean {
    return (
        !user.banned &&
        hasActivePlan(user, now) &&
        user.upload + user.download < user.transferEnable
    );
}
