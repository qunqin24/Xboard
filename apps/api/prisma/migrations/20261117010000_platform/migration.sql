-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "NodeProtocol" AS ENUM ('vmess', 'vless', 'trojan', 'shadowsocks', 'hysteria2', 'tuic');

-- DropForeignKey
ALTER TABLE "BalanceEntry" DROP CONSTRAINT "BalanceEntry_orderId_fkey";

-- AlterTable
ALTER TABLE "BalanceEntry" ADD COLUMN     "actorId" INTEGER,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "requestId" UUID,
ALTER COLUMN "orderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "proxyUuid" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'user',
ADD COLUMN     "subscribeHash" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Audit" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailToken" (
    "hash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "Mail" (
    "id" SERIAL NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "nextAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Node" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "protocol" "NodeProtocol" NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "serverName" TEXT NOT NULL,
    "cipher" TEXT NOT NULL DEFAULT 'aes-128-gcm',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "status" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodePlan" (
    "nodeId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,

    CONSTRAINT "NodePlan_pkey" PRIMARY KEY ("nodeId","planId")
);

-- CreateTable
CREATE TABLE "TrafficRecord" (
    "id" SERIAL NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "upload" BIGINT NOT NULL,
    "download" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrafficRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrafficReceipt" (
    "nodeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrafficReceipt_pkey" PRIMARY KEY ("nodeId","key")
);

-- CreateTable
CREATE TABLE "OnlineDevice" (
    "nodeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnlineDevice_pkey" PRIMARY KEY ("nodeId","userId","ip")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "isStaff" BOOLEAN NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3),

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "TrafficRecord_userId_createdAt_idx" ON "TrafficRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_userId_updatedAt_idx" ON "Ticket"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceEntry_requestId_key" ON "BalanceEntry"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "User_proxyUuid_key" ON "User"("proxyUuid");

-- CreateIndex
CREATE UNIQUE INDEX "User_subscribeHash_key" ON "User"("subscribeHash");

-- AddForeignKey
ALTER TABLE "BalanceEntry" ADD CONSTRAINT "BalanceEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodePlan" ADD CONSTRAINT "NodePlan_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodePlan" ADD CONSTRAINT "NodePlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficRecord" ADD CONSTRAINT "TrafficRecord_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficRecord" ADD CONSTRAINT "TrafficRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficReceipt" ADD CONSTRAINT "TrafficReceipt_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineDevice" ADD CONSTRAINT "OnlineDevice_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
