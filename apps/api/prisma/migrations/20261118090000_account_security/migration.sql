BEGIN;

ALTER TABLE "User"
    ADD COLUMN "totpSecret" TEXT,
    ADD COLUMN "totpLastStep" BIGINT,
    ADD COLUMN "totpRecoveryHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Session"
    ADD COLUMN "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN "userAgent" TEXT,
    ADD COLUMN "pendingTotp" TEXT,
    ADD COLUMN "pendingTotpExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Session_publicId_key" ON "Session"("publicId");

COMMIT;
