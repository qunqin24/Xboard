BEGIN;

ALTER TABLE "OpsWriteRequest"
    ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "OpsWriteRequest_createdAt_idx" ON "OpsWriteRequest"("createdAt");

COMMIT;
