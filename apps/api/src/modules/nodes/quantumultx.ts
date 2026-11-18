import type { NodeSettings } from "@xboard/contracts";
import {
    shadowsocksPassword,
    sniOf,
    typedSettings,
    wsEarlyData,
} from "./settings";
import type { Entry } from "./subscription";

// Quantumult X server_remote resource: one [server_local]-style line per
// node, e.g. "vless=host:port, method=none, password=…, obfs=over-tls, tag=…".
// Syntax from crossutility/Quantumult-X sample.conf (the official sample).
//
// Supported here: shadowsocks (plain, obfs http/tls, v2ray-plugin as
// obfs=ws/wss), vmess and vless over TCP, TCP HTTP disguise (without TLS) or
// WebSocket, with TLS or Reality (vless flow xtls-rprx-vision), trojan over
// TLS, WebSocket+TLS or Reality, http and socks5 (optionally over TLS), anytls.
// Left out, as Quantumult X has no such option: gRPC, HTTPUpgrade and XHTTP
// transports, the TCP HTTP disguise over TLS, Hysteria2, Hysteria, TUIC,
// Naive and Mieru. Quantumult X picks its own TLS fingerprint, so uTLS
// fingerprints are not passed on.

type V2ray = NodeSettings<"vless" | "vmess" | "trojan">;
type Tls = NodeSettings<"naive">["tls"];

/** Values are comma separated; a comma or newline inside one would split the line. */
const clean = (value: string) => value.replace(/[,\r\n]/g, " ").trim();
const address = (host: string, port: number) =>
    `${host.includes(":") ? `[${host}]` : host}:${port}`;
const tag = (entry: Entry) => `tag=${clean(`${entry.name} #${entry.id}`)}`;

/** tls-alpn is the hex ALPN extension body: length-prefixed protocol names. */
export function alpnHex(alpn: readonly string[]): string {
    return alpn
        .map(
            (name) =>
                name.length.toString(16).padStart(2, "0") +
                Buffer.from(name).toString("hex"),
        )
        .join("");
}

function tlsOptions(tls: Tls): string[] {
    return [
        `tls-verification=${tls.allowInsecure ? "false" : "true"}`,
        ...(tls.alpn.length ? [`tls-alpn=${alpnHex(tls.alpn)}`] : []),
    ];
}

function realityOptions(s: V2ray): string[] {
    const r = (s as NodeSettings<"vless">).reality;
    return [
        `reality-base64-pubkey=${r.publicKey}`,
        ...(r.shortId ? [`reality-hex-shortid=${r.shortId}`] : []),
    ];
}

/** obfs / obfs-host / obfs-uri and TLS for VMess and VLESS; null when unsupported. */
function v2rayOptions(s: V2ray, backendHost: string): string[] | null {
    const t = s.transport;
    const secure = s.security !== "none";
    const sni =
        s.security === "reality"
            ? (s as NodeSettings<"vless">).reality.serverName
            : sniOf(s.tls, backendHost);
    const security =
        s.security === "reality"
            ? realityOptions(s)
            : s.security === "tls"
              ? tlsOptions(s.tls)
              : [];
    if (t.network === "tcp" && t.headerType === "http") {
        if (secure) return null;
        return [
            "obfs=http",
            ...(t.host ? [`obfs-host=${clean(t.host)}`] : []),
            `obfs-uri=${clean(t.path || "/")}`,
        ];
    }
    if (t.network === "tcp")
        return secure
            ? ["obfs=over-tls", `obfs-host=${clean(sni)}`, ...security]
            : [];
    if (t.network === "ws")
        return [
            secure ? "obfs=wss" : "obfs=ws",
            // One obfs-host is both the WebSocket Host and, over TLS, the SNI.
            ...(t.host || secure ? [`obfs-host=${clean(t.host || sni)}`] : []),
            // Quantumult X documents no WebSocket early data: drop "?ed=".
            `obfs-uri=${clean(wsEarlyData(t.path).path)}`,
            ...security,
        ];
    return null;
}

function line(entry: Entry, uuid: string): string | null {
    const typed = typedSettings(entry.backend);
    const backendHost = entry.backend.host;
    const server = address(entry.host, entry.port);
    switch (typed.protocol) {
        case "vmess":
        case "vless": {
            const s = typed.settings;
            const options = v2rayOptions(s, backendHost);
            if (!options) return null;
            const flow =
                typed.protocol === "vless" && typed.settings.flow
                    ? [`vless-flow=${typed.settings.flow}`]
                    : [];
            return [
                `${typed.protocol}=${server}`,
                typed.protocol === "vmess"
                    ? "method=chacha20-poly1305"
                    : "method=none",
                `password=${uuid}`,
                ...options,
                ...flow,
                "fast-open=false",
                "udp-relay=true",
                tag(entry),
            ].join(", ");
        }
        case "trojan": {
            const s = typed.settings;
            const t = s.transport;
            let options: string[];
            if (t.network === "ws")
                // Trojan over WebSocket is always over TLS: obfs=wss, no over-tls.
                options = [
                    "obfs=wss",
                    `obfs-host=${clean(
                        t.host ||
                            (s.security === "reality"
                                ? s.reality.serverName
                                : sniOf(s.tls, backendHost)),
                    )}`,
                    `obfs-uri=${clean(wsEarlyData(t.path).path)}`,
                    ...(s.security === "reality"
                        ? realityOptions(s)
                        : tlsOptions(s.tls)),
                ];
            else if (t.network === "tcp")
                options =
                    s.security === "reality"
                        ? [
                              "over-tls=true",
                              `tls-host=${clean(s.reality.serverName)}`,
                              ...realityOptions(s),
                          ]
                        : [
                              "over-tls=true",
                              `tls-host=${clean(sniOf(s.tls, backendHost))}`,
                              ...tlsOptions(s.tls),
                          ];
            else return null;
            return [
                `trojan=${server}`,
                `password=${uuid}`,
                ...options,
                "fast-open=false",
                "udp-relay=true",
                tag(entry),
            ].join(", ");
        }
        case "shadowsocks": {
            const s = typed.settings;
            const opts = Object.fromEntries(
                s.pluginOpts
                    .split(";")
                    .map((pair) => pair.trim())
                    .filter(Boolean)
                    .map((pair) => {
                        const index = pair.indexOf("=");
                        return index < 0
                            ? [pair, "true"]
                            : [pair.slice(0, index), pair.slice(index + 1)];
                    }),
            ) as Record<string, string>;
            let plugin: string[] = [];
            if (s.plugin === "obfs")
                plugin = [
                    `obfs=${opts.obfs === "tls" ? "tls" : "http"}`,
                    `obfs-host=${clean(opts["obfs-host"] ?? opts.host ?? "www.bing.com")}`,
                    ...(opts.obfs === "tls"
                        ? []
                        : [
                              `obfs-uri=${clean(opts["obfs-uri"] ?? opts.path ?? "/")}`,
                          ]),
                ];
            else if (s.plugin === "v2ray-plugin") {
                // Only v2ray-plugin's websocket mode exists in Quantumult X.
                if (opts.mode && opts.mode !== "websocket") return null;
                plugin = [
                    "tls" in opts ? "obfs=wss" : "obfs=ws",
                    ...(opts.host ? [`obfs-host=${clean(opts.host)}`] : []),
                    `obfs-uri=${clean(opts.path ?? "/")}`,
                ];
            }
            return [
                `shadowsocks=${server}`,
                `method=${s.cipher}`,
                `password=${shadowsocksPassword(s.cipher, entry.backend.serverSecret, uuid)}`,
                ...plugin,
                "fast-open=false",
                "udp-relay=true",
                tag(entry),
            ].join(", ");
        }
        case "http":
        case "socks": {
            const s = typed.settings;
            return [
                `${typed.protocol === "http" ? "http" : "socks5"}=${server}`,
                `username=${uuid}`,
                `password=${uuid}`,
                ...(s.security === "tls"
                    ? [
                          "over-tls=true",
                          `tls-host=${clean(sniOf(s.tls, backendHost))}`,
                          ...tlsOptions(s.tls),
                      ]
                    : []),
                "fast-open=false",
                `udp-relay=${typed.protocol === "socks" ? "true" : "false"}`,
                tag(entry),
            ].join(", ");
        }
        case "anytls": {
            const s = typed.settings;
            return [
                `anytls=${server}`,
                `password=${uuid}`,
                "over-tls=true",
                `tls-host=${clean(sniOf(s.tls, backendHost))}`,
                ...tlsOptions(s.tls),
                "udp-relay=true",
                tag(entry),
            ].join(", ");
        }
        case "hysteria2":
        case "hysteria":
        case "tuic":
        case "naive":
        case "mieru":
            return null;
    }
}

/** Server lines, one per node Quantumult X can express. */
export function quantumultx(entries: Entry[], uuid: string): string[] {
    return entries
        .map((entry) => line(entry, uuid))
        .filter((value): value is string => value !== null);
}
