import type { NodeSettings } from "@xboard/contracts";
import {
    shadowsocksPassword,
    sniOf,
    typedSettings,
    wsEarlyData,
} from "./settings";
import type { Entry } from "./subscription";

// Loon node subscription: one "name = protocol,host,port,…" line per node,
// imported with loon://import?nodelist=…. Syntax from Loon's official
// examples (Loon0x00/LoonExampleConfig Nodes/ExampleNodes.list, 2026-09)
// and manual (Loon0x00/LoonManual docs/cn/node.md).
//
// Supported here: Shadowsocks (plain, obfs http/tls), VMess and VLESS over
// TCP, TCP HTTP disguise or WebSocket, with or without TLS, VLESS Vision and
// VLESS Reality over TCP, Trojan over TLS (TCP or WebSocket), Hysteria2
// (Salamander, port hopping), AnyTLS, SOCKS5 and HTTP/HTTPS.
// Left out, as Loon documents no such option: gRPC, HTTPUpgrade and XHTTP
// transports, Trojan Reality, Shadowsocks v2ray-plugin, SOCKS5 over TLS,
// Hysteria (v1), TUIC, Naive and Mieru.

type V2ray = NodeSettings<"vless" | "vmess" | "trojan">;
type Tls = NodeSettings<"naive">["tls"];

/** A line is comma separated with "name =" first; keep those characters out of values. */
const clean = (value: string) => value.replace(/[,="\r\n]/g, " ").trim();
const quote = (value: string) => `"${value.replace(/"/g, "")}"`;
const label = (entry: Entry) => clean(`${entry.name} #${entry.id}`);

/** Loon's tls-profile values that match one of our uTLS fingerprints. */
function tlsProfile(fingerprint: string): string[] {
    if (fingerprint === "chrome") return ["tls-profile=chrome"];
    if (fingerprint === "safari" || fingerprint === "ios")
        return ["tls-profile=safari-ios-26"];
    return [];
}

/** A list value with commas must be quoted. */
const list = (values: readonly string[]) =>
    values.length > 1 ? quote(values.join(",")) : values[0]!;

function tlsOptions(tls: Tls, host: string): string[] {
    return [
        `sni=${clean(sniOf(tls, host))}`,
        `skip-cert-verify=${tls.allowInsecure ? "true" : "false"}`,
        ...(tls.alpn.length ? [`alpn=${list(tls.alpn)}`] : []),
    ];
}

/** transport/path/host for VMess and VLESS; null when Loon cannot carry it. */
function transport(s: V2ray): string[] | null {
    const t = s.transport;
    if (t.network === "tcp")
        return t.headerType === "http"
            ? [
                  "transport=http",
                  `path=${clean(t.path || "/")}`,
                  ...(t.host ? [`host=${clean(t.host)}`] : []),
              ]
            : ["transport=tcp"];
    if (t.network === "ws")
        return [
            "transport=ws",
            // Loon documents no WebSocket early data: drop "?ed=".
            `path=${clean(wsEarlyData(t.path).path)}`,
            ...(t.host ? [`host=${clean(t.host)}`] : []),
        ];
    return null;
}

function v2raySecurity(s: V2ray, host: string): string[] {
    if (s.security === "none") return ["over-tls=false"];
    if (s.security === "reality") {
        const r = (s as NodeSettings<"vless">).reality;
        return [
            "over-tls=true",
            `public-key=${quote(r.publicKey)}`,
            ...(r.shortId ? [`short-id=${r.shortId}`] : []),
            `sni=${clean(r.serverName)}`,
            ...tlsProfile(s.fingerprint || "chrome"),
        ];
    }
    return [
        "over-tls=true",
        ...tlsOptions(s.tls, host),
        ...tlsProfile(s.fingerprint),
    ];
}

function line(entry: Entry, uuid: string): string | null {
    const typed = typedSettings(entry.backend);
    const backendHost = entry.backend.host;
    const head = (protocol: string) =>
        `${label(entry)} = ${protocol},${entry.host},${entry.port}`;
    switch (typed.protocol) {
        case "vmess": {
            const s = typed.settings;
            const t = transport(s);
            if (!t) return null;
            return [
                head("vmess"),
                "aes-128-gcm",
                quote(uuid),
                ...t,
                "alterId=0",
                ...v2raySecurity(s, backendHost),
                "udp=true",
            ].join(",");
        }
        case "vless": {
            const s = typed.settings;
            const t = transport(s);
            // Loon documents Reality only over TCP.
            if (
                !t ||
                (s.security === "reality" && s.transport.network !== "tcp")
            )
                return null;
            return [
                head("VLESS"),
                quote(uuid),
                ...t,
                ...(s.flow ? [`flow=${s.flow}`] : []),
                ...v2raySecurity(s, backendHost),
                "udp=true",
            ].join(",");
        }
        case "trojan": {
            const s = typed.settings;
            if (s.security === "reality") return null;
            const t = s.transport;
            if (t.network !== "tcp" && t.network !== "ws") return null;
            return [
                head("trojan"),
                quote(uuid),
                ...(t.network === "ws"
                    ? [
                          "transport=ws",
                          `path=${clean(wsEarlyData(t.path).path)}`,
                          ...(t.host ? [`host=${clean(t.host)}`] : []),
                      ]
                    : []),
                ...tlsOptions(s.tls, backendHost),
                ...tlsProfile(s.fingerprint),
                "udp=true",
            ].join(",");
        }
        case "shadowsocks": {
            const s = typed.settings;
            if (s.plugin === "v2ray-plugin") return null;
            const opts = Object.fromEntries(
                s.pluginOpts
                    .split(";")
                    .map((pair) => pair.trim())
                    .filter((pair) => pair.includes("="))
                    .map((pair) => {
                        const index = pair.indexOf("=");
                        return [pair.slice(0, index), pair.slice(index + 1)];
                    }),
            ) as Record<string, string>;
            return [
                head("Shadowsocks"),
                s.cipher,
                quote(
                    shadowsocksPassword(
                        s.cipher,
                        entry.backend.serverSecret,
                        uuid,
                    ),
                ),
                ...(s.plugin === "obfs"
                    ? [
                          `obfs-name=${opts.obfs === "tls" ? "tls" : "http"}`,
                          `obfs-host=${clean(opts["obfs-host"] ?? opts.host ?? "www.bing.com")}`,
                          `obfs-uri=${clean(opts["obfs-uri"] ?? opts.path ?? "/")}`,
                      ]
                    : []),
                "fast-open=false",
                "udp=true",
            ].join(",");
        }
        case "hysteria2": {
            const s = typed.settings;
            return [
                head("Hysteria2"),
                quote(uuid),
                `sni=${clean(sniOf(s.tls, backendHost))}`,
                `skip-cert-verify=${s.tls.allowInsecure ? "true" : "false"}`,
                ...(s.obfs
                    ? [`salamander-password=${clean(s.obfsPassword)}`]
                    : []),
                ...(s.ports ? [`server-ports=${quote(s.ports)}`] : []),
                ...(s.ports && s.hopInterval
                    ? [`hop-interval=${s.hopInterval}`]
                    : []),
                ...(s.downMbps ? [`download-bandwidth=${s.downMbps}`] : []),
                ...(s.tls.alpn.length ? [`alpn=${list(s.tls.alpn)}`] : []),
                "udp=true",
            ].join(",");
        }
        case "anytls": {
            const s = typed.settings;
            return [
                head("AnyTLS"),
                quote(uuid),
                `sni=${clean(sniOf(s.tls, backendHost))}`,
                `skip-cert-verify=${s.tls.allowInsecure ? "true" : "false"}`,
                "udp=true",
            ].join(",");
        }
        case "socks": {
            // Loon's SOCKS5 has no TLS option.
            if (typed.settings.security === "tls") return null;
            return [head("SOCKS5"), uuid, quote(uuid), "udp=true"].join(",");
        }
        case "http": {
            const s = typed.settings;
            return s.security === "tls"
                ? [
                      head("https"),
                      uuid,
                      quote(uuid),
                      `sni=${clean(sniOf(s.tls, backendHost))}`,
                      `skip-cert-verify=${s.tls.allowInsecure ? "true" : "false"}`,
                  ].join(",")
                : [head("http"), uuid, quote(uuid)].join(",");
        }
        case "hysteria":
        case "tuic":
        case "naive":
        case "mieru":
            return null;
    }
}

/** Node lines, one per node Loon can express. */
export function loon(entries: Entry[], uuid: string): string[] {
    return entries
        .map((entry) => line(entry, uuid))
        .filter((value): value is string => value !== null);
}
