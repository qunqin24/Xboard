import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    randomUUID,
} from "node:crypto";
import {
    linkSync,
    mkdirSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { appDirectory } from "../../config";

export function secretPath(name: "app.key" | "setup.code") {
    return resolve(
        process.env.APP_DATA_DIR ?? resolve(appDirectory, ".data"),
        "secrets",
        name,
    );
}

export function installationSecret(name: "app.key" | "setup.code") {
    const path = secretPath(name);
    try {
        return readFileSync(path, "utf8").trim();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}`;
    const value = randomBytes(32).toString("base64url");
    writeFileSync(temporary, `${value}\n`, {
        mode: 0o600,
        flag: "wx",
        flush: true,
    });
    try {
        // Install a complete file atomically across workers sharing the data volume.
        linkSync(temporary, path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    } finally {
        unlinkSync(temporary);
    }
    return readFileSync(path, "utf8").trim();
}

export function applicationKey() {
    const key = installationSecret("app.key");
    if (
        !/^[A-Za-z0-9_-]{43}$/.test(key) ||
        Buffer.from(key, "base64url").length !== 32
    )
        throw new Error("The application key file is invalid.");
    return key;
}

export function sealApplicationSecret(context: string, secret: Buffer) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv(
        "aes-256-gcm",
        Buffer.from(applicationKey(), "base64url"),
        nonce,
    );
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString(
        "base64url",
    );
}

export function openApplicationSecret(context: string, sealed: string) {
    const data = Buffer.from(sealed, "base64url");
    const cipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(applicationKey(), "base64url"),
        data.subarray(0, 12),
    );
    cipher.setAAD(Buffer.from(context));
    cipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]);
}
