-- A switch away from a permanent (never-expiring) plan has no prior expiry,
-- so "replaces a plan" can no longer be derived from "priorExpiresAt".
ALTER TABLE "Order" ADD COLUMN "replacesPlan" BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE "Order" SET "replacesPlan" = TRUE WHERE "priorExpiresAt" IS NOT NULL;
