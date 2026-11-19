-- Payment callbacks are verified with the gateway's current secrets. Drop the
-- per-attempt copies so a rotated key no longer verifies older attempts.
ALTER TABLE "PaymentAttempt" ALTER COLUMN "secrets" DROP NOT NULL;
UPDATE "PaymentAttempt" SET "secrets" = NULL;
