-- Node configuration on par with the PHP panel: more protocols, a typed JSON
-- settings column per protocol, connect vs listen port, traffic multiplier,
-- visibility, tags, relay parents and node-side routing/certificate options.

ALTER TYPE "NodeProtocol" ADD VALUE 'hysteria';
ALTER TYPE "NodeProtocol" ADD VALUE 'anytls';
ALTER TYPE "NodeProtocol" ADD VALUE 'socks';
ALTER TYPE "NodeProtocol" ADD VALUE 'http';
ALTER TYPE "NodeProtocol" ADD VALUE 'naive';
ALTER TYPE "NodeProtocol" ADD VALUE 'mieru';

ALTER TABLE "Node"
    ADD COLUMN "serverPort" INTEGER,
    ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN "serverSecret" TEXT NOT NULL DEFAULT md5((random())::text),
    ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "rate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    ADD COLUMN "rateRanges" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "routes" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "customOutbounds" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "customRoutes" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "certConfig" JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN "parentId" INTEGER;

-- Existing nodes keep what they served before: TCP + TLS with the old SNI,
-- the old Shadowsocks cipher, and one port for both dialing and listening.
UPDATE "Node" SET
    "serverPort" = "port",
    "settings" = CASE
        WHEN "protocol" IN ('vmess', 'vless', 'trojan') THEN jsonb_build_object(
            'security', 'tls',
            'tls', jsonb_build_object('serverName', "serverName"),
            'transport', jsonb_build_object('network', 'tcp'))
        WHEN "protocol" = 'shadowsocks' THEN jsonb_build_object('cipher', "cipher")
        WHEN "protocol" = 'hysteria2' THEN jsonb_build_object(
            'tls', jsonb_build_object('serverName', "serverName"))
        WHEN "protocol" = 'tuic' THEN jsonb_build_object(
            'tls', jsonb_build_object('serverName', "serverName"),
            'congestionControl', 'bbr')
        ELSE '{}'::jsonb
    END;

ALTER TABLE "Node" ALTER COLUMN "serverPort" SET NOT NULL;
ALTER TABLE "Node" ALTER COLUMN "tags" SET NOT NULL;
ALTER TABLE "Node" DROP COLUMN "serverName";
ALTER TABLE "Node" DROP COLUMN "cipher";

ALTER TABLE "Node" ADD CONSTRAINT "Node_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Node_parentId_idx" ON "Node"("parentId");
