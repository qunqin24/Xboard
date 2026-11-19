ALTER TABLE "User"
    ADD COLUMN "locale" TEXT,
    ADD CONSTRAINT "User_supported_locale" CHECK ("locale" IN ('zh-CN', 'en-US'));
