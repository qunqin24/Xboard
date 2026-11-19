-- Backups run outside a transaction: a claimed run is marked "running" first,
-- so its row survives however long the dump and uploads take.
ALTER TABLE "BackupRun" DROP CONSTRAINT "BackupRun_status_check";
ALTER TABLE "BackupRun" ADD CONSTRAINT "BackupRun_status_check"
    CHECK ("status" IN ('pending','running','completed','failed'));
ALTER TABLE "BackupRun" ADD COLUMN "startedAt" TIMESTAMP(3);
