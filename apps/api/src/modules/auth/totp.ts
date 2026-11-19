import {
    createHash,
    createHmac,
    randomBytes,
    timingSafeEqual,
} from "node:crypto";
import type { User } from "@prisma/client";
import {
    openApplicationSecret,
    sealApplicationSecret,
} from "../system/secrets";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function encodeSecret(data: Buffer) {
    let bits = 0;
    let value = 0;
    let result = "";
    for (const byte of data) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            result += BASE32[(value >>> bits) & 31];
        }
    }
    if (bits) result += BASE32[(value << (5 - bits)) & 31];
    return result;
}

/**
 * The provisioning URI authenticator apps read from a QR code. Parts are
 * percent-encoded; the colon between issuer and account stays literal.
 */
export function otpauthUri(issuer: string, account: string, secret: string) {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
    const query = new URLSearchParams({
        secret,
        issuer,
        algorithm: "SHA1",
        digits: "6",
        period: "30",
    });
    return `otpauth://totp/${label}?${query.toString().replaceAll("+", "%20")}`;
}

function totpAt(secret: Buffer, step: bigint) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(step);
    const hash = createHmac("sha1", secret).update(counter).digest();
    const offset = hash[hash.length - 1]! & 0xf;
    return ((hash.readUInt32BE(offset) & 0x7fff_ffff) % 1_000_000)
        .toString()
        .padStart(6, "0");
}

/** RFC 6238, six digits, 30-second steps and one step of clock skew. */
export function verifyTotp(
    secret: Buffer,
    code: string,
    usedStep: bigint | null,
    now = Date.now(),
) {
    if (!/^\d{6}$/.test(code)) return null;
    const step = BigInt(Math.floor(now / 30_000));
    const supplied = Buffer.from(code);
    for (const candidate of [step, step - 1n, step + 1n]) {
        if (
            candidate >= 0 &&
            candidate > (usedStep ?? -1n) &&
            timingSafeEqual(Buffer.from(totpAt(secret, candidate)), supplied)
        )
            return candidate;
    }
    return null;
}

export function sealSecret(userId: number, secret: Buffer) {
    return sealApplicationSecret(`totp:${userId}`, secret);
}

export function openSecret(userId: number, encrypted: string) {
    return openApplicationSecret(`totp:${userId}`, encrypted);
}

const digest = (code: string) =>
    createHash("sha256")
        .update(code.replaceAll("-", "").toUpperCase())
        .digest("hex");

export function makeRecoveryCodes() {
    const codes = Array.from({ length: 8 }, () =>
        randomBytes(8).toString("hex").toUpperCase().match(/.{4}/g)!.join("-"),
    );
    return { codes, hashes: codes.map(digest) };
}

export function factorUpdate(user: User, code: string, now: Date) {
    if (!user.totpSecret) return null;
    if (/^\d{6}$/.test(code)) {
        const step = verifyTotp(
            openSecret(user.id, user.totpSecret),
            code,
            user.totpLastStep,
            now.getTime(),
        );
        return step === null ? null : { totpLastStep: step };
    }
    const hash = digest(code);
    const unused = user.totpRecoveryHashes.filter((value) => value !== hash);
    return unused.length === user.totpRecoveryHashes.length
        ? null
        : { totpRecoveryHashes: unused };
}
