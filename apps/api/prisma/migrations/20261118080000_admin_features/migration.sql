BEGIN;

CREATE TABLE "Coupon" (
    "id" SERIAL PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,
    "amountMinor" INTEGER NOT NULL CHECK ("amountMinor" > 0),
    "maxUses" INTEGER NOT NULL CHECK ("maxUses" > 0),
    "expiresAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Order"
    ADD COLUMN "couponId" INTEGER REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD COLUMN "discountMinor" INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT "Order_discount_matches_coupon" CHECK (
        ("couponId" IS NULL AND "discountMinor" = 0)
        OR ("couponId" IS NOT NULL AND "kind" = 'subscription'
            AND "discountMinor" > 0 AND "discountMinor" <= "amountMinor" - "creditMinor")
    );
CREATE INDEX "Order_couponId_status_idx" ON "Order"("couponId", "status");
CREATE UNIQUE INDEX "Order_coupon_paid_once_per_user" ON "Order"("couponId", "userId")
    WHERE "couponId" IS NOT NULL AND "status" = 'paid';

CREATE TYPE "GiftKind" AS ENUM ('balance', 'subscription');
CREATE TABLE "GiftCode" (
    "id" SERIAL PRIMARY KEY,
    "digest" TEXT NOT NULL UNIQUE,
    "label" TEXT NOT NULL,
    "kind" "GiftKind" NOT NULL,
    "amountMinor" INTEGER,
    "planId" INTEGER REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "period" "BillingPeriod",
    "expiresAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedById" INTEGER REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "redeemedAt" TIMESTAMP(3),
    CONSTRAINT "GiftCode_reward_matches_kind" CHECK (
        ("kind" = 'balance' AND "amountMinor" IS NOT NULL AND "amountMinor" > 0 AND "planId" IS NULL AND "period" IS NULL)
        OR ("kind" = 'subscription' AND "amountMinor" IS NULL AND "planId" IS NOT NULL AND "period" IS NOT NULL)
    ),
    CONSTRAINT "GiftCode_redemption_complete" CHECK (("redeemedAt" IS NULL) = ("redeemedById" IS NULL))
);

CREATE TABLE "HelpArticle" (
    "id" SERIAL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO "HelpArticle" ("title", "body", "published") VALUES (
    '安装客户端与导入订阅',
    E'1. 打开「订阅链接」，按使用设备选择客户端，通过客户端的官方下载入口安装。\n\n2. 复制订阅链接。在客户端选择「添加订阅」或「从 URL 导入」，粘贴链接并更新订阅。支持一键导入的客户端可在订阅页面直接打开。\n\n3. 选择一个节点并连接。续费或新增节点后，可在客户端更新订阅。\n\n订阅链接包含账户凭据。请妥善保管。链接泄露时，可在「订阅链接」中重置，再在客户端重新导入。',
    TRUE
);

CREATE TABLE "MailTemplate" (
    "key" TEXT PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL
);
CREATE TABLE "MailBroadcast" (
    "requestId" UUID PRIMARY KEY,
    "actorId" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL CHECK ("recipients" >= 0)
);
CREATE INDEX "TrafficRecord_createdAt_idx" ON "TrafficRecord"("createdAt");

COMMIT;
