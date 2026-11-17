import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    hashPassword,
    normalizeEmail,
    verifyPassword,
} from "../src/modules/auth/password";

describe("password authentication", () => {
    it("uses salted scrypt and rejects incorrect passwords", async () => {
        const first = await hashPassword("a sufficiently long password");
        const second = await hashPassword("a sufficiently long password");
        assert.notEqual(first, second);
        assert.equal(
            await verifyPassword("a sufficiently long password", first),
            true,
        );
        assert.equal(await verifyPassword("wrong password", first), false);
    });
    it("rejects malformed and unsupported hashes", async () => {
        assert.equal(await verifyPassword("password", "password"), false);
        assert.equal(
            await verifyPassword("password", "scrypt-v1$bad$bad"),
            false,
        );
        assert.equal(await verifyPassword("password", "$2y$10$old"), false);
    });
    it("normalizes email case and whitespace", () => {
        assert.equal(
            normalizeEmail(" User@Example.test "),
            "user@example.test",
        );
    });
});
