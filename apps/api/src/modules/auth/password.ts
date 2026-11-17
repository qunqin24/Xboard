import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export function normalizeEmail(value: string): string {
    return value.trim().normalize("NFC").toLowerCase();
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(
            password,
            salt,
            64,
            { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
            (error, key) => (error ? reject(error) : resolve(key)),
        );
    });
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await derive(password, salt);
    return `scrypt-v1$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(
    password: string,
    encoded: string,
): Promise<boolean> {
    if (!/^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded)) return false;
    const [, salt, key] = encoded.split("$");
    return timingSafeEqual(
        await derive(password, Buffer.from(salt!, "hex")),
        Buffer.from(key!, "hex"),
    );
}
