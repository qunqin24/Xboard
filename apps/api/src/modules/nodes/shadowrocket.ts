import type { NodeSettings } from "@xboard/contracts";
import {
    shadowsocksPassword,
    sniOf,
    typedSettings,
    type TypedSettings,
} from "./settings";
import type { Entry } from "./subscription";

// Shadowrocket subscription: base64 of one share link per line. Shadowrocket
// is closed source; the link formats follow upstream Xboard's
// app/Protocols/Shadowrocket.php (cedar2025/Xboard master), which reads
// Shadowrocket's own vmess/vless query style, SIP002 for ss, and its
// hysteria/hysteria2/tuic/anytls/socks links.

type Transport = NodeSettings<"vless">["transport"];
type V2ray = NodeSettings<"vless" | "vmess" | "trojan">;
type Params = Record<string, string | number | undefined>;

/** First Shadowrocket builds that understand a protocol (from the User-Agent "Shadowrocket/<build>"). */
const MIN_BUILD = { hysteria2: 1993, anytls: 2592 } as const;

/** "Shadowrocket/2592 CFNetwork/…" → 2592; null when the build is unknown. */
export function shadowrocketBuild(
    userAgent: string | undefined,
): number | null {
    const match = /Shadowrocket\/(\d+)/i.exec(userAgent ?? "");
    return match ? Number(match[1]) : null;
}

/** RFC 3986 query string, skipping empty values. */
function query(params: Params): string {
    return Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(
            ([key, value]) =>
                `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
        )
        .join("&");
}

const hostPort = (host: string, port: number) =>
    `${host.includes(":") ? `[${host}]` : host}:${port}`;
const name = (entry: Entry) => `${entry.name} #${entry.id}`;
const fragment = (entry: Entry) => `#${encodeURIComponent(name(entry))}`;
const base64 = (text: string) => Buffer.from(text).toString("base64");
const base64Url = (text: string) =>
    base64(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Shadowrocket's transport parameters for VMess/VLESS: obfs, path, obfsParam, host, mode. */
function v2rayTransport(t: Transport, sni: string): Params {
    switch (t.network) {
        case "tcp":
            return t.headerType === "http"
                ? {
                      obfs: "http",
                      path: t.path || "/",
                      obfsParam: t.host || undefined,
                  }
                : {};
        case "ws":
            return {
                obfs: "websocket",
                path: t.path || "/",
                obfsParam: t.host || undefined,
            };
        case "grpc":
            return { obfs: "grpc", path: t.serviceName, host: sni };
        case "httpupgrade":
            return {
                obfs: "httpupgrade",
                path: t.path || "/",
                obfsParam: t.host || undefined,
            };
        case "xhttp":
            return {
                obfs: "xhttp",
                path: t.path || "/",
                obfsParam: t.host || undefined,
                mode: t.mode,
            };
    }
}

/** vmess:// and vless:// in Shadowrocket's form: base64("auto:uuid@host:port")?params. */
function v2rayLink(
    scheme: "vmess" | "vless",
    entry: Entry,
    s: V2ray,
    uuid: string,
): string {
    const backendHost = entry.backend.host;
    const params: Params = { remark: name(entry) };
    if (scheme === "vmess") params.alterId = 0;
    if (s.security === "tls") {
        params.tls = 1;
        params.peer = sniOf(s.tls, backendHost);
        if (s.tls.allowInsecure) params.allowInsecure = 1;
        if (s.tls.alpn.length) params.alpn = s.tls.alpn.join(",");
        if (s.fingerprint) params.fp = s.fingerprint;
    } else if (s.security === "reality") {
        const r = (s as NodeSettings<"vless">).reality;
        params.tls = 1;
        params.sni = r.serverName;
        params.pbk = r.publicKey;
        params.sid = r.shortId;
        // Reality needs a uTLS fingerprint.
        params.fp = s.fingerprint || "chrome";
    }
    if (scheme === "vless" && (s as NodeSettings<"vless">).flow)
        // Shadowrocket's code for xtls-rprx-vision.
        params.xtls = 2;
    Object.assign(
        params,
        v2rayTransport(
            s.transport,
            s.security === "reality"
                ? (s as NodeSettings<"vless">).reality.serverName
                : sniOf(s.tls, backendHost),
        ),
    );
    const userinfo = base64(`auto:${uuid}@${hostPort(entry.host, entry.port)}`);
    return `${scheme}://${userinfo}?${query(params)}`;
}

function trojanLink(entry: Entry, s: NodeSettings<"trojan">, uuid: string) {
    const params: Params = {};
    if (s.security === "reality") {
        params.security = "reality";
        params.sni = s.reality.serverName;
        params.pbk = s.reality.publicKey;
        params.sid = s.reality.shortId;
        params.fp = s.fingerprint || "chrome";
    } else {
        params.peer = sniOf(s.tls, entry.backend.host);
        if (s.tls.allowInsecure) params.allowInsecure = 1;
        if (s.tls.alpn.length) params.alpn = s.tls.alpn.join(",");
        if (s.fingerprint) params.fp = s.fingerprint;
    }
    const t = s.transport;
    if (t.network === "grpc") {
        params.obfs = "grpc";
        params.path = t.serviceName;
    } else if (t.network === "ws") {
        // Shadowrocket carries Trojan over WebSocket as an obfs-local plugin.
        params.plugin = [
            "obfs-local",
            "obfs=websocket",
            ...(t.host ? [`obfs-host=${t.host}`] : []),
            `obfs-uri=${t.path || "/"}`,
        ].join(";");
    }
    const q = query(params);
    return `trojan://${encodeURIComponent(uuid)}@${hostPort(entry.host, entry.port)}${q ? `?${q}` : ""}${fragment(entry)}`;
}

/** SIP002: ss://base64url(method:password)@host:port/?plugin=…#name */
function shadowsocksLink(
    entry: Entry,
    s: NodeSettings<"shadowsocks">,
    password: string,
) {
    const userinfo = base64Url(`${s.cipher}:${password}`);
    const plugin = s.plugin
        ? `/?plugin=${encodeURIComponent(
              [
                  s.plugin === "obfs" ? "obfs-local" : s.plugin,
                  ...(s.pluginOpts ? [s.pluginOpts] : []),
              ].join(";"),
          )}`
        : "";
    return `ss://${userinfo}@${hostPort(entry.host, entry.port)}${plugin}${fragment(entry)}`;
}

function link(
    entry: Entry,
    typed: TypedSettings,
    uuid: string,
    build: number | null,
): string | null {
    const backendHost = entry.backend.host;
    const supports = (protocol: keyof typeof MIN_BUILD) =>
        build === null || build >= MIN_BUILD[protocol];
    switch (typed.protocol) {
        case "vmess":
        case "vless":
            return v2rayLink(typed.protocol, entry, typed.settings, uuid);
        case "trojan":
            return trojanLink(entry, typed.settings, uuid);
        case "shadowsocks":
            return shadowsocksLink(
                entry,
                typed.settings,
                shadowsocksPassword(
                    typed.settings.cipher,
                    entry.backend.serverSecret,
                    uuid,
                ),
            );
        case "hysteria2": {
            if (!supports("hysteria2")) return null;
            const s = typed.settings;
            const params: Params = {
                peer: sniOf(s.tls, backendHost),
                insecure: s.tls.allowInsecure ? 1 : 0,
                obfs: s.obfs || "none",
                "obfs-password": s.obfs ? s.obfsPassword : undefined,
                upmbps: s.upMbps ?? undefined,
                downmbps: s.downMbps ?? undefined,
                mport: s.ports || undefined,
                alpn: s.tls.alpn.length ? s.tls.alpn.join(",") : undefined,
            };
            return `hysteria2://${encodeURIComponent(uuid)}@${hostPort(entry.host, entry.port)}?${query(params)}${fragment(entry)}`;
        }
        case "hysteria": {
            const s = typed.settings;
            const params: Params = {
                auth: uuid,
                upmbps: s.upMbps ?? undefined,
                downmbps: s.downMbps ?? undefined,
                protocol: "udp",
                peer: sniOf(s.tls, backendHost),
                insecure: s.tls.allowInsecure ? 1 : 0,
                obfs: s.obfsPassword ? "xplus" : undefined,
                obfsParam: s.obfsPassword || undefined,
                mport: s.ports || undefined,
                alpn: s.tls.alpn.length ? s.tls.alpn.join(",") : undefined,
            };
            return `hysteria://${hostPort(entry.host, entry.port)}?${query(params)}${fragment(entry)}`;
        }
        case "tuic": {
            const s = typed.settings;
            const params: Params = {
                ...(s.version === 4
                    ? { token: uuid }
                    : { uuid, password: uuid }),
                sni: sniOf(s.tls, backendHost),
                alpn: (s.tls.alpn.length ? s.tls.alpn : ["h3"]).join(","),
                insecure: s.tls.allowInsecure ? 1 : 0,
                congestion_control: s.congestionControl,
                udp_relay_mode: s.udpRelayMode,
            };
            return `tuic://${hostPort(entry.host, entry.port)}?${query(params)}${fragment(entry)}`;
        }
        case "anytls": {
            if (!supports("anytls")) return null;
            const s = typed.settings;
            const params: Params = {
                sni: sniOf(s.tls, backendHost),
                insecure: s.tls.allowInsecure ? 1 : 0,
            };
            return `anytls://${encodeURIComponent(uuid)}@${hostPort(entry.host, entry.port)}?${query(params)}${fragment(entry)}`;
        }
        case "socks": {
            // Shadowrocket's socks link has no TLS option.
            if (typed.settings.security === "tls") return null;
            return `socks://${base64(`${uuid}:${uuid}@${hostPort(entry.host, entry.port)}`)}?method=auto${fragment(entry)}`;
        }
        case "http":
        case "naive":
        case "mieru":
            // No share-link form Shadowrocket is known to import.
            return null;
    }
}

export type ShadowrocketStatus = {
    upload: bigint;
    download: bigint;
    total: bigint;
    expiredAt: Date | null;
};

const gb = (bytes: bigint) => (Number(bytes) / 1024 ** 3).toFixed(2);
const shanghaiDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
});

/** Share links, one per line; Shadowrocket shows the STATUS line as the subscription's usage. */
export function shadowrocketLinks(
    entries: Entry[],
    uuid: string,
    userAgent?: string,
): string[] {
    const build = shadowrocketBuild(userAgent);
    return entries
        .map((entry) => link(entry, typedSettings(entry.backend), uuid, build))
        .filter((line): line is string => line !== null);
}

export function shadowrocket(
    entries: Entry[],
    uuid: string,
    status: ShadowrocketStatus,
    userAgent?: string,
): { body: string; count: number } {
    const links = shadowrocketLinks(entries, uuid, userAgent);
    const expires = status.expiredAt
        ? shanghaiDate.format(status.expiredAt)
        : "N/A";
    const lines = [
        `STATUS=🚀↑:${gb(status.upload)}GB,↓:${gb(status.download)}GB,TOT:${gb(status.total)}GB💡Expires:${expires}`,
        ...links,
    ];
    return {
        body: base64(lines.map((line) => `${line}\r\n`).join("")),
        count: links.length,
    };
}
