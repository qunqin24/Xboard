-- Admin-edited subscription templates (rules and proxy groups per client format).
CREATE TABLE "SubscriptionTemplate" (
    "format" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionTemplate_pkey" PRIMARY KEY ("format")
);
