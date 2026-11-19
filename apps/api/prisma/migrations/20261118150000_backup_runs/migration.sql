CREATE TABLE "BackupRun" (
    "id" UUID PRIMARY KEY,
    "scheduledDay" TEXT UNIQUE,
    "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','completed','failed')),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "bytes" BIGINT,
    "objects" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);
CREATE INDEX "BackupRun_createdAt_idx" ON "BackupRun"("createdAt");
