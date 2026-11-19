BEGIN;
CREATE TYPE "PaymentKind" AS ENUM ('epay', 'stripe');
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'settled', 'credited', 'review');
CREATE TABLE "PaymentGateway" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT,
    "feePercentBasisPoints" INTEGER NOT NULL DEFAULT 0 CHECK ("feePercentBasisPoints" BETWEEN 0 AND 10000),
    "feeFixedMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("feeFixedMinor" >= 0),
    "config" JSONB NOT NULL,
    "secrets" TEXT NOT NULL
);
CREATE TABLE "PaymentAttempt" (
    "id" UUID PRIMARY KEY,
    "orderId" UUID NOT NULL REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "gatewayId" INTEGER NOT NULL REFERENCES "PaymentGateway" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "requestId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL CHECK ("amountMinor" > 0),
    "feeMinor" INTEGER NOT NULL CHECK ("feeMinor" >= 0),
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "config" JSONB NOT NULL,
    "secrets" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "externalId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PaymentAttempt_orderId_requestId_key" ON "PaymentAttempt" ("orderId", "requestId");
CREATE UNIQUE INDEX "PaymentAttempt_gatewayId_externalId_key" ON "PaymentAttempt" ("gatewayId", "externalId");
CREATE INDEX "PaymentAttempt_createdAt_idx" ON "PaymentAttempt" ("createdAt");
COMMIT;
