-- Unix-second integers overflow int4 in 2038; store real timestamps (UTC, like every other DateTime).
ALTER TABLE "User"
    ALTER COLUMN "expiredAt" TYPE TIMESTAMP(3) USING (to_timestamp("expiredAt") AT TIME ZONE 'UTC'),
    ALTER COLUMN "lastLoginAt" TYPE TIMESTAMP(3) USING (to_timestamp("lastLoginAt") AT TIME ZONE 'UTC');

-- Why the last delivery attempt failed, shown in the admin mail queue.
ALTER TABLE "Mail" ADD COLUMN "lastError" TEXT;
