-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'paid', 'cancelled');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deviceLimit" INTEGER,
ADD COLUMN     "speedLimit" INTEGER;

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "requestId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "planName" TEXT NOT NULL,
    "period" "BillingPeriod" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "transferBytes" BIGINT NOT NULL,
    "speedLimit" INTEGER,
    "deviceLimit" INTEGER,
    "durationDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceEntry" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_userId_requestId_key" ON "Order"("userId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceEntry_orderId_key" ON "BalanceEntry"("orderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceEntry" ADD CONSTRAINT "BalanceEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceEntry" ADD CONSTRAINT "BalanceEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
