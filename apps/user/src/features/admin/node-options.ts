import {
    defaultNodeSettings,
    type CertConfig,
    type NodeProtocol,
    type RateRange,
    type RouteRule,
} from "@xboard/contracts";
import type { NodeRow } from "./types";

export const PROTOCOL_LABEL: Record<NodeProtocol, string> = {
    vless: "VLESS",
    vmess: "VMess",
    trojan: "Trojan",
    shadowsocks: "Shadowsocks",
    hysteria2: "Hysteria2",
    hysteria: "Hysteria",
    tuic: "TUIC",
    anytls: "AnyTLS",
    socks: "SOCKS5",
    http: "HTTP",
    naive: "Naive",
    mieru: "Mieru",
};

export const NETWORK_LABEL = {
    tcp: "TCP",
    ws: "WebSocket",
    grpc: "gRPC",
    httpupgrade: "HTTPUpgrade",
    xhttp: "XHTTP",
} as const;

/** "Reality · TCP", "TLS · WebSocket", "obfs" — the settings that matter at a glance. */
export function nodeSummary(node: NodeRow): string {
    const parts: string[] = [];
    switch (node.protocol) {
        case "vless":
        case "vmess":
        case "trojan": {
            const s = node.settings;
            parts.push(
                s.security === "reality"
                    ? "Reality"
                    : s.security === "tls"
                      ? "TLS"
                      : "无 TLS",
            );
            parts.push(NETWORK_LABEL[s.transport.network]);
            if (node.protocol === "vless" && node.settings.flow)
                parts.push("Vision");
            break;
        }
        case "shadowsocks":
            parts.push(node.settings.cipher);
            if (node.settings.plugin) parts.push(node.settings.plugin);
            break;
        case "hysteria2":
            if (node.settings.obfs) parts.push("Salamander");
            if (node.settings.ports) parts.push("端口跳跃");
            break;
        case "hysteria":
            parts.push("v1");
            if (node.settings.ports) parts.push("端口跳跃");
            break;
        case "tuic":
            parts.push(
                `v${node.settings.version}`,
                node.settings.congestionControl,
            );
            break;
        case "socks":
        case "http":
            parts.push(node.settings.security === "tls" ? "TLS" : "无 TLS");
            break;
        case "mieru":
            parts.push(node.settings.transport);
            break;
        case "anytls":
        case "naive":
            break;
    }
    return parts.join(" · ");
}

/** What the form edits: the node body, with numbers that may be blank while typing. */
export type NodeFormValues = {
    name: string;
    protocol: NodeProtocol;
    host: string;
    port: number | null;
    serverPort: number | null;
    enabled: boolean;
    visible: boolean;
    tags: string[];
    parentId: number | null;
    rate: number | null;
    rateRanges: RateRange[];
    // JSON fields hold the parsed value, or the raw text while it does not parse.
    routes: RouteRule[] | string;
    customOutbounds: Record<string, unknown>[] | string;
    customRoutes: Record<string, unknown>[] | string;
    certConfig: CertConfig;
    planIds: number[];
    // Protocol-specific; validated by the contracts schema for the protocol.
    settings: Record<string, any>;
};

const CERT_DEFAULTS: CertConfig = {
    mode: "none",
    domain: "",
    certFile: "",
    keyFile: "",
    provider: "",
    email: "",
    dnsEnv: "",
};

export function toFormValues(node: NodeRow | null): NodeFormValues {
    if (!node)
        return {
            name: "",
            protocol: "vless",
            host: "",
            port: 443,
            serverPort: 443,
            enabled: true,
            visible: true,
            tags: [],
            parentId: null,
            rate: 1,
            rateRanges: [],
            routes: [],
            customOutbounds: [],
            customRoutes: [],
            certConfig: CERT_DEFAULTS,
            planIds: [],
            settings: defaultNodeSettings("vless"),
        };
    return {
        name: node.name,
        protocol: node.protocol,
        host: node.host,
        port: node.port,
        serverPort: node.serverPort,
        enabled: node.enabled,
        visible: node.visible,
        tags: node.tags,
        parentId: node.parentId,
        rate: node.rate,
        rateRanges: node.rateRanges,
        routes: node.routes,
        customOutbounds: node.customOutbounds,
        customRoutes: node.customRoutes,
        certConfig: node.certConfig,
        planIds: node.plans.map((p) => p.planId),
        settings: node.settings,
    };
}

/** "香港, IPLC，日本" → ["香港", "IPLC", "日本"]. */
export function splitTags(value: string): string[] {
    return [
        ...new Set(
            value
                .split(/[,，、\n]/)
                .map((tag) => tag.trim())
                .filter(Boolean),
        ),
    ];
}

/** Lines of a textarea, without blanks. */
export function splitLines(value: string): string[] {
    return value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

/** JSON text → value; invalid text is kept as the string so validation reports it. */
export function parseJsonField(text: string): unknown {
    if (!text.trim()) return [];
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

export function formatJsonField(value: unknown): string {
    if (typeof value === "string") return value;
    return Array.isArray(value) && value.length === 0
        ? ""
        : JSON.stringify(value, null, 2);
}

function base64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

/** A Reality X25519 key pair in Xray's format (`xray x25519`). */
export async function generateRealityKeys(): Promise<{
    privateKey: string;
    publicKey: string;
}> {
    const pair = (await crypto.subtle.generateKey({ name: "X25519" }, true, [
        "deriveBits",
    ])) as CryptoKeyPair;
    const publicKey = new Uint8Array(
        await crypto.subtle.exportKey("raw", pair.publicKey),
    );
    // PKCS#8 for X25519 ends with the 32-byte private scalar.
    const pkcs8 = new Uint8Array(
        await crypto.subtle.exportKey("pkcs8", pair.privateKey),
    );
    return {
        privateKey: base64Url(pkcs8.slice(-32)),
        publicKey: base64Url(publicKey),
    };
}

/** A random Reality short id: 8 bytes as 16 lowercase hex digits. */
export function randomShortId(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
}
