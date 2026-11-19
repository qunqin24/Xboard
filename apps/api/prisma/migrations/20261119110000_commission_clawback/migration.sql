-- When a plan switch credits an order's unused value back to the buyer, the
-- inviter's reward for that order is clawed back in proportion.
ALTER TYPE "CommissionKind" ADD VALUE 'clawback';
ALTER TABLE "CommissionEntry" ADD COLUMN "sourceOrderId" UUID
    REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CommissionEntry_sourceOrderId_idx" ON "CommissionEntry" ("sourceOrderId");
-- Compare as text: a new enum value cannot be referenced in the same transaction.
ALTER TABLE "CommissionEntry" DROP CONSTRAINT "CommissionEntry_sign";
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_sign" CHECK (
    ("kind"::text IN ('reward', 'reversal') AND "amountMinor" > 0) OR
    ("kind"::text IN ('transfer', 'withdrawal', 'clawback') AND "amountMinor" < 0)
);
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_clawback_source" CHECK (
    ("kind"::text = 'clawback') = ("sourceOrderId" IS NOT NULL)
);
