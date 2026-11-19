BEGIN;

ALTER TABLE "User"
    ADD COLUMN "trafficResetMonth" INTEGER,
    ADD CONSTRAINT "User_annual_traffic_reset_month" CHECK (
        ("trafficResetMode" IN ('year_start', 'activation_anniversary')
            AND "trafficResetMonth" IS NOT NULL AND "trafficResetMonth" BETWEEN 1 AND 12)
        OR ("trafficResetMode" NOT IN ('year_start', 'activation_anniversary') AND "trafficResetMonth" IS NULL)
    );

ALTER TABLE "Order"
    DROP CONSTRAINT "Order_snapshot_matches_kind",
    ADD CONSTRAINT "Order_snapshot_matches_kind" CHECK (
        ("kind" = 'subscription' AND "period" IS NOT NULL AND "transferBytes" > 0 AND (
            ("period" = 'onetime' AND "durationDays" = 0 AND "serviceUntil" IS NULL)
            OR ("period" <> 'onetime' AND "durationDays" > 0)
        ))
        OR ("kind" = 'traffic_reset' AND "period" IS NULL AND "durationDays" = 0
            AND "transferBytes" = 0 AND "amountMinor" > 0 AND "creditMinor" = 0)
    );

COMMIT;
