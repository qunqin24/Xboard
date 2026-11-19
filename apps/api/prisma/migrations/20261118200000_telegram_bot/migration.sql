BEGIN;
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User" ("telegramChatId");
CREATE TABLE "TelegramBinding" (
    "userId" INTEGER PRIMARY KEY REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "digest" TEXT NOT NULL UNIQUE,
    "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "TelegramBinding_expiresAt_idx" ON "TelegramBinding" ("expiresAt");
CREATE TABLE "TelegramNotice" (
    "id" UUID PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TelegramNotice_chatId_eventKey_key" ON "TelegramNotice" ("chatId", "eventKey");
CREATE INDEX "TelegramNotice_sentAt_nextAt_idx" ON "TelegramNotice" ("sentAt", "nextAt");
COMMIT;
