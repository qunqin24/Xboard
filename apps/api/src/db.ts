import { Prisma, PrismaClient } from "@prisma/client";
import { getConfig } from "./config";

export type Tx = Prisma.TransactionClient;

let client: PrismaClient | undefined;

/**
 * Created on first use, not at import time: tests point DATABASE_URL at their
 * own schema in before(), after this module has been imported.
 */
export function getDb(): PrismaClient {
    client ??= new PrismaClient({
        datasources: { db: { url: getConfig().databaseUrl } },
    });
    return client;
}

/** The shared Prisma client. Same API as PrismaClient; connects lazily. */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
    get(_target, property) {
        const instance = getDb();
        const value = Reflect.get(instance, property, instance);
        return typeof value === "function" ? value.bind(instance) : value;
    },
});

export async function closeDb() {
    await client?.$disconnect();
    client = undefined;
}

/** Row lock on one user, held until the transaction ends. */
export async function lockUser(tx: Tx, userId: number) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}
