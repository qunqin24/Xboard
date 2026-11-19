BEGIN;
CREATE TYPE "CommissionKind" AS ENUM ('reward', 'transfer', 'withdrawal', 'reversal');
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'paid', 'rejected');
CREATE TABLE "Withdrawal" (
    "id" UUID PRIMARY KEY,
    "userId" INTEGER NOT NULL REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "requestId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL CHECK ("amountMinor" > 0),
    "method" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "reviewedBy" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Withdrawal_userId_requestId_key" ON "Withdrawal" ("userId", "requestId");
CREATE INDEX "Withdrawal_status_createdAt_idx" ON "Withdrawal" ("status", "createdAt");
CREATE TABLE "CommissionEntry" (
    "id" UUID PRIMARY KEY,
    "userId" INTEGER NOT NULL REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "kind" "CommissionKind" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "orderId" UUID REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "requestId" UUID,
    "withdrawalId" UUID REFERENCES "Withdrawal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionEntry_sign" CHECK (
        ("kind" IN ('reward', 'reversal') AND "amountMinor" > 0) OR
        ("kind" IN ('transfer', 'withdrawal') AND "amountMinor" < 0)
    )
);
CREATE UNIQUE INDEX "CommissionEntry_orderId_key" ON "CommissionEntry" ("orderId");
CREATE UNIQUE INDEX "CommissionEntry_userId_requestId_key" ON "CommissionEntry" ("userId", "requestId");
CREATE UNIQUE INDEX "CommissionEntry_withdrawalId_kind_key" ON "CommissionEntry" ("withdrawalId", "kind");
CREATE INDEX "CommissionEntry_userId_createdAt_idx" ON "CommissionEntry" ("userId", "createdAt");
COMMIT;
