-- Deliberately no BEGIN/COMMIT: Prisma sends this file as one multi-statement
-- query, which PostgreSQL runs as a single transaction and stops at the first
-- error, so the message raised below is the one the operator sees.
--
-- The constraints below reject rows that older releases allowed. Refuse to
-- migrate when any exist: money and traffic data is never rewritten silently.
-- Resolve each reported table first (docs/typescript-deployment.md lists the
-- same checks and the cleanup to run), then re-run the migration.
DO $$
DECLARE
    rule RECORD;
    bad BIGINT;
BEGIN
    FOR rule IN
        SELECT * FROM (VALUES
            ('PlanPrice', '"amountMinor" <= 0',
             'review each price, then UPDATE "PlanPrice" SET "amountMinor" = <positive minor units> WHERE ... or DELETE the price row'),
            ('User', '"balance" < 0',
             'investigate the ledger (BalanceEntry) and correct "balance" through an audited adjustment'),
            ('User', '"transferEnable" < 0 OR "upload" < 0 OR "download" < 0',
             'UPDATE "User" SET "transferEnable" = GREATEST("transferEnable", 0), "upload" = GREATEST("upload", 0), "download" = GREATEST("download", 0) WHERE "transferEnable" < 0 OR "upload" < 0 OR "download" < 0'),
            ('Plan', '"transferEnable" <= 0',
             'set a positive "transferEnable" on each plan (soft-deleted plans included), or hard-delete plans nothing references'),
            ('TrafficRecord', '"upload" < 0 OR "download" < 0',
             'DELETE FROM "TrafficRecord" WHERE "upload" < 0 OR "download" < 0 (usage history only, no balance impact)'),
            ('Order', '"amountMinor" < 0 OR "durationDays" <= 0 OR "transferBytes" <= 0',
             'inspect the listed orders and correct the snapshot, or archive them; do not delete paid orders')
        ) AS r(tbl, violation, cleanup)
    LOOP
        EXECUTE format('SELECT count(*) FROM %I WHERE %s', rule.tbl, rule.violation) INTO bad;
        IF bad > 0 THEN
            RAISE EXCEPTION 'billing migration blocked: table "%" has % row(s) matching (%). Cleanup: %',
                rule.tbl, bad, rule.violation, rule.cleanup;
        END IF;
    END LOOP;
END
$$;

CREATE TYPE "TrafficResetMode" AS ENUM ('none', 'activation_day', 'month_start');
CREATE TYPE "OrderKind" AS ENUM ('subscription', 'traffic_reset');

ALTER TABLE "User"
    ADD COLUMN "entitlementVersion" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "trafficResetMode" "TrafficResetMode" NOT NULL DEFAULT 'none',
    ADD COLUMN "trafficResetDay" INTEGER,
    ADD COLUMN "nextTrafficResetAt" TIMESTAMP(3),
    ADD COLUMN "expiryReminderMask" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "trafficReminderMask" INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT "User_balance_nonnegative" CHECK ("balance" >= 0),
    ADD CONSTRAINT "User_traffic_nonnegative" CHECK ("transferEnable" >= 0 AND "upload" >= 0 AND "download" >= 0),
    ADD CONSTRAINT "User_traffic_reset_schedule" CHECK (
        ("trafficResetMode" = 'none' AND "trafficResetDay" IS NULL AND "nextTrafficResetAt" IS NULL)
        OR ("trafficResetMode" <> 'none' AND "trafficResetDay" IS NOT NULL
            AND "trafficResetDay" BETWEEN 1 AND 31 AND "nextTrafficResetAt" IS NOT NULL)
    );

ALTER TABLE "Plan"
    ADD COLUMN "trafficResetMode" "TrafficResetMode" NOT NULL DEFAULT 'none',
    ADD COLUMN "trafficResetPriceMinor" INTEGER,
    ADD CONSTRAINT "Plan_traffic_positive" CHECK ("transferEnable" > 0),
    ADD CONSTRAINT "Plan_traffic_reset_price_positive" CHECK ("trafficResetPriceMinor" > 0);

ALTER TABLE "PlanPrice"
    ADD CONSTRAINT "PlanPrice_amount_positive" CHECK ("amountMinor" > 0);

ALTER TABLE "Order"
    ALTER COLUMN "period" DROP NOT NULL,
    ADD COLUMN "kind" "OrderKind" NOT NULL DEFAULT 'subscription',
    ADD COLUMN "creditMinor" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "trafficResetMode" "TrafficResetMode" NOT NULL DEFAULT 'none',
    ADD COLUMN "entitlementVersion" INTEGER,
    ADD COLUMN "priorExpiresAt" TIMESTAMP(3),
    ADD COLUMN "serviceUntil" TIMESTAMP(3),
    ADD CONSTRAINT "Order_amount_nonnegative" CHECK ("amountMinor" >= 0 AND "creditMinor" >= 0),
    ADD CONSTRAINT "Order_snapshot_matches_kind" CHECK (
        ("kind" = 'subscription' AND "period" IS NOT NULL AND "durationDays" > 0 AND "transferBytes" > 0)
        OR ("kind" = 'traffic_reset' AND "period" IS NULL AND "durationDays" = 0
            AND "transferBytes" = 0 AND "amountMinor" > 0 AND "creditMinor" = 0)
    );

ALTER TABLE "TrafficRecord"
    ALTER COLUMN "id" TYPE BIGINT,
    ADD CONSTRAINT "TrafficRecord_traffic_nonnegative" CHECK ("upload" >= 0 AND "download" >= 0);
ALTER SEQUENCE "TrafficRecord_id_seq" AS BIGINT NO MAXVALUE;

CREATE INDEX "User_nextTrafficResetAt_idx" ON "User"("nextTrafficResetAt");
CREATE INDEX "Order_userId_entitlementVersion_idx" ON "Order"("userId", "entitlementVersion");
