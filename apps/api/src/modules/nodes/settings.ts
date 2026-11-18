import type { Node } from "@prisma/client";
import { z } from "zod";
import {
    certConfigSchema,
    NODE_SETTINGS,
    parsePortList,
    rateRangeSchema,
    routeRuleSchema,
    SS2022_KEY_BYTES,
    type NodeProtocol,
    type NodeSettings,
} from "@xboard/contracts";

/** A node's protocol together with its parsed, defaulted settings. */
export type TypedSettings = {
    [P in NodeProtocol]: { protocol: P; settings: NodeSettings<P> };
}[NodeProtocol];

type V2raySettings = NodeSettings<"vless" | "vmess" | "trojan">;
type Transport = V2raySettings["transport"];
type Tls = NodeSettings<"naive">["tls"];

/**
 * Stored settings, with defaults filled in. Rows are only written through the
 * validated admin body, so a parse failure means a hand-edited row; it falls
 * back to the protocol defaults rather than failing every request.
 */
export function typedSettings(
    node: Pick<Node, "protocol" | "settings">,
): TypedSettings {
    const schema = NODE_SETTINGS[node.protocol];
    const parsed = schema.safeParse(node.settings ?? {});
    return {
        protocol: node.protocol,
        settings: parsed.success ? parsed.data : schema.parse({}),
    } as TypedSettings;
}

// Lenient reads of the other JSON columns, for the same reason.
const rateRanges = z.array(rateRangeSchema).catch([]);
const routeRules = z.array(routeRuleSchema).catch([]);
const objects = z.array(z.record(z.string(), z.unknown())).catch([]);

export const nodeRateRanges = (node: Pick<Node, "rateRanges">) =>
    rateRanges.parse(node.rateRanges);
export const nodeRoutes = (node: Pick<Node, "routes">) =>
    routeRules.parse(node.routes);
export const jsonObjects = (value: unknown) => objects.parse(value);
export const nodeCertConfig = (node: Pick<Node, "certConfig">) =>
    certConfigSchema
        .catch(() => certConfigSchema.parse({}))
        .parse(node.certConfig ?? {});

const shanghaiClock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

/**
 * The multiplier for traffic reported now: the first time range containing
 * the current Asia/Shanghai minute (both ends included; start > end wraps past
 * midnight), else the node's base rate.
 */
export function currentRate(
    node: Pick<Node, "rate" | "rateRanges">,
    now = new Date(),
): number {
    const time = shanghaiClock.format(now);
    for (const range of nodeRateRanges(node)) {
        const inside =
            range.start <= range.end
                ? time >= range.start && time <= range.end
                : time >= range.start || time <= range.end;
        if (inside) return range.rate;
    }
    return node.rate;
}

/** `bytes × rate`, rounded to the nearest byte; rates have two decimals. */
export function applyRate(bytes: bigint, rate: number): bigint {
    const hundredths = BigInt(Math.round(rate * 100));
    return (bytes * hundredths + 50n) / 100n;
}

/**
 * Shadowsocks 2022 keys, as V2bX derives them: the server key is the first
 * 16/32 characters of the node's secret, a user's key the first 16/32
 * characters of their UUID, each base64-encoded.
 */
export function ss2022ServerKey(cipher: string, secret: string): string | null {
    const bytes = SS2022_KEY_BYTES[cipher];
    return bytes
        ? Buffer.from(secret.slice(0, bytes)).toString("base64")
        : null;
}

export function shadowsocksPassword(
    cipher: string,
    secret: string,
    uuid: string,
): string {
    const bytes = SS2022_KEY_BYTES[cipher];
    if (!bytes) return uuid;
    const user = Buffer.from(uuid.slice(0, bytes)).toString("base64");
    return `${ss2022ServerKey(cipher, secret)}:${user}`;
}

/** The TLS server name: the configured SNI, else the backend node's address. */
export function sniOf(tls: Tls, host: string): string {
    return tls.serverName || host;
}

/** Port hopping ranges, `[[20000, 50000]]`, or null when not configured. */
export function hopRanges(ports: string): [number, number][] | null {
    return ports ? parsePortList(ports) : null;
}

/** Xray `network_settings` for a transport, as V2bX passes it to the core. */
export function xrayNetworkSettings(t: Transport): Record<string, unknown> {
    switch (t.network) {
        case "tcp":
            return t.headerType === "http"
                ? {
                      header: {
                          type: "http",
                          request: {
                              path: [t.path || "/"],
                              ...(t.host
                                  ? { headers: { Host: [t.host] } }
                                  : {}),
                          },
                      },
                  }
                : { header: { type: "none" } };
        case "ws":
            // Xray reads `host` (headers.Host is deprecated there); V2bX's
            // sing core and XrayR read only headers.Host.
            return {
                path: t.path || "/",
                ...(t.host ? { host: t.host, headers: { Host: t.host } } : {}),
            };
        case "grpc":
            return { serviceName: t.serviceName };
        case "httpupgrade":
            return { path: t.path || "/", ...(t.host ? { host: t.host } : {}) };
        case "xhttp":
            return {
                path: t.path || "/",
                ...(t.host ? { host: t.host } : {}),
                mode: t.mode,
            };
    }
}

/**
 * Xray-style WebSocket early data in the path ("/ws?ed=2048"): clients that
 * take it as separate options get the bare path and the byte count.
 */
export function wsEarlyData(path: string): {
    path: string;
    maxEarlyData: number;
} {
    const match = /^(.*?)[?&]ed=(\d+)$/.exec(path);
    return match
        ? { path: match[1] || "/", maxEarlyData: Number(match[2]) }
        : { path: path || "/", maxEarlyData: 0 };
}

/** ECH config for Mihomo: the base64 body, without PEM armour or whitespace. */
export function echConfigBase64(config: string): string | null {
    const value = config.trim();
    if (!value) return null;
    if (value.startsWith("-----BEGIN")) {
        const match =
            /-----BEGIN ECH CONFIGS-----\s*([\s\S]*?)\s*-----END ECH CONFIGS-----/.exec(
                value,
            );
        return match ? match[1]!.replace(/\s+/g, "") : null;
    }
    return value.replace(/\s+/g, "");
}

/** ECH config for sing-box: PEM lines. */
export function echConfigPem(config: string): string[] | null {
    const body = echConfigBase64(config);
    return body
        ? ["-----BEGIN ECH CONFIGS-----", body, "-----END ECH CONFIGS-----"]
        : null;
}
