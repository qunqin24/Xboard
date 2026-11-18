-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailKey" TEXT,
ADD COLUMN     "inviteCode" TEXT,
ADD COLUMN     "invitedById" INTEGER,
ADD COLUMN     "registerIp" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RegisterCode" (
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegisterCode_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteCode_key" ON "User"("inviteCode");

-- CreateIndex
CREATE INDEX "User_emailKey_idx" ON "User"("emailKey");

-- CreateIndex
CREATE INDEX "User_registerIp_createdAt_idx" ON "User"("registerIp", "createdAt");

-- CreateIndex
CREATE INDEX "User_invitedById_idx" ON "User"("invitedById");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: the mailbox each existing address delivers to (same rule as mailboxKey()).
UPDATE "User"
SET "emailKey" = CASE
    WHEN split_part("email", '@', 2) IN ('gmail.com', 'googlemail.com')
        THEN replace(split_part(split_part("email", '@', 1), '+', 1), '.', '') || '@gmail.com'
    ELSE "email"
END;
