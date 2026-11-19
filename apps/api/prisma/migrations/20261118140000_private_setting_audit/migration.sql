BEGIN;

-- Keep new setting values private until explicitly reviewed.
CREATE OR REPLACE FUNCTION "captureOpsChange"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
            AND record_id NOT IN ('siteName', 'registrationOpen', 'inviteOnly', 'emailCodeRequired',
                'emailDomainMode', 'emailDomains', 'gmailAliasCheck', 'registerIpDailyLimit', 'trialPlanId',
                'trialDays', 'expiryReminders', 'trafficReminders', 'smtpHost', 'smtpPort', 'smtpSecure',
                'smtpUser', 'mailFrom', 'backupEnabled', 'backupTime', 'backupStorage', 'backupR2AccountId',
                'backupR2Jurisdiction', 'backupS3Endpoint', 'backupS3Region', 'backupS3ForcePathStyle',
                'backupBucket', 'backupPrefix', 'backupAccessKeyId', 'backupAgeRecipient')
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

COMMIT;
