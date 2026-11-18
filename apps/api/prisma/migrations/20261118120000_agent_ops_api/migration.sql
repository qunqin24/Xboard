BEGIN;

ALTER TABLE "Audit" ADD COLUMN "opsTokenId" UUID;
CREATE INDEX "Audit_opsTokenId_id_idx" ON "Audit"("opsTokenId", "id");

CREATE TABLE "OpsToken" (
    "id" UUID PRIMARY KEY,
    "tokenHash" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY['*']::TEXT[],
    "allowedIps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdById" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3)
);

CREATE TABLE "OpsWriteRequest" (
    "tokenId" UUID NOT NULL REFERENCES "OpsToken"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "key" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "response" BYTEA NOT NULL,
    PRIMARY KEY ("tokenId", "key")
);

CREATE TABLE "OpsAuditChange" (
    "id" BIGSERIAL PRIMARY KEY,
    "auditId" INTEGER NOT NULL REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "resource" TEXT NOT NULL,
    "record" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "privateFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);
CREATE INDEX "OpsAuditChange_auditId_id_idx" ON "OpsAuditChange"("auditId", "id");

-- Observe the rows actually written by a Bearer request, even under concurrent
-- browser updates. Other transactions leave the setting unset. Trigger arguments
-- specify a record key and the allowed columns. A ! column records only its name.
CREATE FUNCTION "captureOpsChange"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    audit_id INTEGER := NULLIF(current_setting('xboard.ops_audit_id', true), '')::INTEGER;
    before_row JSONB;
    after_row JSONB;
    before_values JSONB := '{}'::JSONB;
    after_values JSONB := '{}'::JSONB;
    private_fields TEXT[] := ARRAY[]::TEXT[];
    record_id TEXT;
    field TEXT;
    before_value JSONB;
    after_value JSONB;
BEGIN
    IF audit_id IS NULL THEN
        RETURN NULL;
    END IF;

    IF TG_OP <> 'INSERT' THEN before_row := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN after_row := to_jsonb(NEW); END IF;
    SELECT string_agg(COALESCE(after_row, before_row)->>key, '/' ORDER BY position)
        INTO record_id FROM unnest(string_to_array(TG_ARGV[0], ',')) WITH ORDINALITY AS keys(key, position);

    FOR i IN 1..(TG_NARGS - 1) LOOP
        field := ltrim(TG_ARGV[i], '!');
        before_value := before_row->field;
        after_value := after_row->field;
        IF before_value IS NOT DISTINCT FROM after_value THEN CONTINUE; END IF;

        IF left(TG_ARGV[i], 1) = '!' OR (
            TG_TABLE_NAME = 'Setting' AND field = 'value'
            AND record_id IN ('supportNote', 'termsUrl', 'privacyUrl')
        ) THEN
            private_fields := array_append(private_fields, field);
        ELSE
            -- Keep byte counts exact when the result travels through JSON.
            IF field IN ('transferEnable', 'transferBytes', 'upload', 'download') THEN
                before_value := to_jsonb(before_value #>> '{}');
                after_value := to_jsonb(after_value #>> '{}');
            END IF;
            before_values := before_values || jsonb_build_object(field, before_value);
            after_values := after_values || jsonb_build_object(field, after_value);
        END IF;
    END LOOP;

    IF before_values <> '{}'::JSONB OR cardinality(private_fields) > 0 THEN
        INSERT INTO "OpsAuditChange" ("auditId", "resource", "record", "before", "after", "privateFields")
        VALUES (audit_id, TG_TABLE_NAME, record_id,
            CASE WHEN before_row IS NOT NULL THEN before_values END,
            CASE WHEN after_row IS NOT NULL THEN after_values END,
            private_fields);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER "ops_audit_user" AFTER INSERT OR UPDATE OR DELETE ON "User"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('id', 'balance', 'banned', 'planId',
        'expiredAt', 'transferEnable', 'upload', 'download', 'speedLimit', 'deviceLimit',
        'entitlementVersion', 'trafficResetMode', 'trafficResetDay', 'nextTrafficResetAt',
        '!password', '!totpSecret', '!totpRecoveryHashes', '!proxyUuid');
CREATE TRIGGER "ops_audit_plan" AFTER INSERT OR UPDATE OR DELETE ON "Plan"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('id', 'name', 'published', 'sort',
        'transferEnable', 'speedLimit', 'deviceLimit', 'trafficResetMode', 'trafficResetPriceMinor', 'deletedAt', '!content');
CREATE TRIGGER "ops_audit_plan_price" AFTER INSERT OR UPDATE OR DELETE ON "PlanPrice"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('planId,period', 'planId', 'period', 'amountMinor', 'currency');
CREATE TRIGGER "ops_audit_order" AFTER INSERT OR UPDATE OR DELETE ON "Order"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('id', 'userId', 'planId', 'status', 'kind', 'period',
        'amountMinor', 'creditMinor', 'discountMinor', 'couponId', 'transferBytes', 'durationDays',
        'replacesPlan', 'expiresAt', 'paidAt', 'serviceUntil');
CREATE TRIGGER "ops_audit_balance" AFTER INSERT OR UPDATE OR DELETE ON "BalanceEntry"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('id', 'userId', 'orderId', 'amountMinor', 'actorId', '!reason');
CREATE TRIGGER "ops_audit_node" AFTER INSERT OR UPDATE OR DELETE ON "Node"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('id', 'name', 'protocol', 'host', 'port', 'serverPort',
        'enabled', 'visible', 'tags', 'rate', 'rateRanges', 'parentId', 'deletedAt', '!tokenHash',
        '!settings', '!certConfig', '!routes', '!customOutbounds', '!customRoutes');
CREATE TRIGGER "ops_audit_node_plan" AFTER INSERT OR UPDATE OR DELETE ON "NodePlan"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('nodeId,planId', 'nodeId', 'planId');
CREATE TRIGGER "ops_audit_notice" AFTER INSERT OR UPDATE OR DELETE ON "Notice"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('id', 'title', 'published', '!content');
CREATE TRIGGER "ops_audit_help" AFTER INSERT OR UPDATE OR DELETE ON "HelpArticle"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('id', 'title', 'published', 'sort', '!body');
CREATE TRIGGER "ops_audit_coupon" AFTER INSERT OR UPDATE OR DELETE ON "Coupon"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('id', 'amountMinor', 'maxUses', 'enabled', 'expiresAt', '!code');
CREATE TRIGGER "ops_audit_gift" AFTER INSERT OR UPDATE OR DELETE ON "GiftCode"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('id', 'label', 'kind', 'amountMinor', 'planId',
        'period', 'enabled', 'expiresAt', 'redeemedById', '!digest');
CREATE TRIGGER "ops_audit_sub_template" AFTER INSERT OR UPDATE OR DELETE ON "SubscriptionTemplate"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('format', 'format', '!content');
CREATE TRIGGER "ops_audit_mail_template" AFTER INSERT OR UPDATE OR DELETE ON "MailTemplate"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('key', 'key', '!subject', '!text');
CREATE TRIGGER "ops_audit_mail_broadcast" AFTER INSERT OR UPDATE OR DELETE ON "MailBroadcast"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('requestId', 'recipients', 'actorId');
CREATE TRIGGER "ops_audit_ticket" AFTER INSERT OR UPDATE OR DELETE ON "Ticket"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('id', 'closed', 'updatedAt');
CREATE TRIGGER "ops_audit_ticket_reply" AFTER INSERT OR UPDATE OR DELETE ON "TicketMessage"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('id', 'ticketId', 'authorId', 'isStaff', '!content');
CREATE TRIGGER "ops_audit_setting" AFTER INSERT OR UPDATE OR DELETE ON "Setting"
    FOR EACH ROW EXECUTE FUNCTION "captureOpsChange"('key', 'key', 'value');

COMMIT;
