import type { NodeSettings } from "@xboard/contracts";
import {
    shadowsocksPassword,
    sniOf,
    typedSettings,
    wsEarlyData,
} from "./settings";
import type { Entry } from "./subscription";

/**
 * Sources (checked 2026-11-19):
 * - Surge: https://manual.nssurge.com/policies/overview.html lists Shadowsocks,
 *   VMess, Trojan and VLESS (iOS 6.0.0+, Mac 6.12.0+); the VLESS page documents
 *   username, flow, sni, reality-public-key and reality-short-id. The VMess and
 *   Trojan pages document ws, ws-path and ws-headers; there is no HTTP Upgrade
 *   transport, so such nodes are left out.
 * - Surfboard follows the Surge profile format but has no VLESS proxy type: its
 *   changelog says importing skips unsupported URIs such as vless://
 *   (https://getsurfboard.com/docs/changelog).
 * A node a client cannot use is skipped rather than written, since an unknown
 * proxy type can make the client reject the whole profile.
 */
type Client = "surge" | "surfboard";
type Tls = NodeSettings<"vmess">["tls"];
type Transport = NodeSettings<"vmess">["transport"];

const sharedCiphers = new Set([
    "aes-128-gcm",
    "aes-192-gcm",
    "aes-256-gcm",
    "chacha20-ietf-poly1305",
]);

function tlsOptions(tls: Tls, host: string): string[] | null {
    if (tls.ech.enabled || tls.alpn.length > 0) return null;
    return [`sni=${sniOf(tls, host)}`, `skip-cert-verify=${tls.allowInsecure}`];
}

function transportOptions(transport: Transport): string[] | null {
    if (transport.network === "tcp")
        return transport.headerType === "none" ? [] : null;
    if (transport.network !== "ws") return null;
    const path = wsEarlyData(transport.path || "/");
    if (path.maxEarlyData || !path.path.startsWith("/")) return null;
    return [
        "ws=true",
        `ws-path=${path.path}`,
        ...(transport.host ? [`ws-headers=Host:${transport.host}`] : []),
    ];
}

function proxy(entry: Entry, uuid: string, client: Client): string[] | null {
    const typed = typedSettings(entry.backend);
    const address = [entry.host, String(entry.port)];
    const host = entry.backend.host;
    switch (typed.protocol) {
        case "shadowsocks": {
            const { cipher, plugin } = typed.settings;
            if (plugin || !sharedCiphers.has(cipher)) return null;
            return [
                "ss",
                ...address,
                `encrypt-method=${cipher}`,
                `password=${shadowsocksPassword(cipher, entry.backend.serverSecret, uuid)}`,
                "udp-relay=true",
            ];
        }
        case "vmess":
        case "vless":
        case "trojan": {
            if (typed.protocol === "vless" && client === "surfboard")
                return null;
            const { settings, protocol } = typed;
            if (settings.security === "reality") {
                if (typed.protocol !== "vless") return null;
                const { flow, reality, transport } = typed.settings;
                if (
                    transport.network !== "tcp" ||
                    transport.headerType !== "none" ||
                    !reality.publicKey ||
                    !reality.serverName
                )
                    return null;
                return [
                    "vless",
                    ...address,
                    `username=${uuid}`,
                    `sni=${reality.serverName}`,
                    `reality-public-key=${reality.publicKey}`,
                    ...(reality.shortId
                        ? [`reality-short-id=${reality.shortId}`]
                        : []),
                    ...(flow ? [`flow=${flow}`] : []),
                    "udp-relay=true",
                ];
            }
            const tls =
                settings.security === "tls"
                    ? tlsOptions(settings.tls, host)
                    : [];
            const transport = transportOptions(settings.transport);
            if (!tls || !transport) return null;
            const flow = typed.protocol === "vless" ? typed.settings.flow : "";
            return [
                protocol,
                ...address,
                `${protocol === "trojan" ? "password" : "username"}=${uuid}`,
                ...(protocol !== "trojan"
                    ? [`tls=${settings.security === "tls"}`]
                    : []),
                ...(protocol === "vmess" ? ["vmess-aead=true"] : []),
                ...(flow ? [`flow=${flow}`] : []),
                ...tls,
                ...transport,
                "udp-relay=true",
            ];
        }
        case "http":
        case "socks": {
            const secure = typed.settings.security === "tls";
            const tls = secure ? tlsOptions(typed.settings.tls, host) : [];
            if (!tls) return null;
            const protocol =
                typed.protocol === "http"
                    ? secure
                        ? "https"
                        : "http"
                    : secure
                      ? "socks5-tls"
                      : "socks5";
            return [protocol, ...address, uuid, uuid, ...tls];
        }
        default:
            return null;
    }
}

/** The shared subset of the clients' documented INI profile syntax. */
export function iniProfile(entries: Entry[], uuid: string, client: Client) {
    const names: string[] = [];
    const lines = entries.flatMap((entry) => {
        const options = proxy(entry, uuid, client);
        if (!options || options.some((value) => /[,|\r\n]/.test(value)))
            return [];
        const name =
            `Node ${entry.id} ${entry.name.replace(/[^\p{L}\p{N}_. -]/gu, " ").trim()}`.trimEnd();
        names.push(name);
        return [`${name} = ${options.join(", ")}`];
    });
    if (lines.length === 0) return null;
    return [
        "[Proxy]",
        ...lines,
        "",
        "[Proxy Group]",
        `Xboard = select, ${names.join(", ")}`,
        "",
        "[Rule]",
        "FINAL, Xboard",
        "",
    ].join("\n");
}
