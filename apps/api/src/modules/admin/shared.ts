import type { Prisma } from "@prisma/client";
import type { PageQuery, Paged } from "@xboard/contracts";
import type { Tx } from "../../db";

/** Every admin change writes one audit row in the same transaction. */
export async function audit(
    tx: Tx,
    actorId: number,
    action: string,
    target: string | number,
    detail: Prisma.InputJsonValue = {},
) {
    await tx.audit.create({
        data: { actorId, action, target: String(target), detail },
    });
}

export function pageArgs(query: PageQuery) {
    return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function paged<T>(
    query: PageQuery,
    total: number,
    items: T[],
): Paged<T> {
    return { items, total, page: query.page, pageSize: query.pageSize };
}

/** A search term that is a whole number may also be an id. */
export function numericTerm(q: string | undefined): number | undefined {
    if (!q || !/^\d{1,10}$/.test(q)) return undefined;
    const id = Number(q);
    return id <= 2_147_483_647 ? id : undefined;
}

export const iso = (date: Date) => date.toISOString();
export const isoOrNull = (date: Date | null) =>
    date ? date.toISOString() : null;
