-- Keep the subscription token itself so the user can see their link again.
-- Existing users keep their old link (matched by subscribeHash) until they reset it.
ALTER TABLE "User" ADD COLUMN "subscribeToken" TEXT;
CREATE UNIQUE INDEX "User_subscribeToken_key" ON "User"("subscribeToken");
