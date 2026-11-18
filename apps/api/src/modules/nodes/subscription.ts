import type { Node } from "@prisma/client";
import type { NodeSettings } from "@xboard/contracts";
import {
    wsEarlyData,
    echConfigBase64,
    echConfigPem,
    hopRanges,
    shadowsocksPassword,
    sniOf,
    typedSettings,
    type TypedSettings,
} from "./settings";

// Client configs, following the PHP panel's ClashMeta.php and SingBox.php.
// A relay child is listed with its own name, address and port and its
// parent's protocol settings; credentials come from the backend node.

/** One proxy in a subscription. */
export type Entry = {
    id: number;
    name: string;
    host: string;
    port: number;
    /** The node whose backend serves this entry (itself, or the relay's parent). */
    backend: Node;
};

export function entryFor(node: Node, parent?: Node | null): Entry {
    return {
        id: node.id,
        name: node.name,
        host: node.host,
        port: node.port,
        backend: parent ?? node,
    };
}

type Tls = NodeSettings<"naive">["tls"];
type Transport = NodeSettings<"vless">["transport"];
type Multiplex = NodeSettings<"vless">["multiplex"];
type V2ray = NodeSettings<"vless" | "vmess" | "trojan">;
type Proxy = Record<string, unknown>;

/** Where Xray-compatible clients carry WebSocket early data. */
const EARLY_DATA_HEADER = "Sec-WebSocket-Protocol";

const tagOf = (entry: Entry) => `${entry.name} #${entry.id}`;
const reality = (s: V2ray) => (s as NodeSettings<"vless">).reality;

function password(entry: Entry, typed: TypedSettings, uuid: string) {
    return typed.protocol === "shadowsocks"
        ? shadowsocksPassword(
              typed.settings.cipher,
              entry.backend.serverSecret,
              uuid,
          )
        : uuid;
}

/** SIP003 "k=v;flag" options. */
function pluginOptions(opts: string): Record<string, string | true> {
    const result: Record<string, string | true> = {};
    for (const pair of opts.split(";")) {
        const item = pair.trim();
        if (!item) continue;
        const index = item.indexOf("=");
        if (index < 0) result[item] = true;
        else result[item.slice(0, index).trim()] = item.slice(index + 1).trim();
    }
    return result;
}

// ---------- Mihomo ----------

function mihomoEch(tls: Tls): Proxy {
    if (!tls.ech.enabled) return {};
    const config = echConfigBase64(tls.ech.config);
    return {
        "ech-opts": {
            enable: true,
            ...(config ? { config } : {}),
            ...(tls.ech.queryServerName
                ? { "query-server-name": tls.ech.queryServerName }
                : {}),
        },
    };
}

function mihomoTransport(t: Transport): Proxy {
    const headers = t.host ? { headers: { Host: t.host } } : {};
    switch (t.network) {
        case "tcp":
            return t.headerType === "http"
                ? {
                      network: "http",
                      "http-opts": {
                          method: "GET",
                          path: [t.path || "/"],
                          ...(t.host ? { headers: { Host: [t.host] } } : {}),
                      },
                  }
                : { network: "tcp" };
        case "ws": {
            const early = wsEarlyData(t.path);
            return {
                network: "ws",
                "ws-opts": {
                    path: early.path,
                    ...headers,
                    ...(early.maxEarlyData
                        ? {
                              "max-early-data": early.maxEarlyData,
                              "early-data-header-name": EARLY_DATA_HEADER,
                          }
                        : {}),
                },
            };
        }
        case "grpc":
            return {
                network: "grpc",
                "grpc-opts": { "grpc-service-name": t.serviceName },
            };
        case "httpupgrade":
            return {
                network: "ws",
                "ws-opts": {
                    path: t.path || "/",
                    ...headers,
                    "v2ray-http-upgrade": true,
                },
            };
        case "xhttp":
            return {
                network: "xhttp",
                "xhttp-opts": {
                    path: t.path || "/",
                    ...(t.host ? { host: t.host } : {}),
                    mode: t.mode,
                },
            };
    }
}

function mihomoMux(m: Multiplex): Proxy {
    if (!m.enabled) return {};
    return {
        smux: {
            enabled: true,
            protocol: m.protocol,
            ...(m.maxConnections
                ? { "max-connections": m.maxConnections }
                : {}),
            ...(m.padding ? { padding: true } : {}),
            ...(m.brutal
                ? {
                      "brutal-opts": {
                          enabled: true,
                          up: m.brutalUpMbps,
                          down: m.brutalDownMbps,
                      },
                  }
                : {}),
        },
    };
}

/** TLS / Reality fields; `sniKey` is "servername" for VMess/VLESS, "sni" otherwise. */
function mihomoSecurity(
    s: V2ray,
    host: string,
    sniKey: "servername" | "sni",
): Proxy {
    if (s.security === "none") return {};
    const fingerprint = s.fingerprint
        ? { "client-fingerprint": s.fingerprint }
        : {};
    if (s.security === "reality") {
        const r = reality(s);
        return {
            tls: true,
            [sniKey]: r.serverName,
            "reality-opts": {
                "public-key": r.publicKey,
                "short-id": r.shortId,
            },
            // Reality needs a uTLS fingerprint.
            "client-fingerprint": s.fingerprint || "chrome",
        };
    }
    return {
        tls: true,
        [sniKey]: sniOf(s.tls, host),
        "skip-cert-verify": s.tls.allowInsecure,
        ...(s.tls.alpn.length ? { alpn: s.tls.alpn } : {}),
        ...mihomoEch(s.tls),
        ...fingerprint,
    };
}

function quicTls(tls: Tls, host: string): Proxy {
    return {
        sni: sniOf(tls, host),
        "skip-cert-verify": tls.allowInsecure,
        ...(tls.alpn.length ? { alpn: tls.alpn } : {}),
        ...mihomoEch(tls),
    };
}

function mihomoProxy(entry: Entry, uuid: string): Proxy | null {
    const typed = typedSettings(entry.backend);
    const backendHost = entry.backend.host;
    const base = { name: tagOf(entry), server: entry.host, port: entry.port };
    const secret = password(entry, typed, uuid);
    switch (typed.protocol) {
        case "vmess": {
            const s = typed.settings;
            return {
                ...base,
                type: "vmess",
                uuid,
                alterId: 0,
                cipher: "auto",
                udp: true,
                // Mihomo's VMess only uses XUDP when asked; Xray and sing-box servers speak it.
                "packet-encoding": "xudp",
                ...mihomoSecurity(s, backendHost, "servername"),
                ...mihomoTransport(s.transport),
                ...mihomoMux(s.multiplex),
            };
        }
        case "vless": {
            const s = typed.settings;
            return {
                ...base,
                type: "vless",
                uuid,
                udp: true,
                ...(s.flow ? { flow: s.flow } : {}),
                ...mihomoSecurity(s, backendHost, "servername"),
                ...mihomoTransport(s.transport),
                ...mihomoMux(s.multiplex),
            };
        }
        case "trojan": {
            const s = typed.settings;
            return {
                ...base,
                type: "trojan",
                password: uuid,
                udp: true,
                ...mihomoSecurity(s, backendHost, "sni"),
                ...mihomoTransport(s.transport),
                ...mihomoMux(s.multiplex),
            };
        }
        case "shadowsocks": {
            const s = typed.settings;
            const proxy: Proxy = {
                ...base,
                type: "ss",
                cipher: s.cipher,
                password: secret,
                udp: true,
            };
            if (s.plugin) {
                const opts = pluginOptions(s.pluginOpts);
                proxy.plugin = s.plugin;
                proxy["plugin-opts"] =
                    s.plugin === "obfs"
                        ? {
                              mode: opts.obfs ?? opts.mode ?? "http",
                              host:
                                  opts["obfs-host"] ??
                                  opts.host ??
                                  "www.bing.com",
                          }
                        : {
                              mode: opts.mode ?? "websocket",
                              tls: "tls" in opts,
                              ...(typeof opts.host === "string"
                                  ? { host: opts.host }
                                  : {}),
                              path:
                                  typeof opts.path === "string"
                                      ? opts.path
                                      : "/",
                              ...("mux" in opts ? { mux: true } : {}),
                          };
            }
            return proxy;
        }
        case "hysteria2": {
            const s = typed.settings;
            return {
                ...base,
                type: "hysteria2",
                password: secret,
                ...quicTls(s.tls, backendHost),
                ...(s.upMbps ? { up: s.upMbps } : {}),
                ...(s.downMbps ? { down: s.downMbps } : {}),
                ...(s.obfs
                    ? { obfs: s.obfs, "obfs-password": s.obfsPassword }
                    : {}),
                ...(s.ports ? { ports: s.ports } : {}),
                ...(s.ports && s.hopInterval
                    ? { "hop-interval": s.hopInterval }
                    : {}),
            };
        }
        case "hysteria": {
            const s = typed.settings;
            return {
                ...base,
                type: "hysteria",
                "auth-str": secret,
                protocol: "udp",
                up: s.upMbps,
                down: s.downMbps,
                ...quicTls(s.tls, backendHost),
                ...(s.obfsPassword ? { obfs: s.obfsPassword } : {}),
                ...(s.ports ? { ports: s.ports } : {}),
                ...(s.ports && s.hopInterval
                    ? { "hop-interval": s.hopInterval }
                    : {}),
            };
        }
        case "tuic": {
            const s = typed.settings;
            return {
                ...base,
                type: "tuic",
                ...(s.version === 4
                    ? { token: secret }
                    : { uuid, password: secret }),
                ...quicTls(s.tls, backendHost),
                alpn: s.tls.alpn.length ? s.tls.alpn : ["h3"],
                "congestion-controller": s.congestionControl,
                "udp-relay-mode": s.udpRelayMode,
            };
        }
        case "anytls": {
            const s = typed.settings;
            return {
                ...base,
                type: "anytls",
                password: secret,
                udp: true,
                ...quicTls(s.tls, backendHost),
            };
        }
        case "socks":
        case "http": {
            const s = typed.settings;
            const tls =
                s.security === "tls"
                    ? {
                          tls: true,
                          ...(typed.protocol === "http"
                              ? { sni: sniOf(s.tls, backendHost) }
                              : {}),
                          "skip-cert-verify": s.tls.allowInsecure,
                      }
                    : {};
            return {
                ...base,
                type: typed.protocol === "socks" ? "socks5" : "http",
                username: uuid,
                password: secret,
                ...(typed.protocol === "socks" ? { udp: true } : {}),
                ...tls,
            };
        }
        case "mieru": {
            const s = typed.settings;
            // Mihomo refuses `port` together with `port-range`.
            const { port: _, ...rest } = base;
            return {
                ...(s.ports ? { ...rest, "port-range": s.ports } : base),
                type: "mieru",
                transport: s.transport,
                udp: true,
                username: uuid,
                password: secret,
                ...(s.trafficPattern
                    ? { "traffic-pattern": s.trafficPattern }
                    : {}),
            };
        }
        case "naive":
            // Mihomo has no NaiveProxy outbound.
            return null;
    }
}

export function mihomo(entries: Entry[], uuid: string) {
    const proxies = entries
        .map((entry) => mihomoProxy(entry, uuid))
        .filter((proxy): proxy is Proxy => proxy !== null);
    return {
        "mixed-port": 7890,
        mode: "rule",
        proxies,
        "proxy-groups": [
            {
                name: "Proxy",
                type: "select",
                proxies: proxies.map((p) => p.name as string),
            },
        ],
        rules: ["MATCH,Proxy"],
    };
}

// ---------- sing-box ----------

function singTls(tls: Tls, host: string, fingerprint = ""): Proxy {
    const ech = tls.ech.enabled
        ? {
              ech: {
                  enabled: true,
                  ...(echConfigPem(tls.ech.config)
                      ? { config: echConfigPem(tls.ech.config) }
                      : {}),
                  ...(tls.ech.queryServerName
                      ? { query_server_name: tls.ech.queryServerName }
                      : {}),
              },
          }
        : {};
    return {
        enabled: true,
        server_name: sniOf(tls, host),
        insecure: tls.allowInsecure,
        ...(tls.alpn.length ? { alpn: tls.alpn } : {}),
        ...(fingerprint ? { utls: { enabled: true, fingerprint } } : {}),
        ...ech,
    };
}

function singSecurity(s: V2ray, host: string): Proxy {
    if (s.security === "none") return {};
    if (s.security === "reality") {
        const r = reality(s);
        return {
            tls: {
                enabled: true,
                server_name: r.serverName,
                // sing-box requires uTLS for Reality.
                utls: { enabled: true, fingerprint: s.fingerprint || "chrome" },
                reality: {
                    enabled: true,
                    public_key: r.publicKey,
                    short_id: r.shortId,
                },
            },
        };
    }
    return { tls: singTls(s.tls, host, s.fingerprint) };
}

/**
 * null: sing-box cannot express this transport. XHTTP does not exist there,
 * and its "http" transport is HTTP/2 once TLS is on, so it only matches Xray's
 * TCP HTTP disguise without TLS.
 */
function singTransport(t: Transport, tls: boolean): Proxy | null {
    switch (t.network) {
        case "tcp":
            if (t.headerType !== "http") return {};
            return tls
                ? null
                : {
                      transport: {
                          type: "http",
                          path: t.path || "/",
                          ...(t.host ? { host: [t.host] } : {}),
                          method: "GET",
                      },
                  };
        case "ws": {
            const early = wsEarlyData(t.path);
            return {
                transport: {
                    type: "ws",
                    path: early.path,
                    ...(t.host ? { headers: { Host: t.host } } : {}),
                    ...(early.maxEarlyData
                        ? {
                              max_early_data: early.maxEarlyData,
                              early_data_header_name: EARLY_DATA_HEADER,
                          }
                        : {}),
                },
            };
        }
        case "grpc":
            return { transport: { type: "grpc", service_name: t.serviceName } };
        case "httpupgrade":
            return {
                transport: {
                    type: "httpupgrade",
                    path: t.path || "/",
                    ...(t.host ? { host: t.host } : {}),
                },
            };
        case "xhttp":
            return null;
    }
}

function singMux(m: Multiplex): Proxy {
    if (!m.enabled) return {};
    return {
        multiplex: {
            enabled: true,
            protocol: m.protocol,
            ...(m.maxConnections ? { max_connections: m.maxConnections } : {}),
            padding: m.padding,
            ...(m.brutal
                ? {
                      brutal: {
                          enabled: true,
                          up_mbps: m.brutalUpMbps,
                          down_mbps: m.brutalDownMbps,
                      },
                  }
                : {}),
        },
    };
}

/** Port hopping: `server_ports` replaces `server_port` (they conflict in sing-box). */
function singPorts(entry: Entry, ports: string, hopInterval: number | null) {
    const ranges = hopRanges(ports);
    if (!ranges) return { server_port: entry.port };
    return {
        server_ports: ranges.map(([from, to]) => `${from}:${to}`),
        ...(hopInterval ? { hop_interval: `${hopInterval}s` } : {}),
    };
}

function singOutbound(entry: Entry, uuid: string): Proxy | null {
    const typed = typedSettings(entry.backend);
    const backendHost = entry.backend.host;
    const base = {
        tag: tagOf(entry),
        server: entry.host,
        server_port: entry.port,
    };
    const secret = password(entry, typed, uuid);
    switch (typed.protocol) {
        case "vmess":
        case "vless":
        case "trojan": {
            const s = typed.settings;
            const transport = singTransport(s.transport, s.security !== "none");
            if (!transport) return null;
            const credentials =
                typed.protocol === "vmess"
                    ? {
                          uuid,
                          security: "auto",
                          alter_id: 0,
                          packet_encoding: "xudp",
                      }
                    : typed.protocol === "vless"
                      ? {
                            uuid,
                            packet_encoding: "xudp",
                            ...(typed.settings.flow
                                ? { flow: typed.settings.flow }
                                : {}),
                        }
                      : { password: uuid };
            return {
                ...base,
                type: typed.protocol,
                ...credentials,
                ...singSecurity(s, backendHost),
                ...transport,
                ...singMux(s.multiplex),
            };
        }
        case "shadowsocks": {
            const s = typed.settings;
            return {
                ...base,
                type: "shadowsocks",
                method: s.cipher,
                password: secret,
                ...(s.plugin
                    ? {
                          plugin: s.plugin === "obfs" ? "obfs-local" : s.plugin,
                          plugin_opts: s.pluginOpts,
                      }
                    : {}),
            };
        }
        case "hysteria2": {
            const s = typed.settings;
            const { server_port: _, ...rest } = base;
            return {
                ...rest,
                type: "hysteria2",
                ...singPorts(entry, s.ports, s.hopInterval),
                password: secret,
                ...(s.upMbps ? { up_mbps: s.upMbps } : {}),
                ...(s.downMbps ? { down_mbps: s.downMbps } : {}),
                ...(s.obfs
                    ? { obfs: { type: s.obfs, password: s.obfsPassword } }
                    : {}),
                tls: singTls(s.tls, backendHost),
            };
        }
        case "hysteria": {
            const s = typed.settings;
            const { server_port: _, ...rest } = base;
            return {
                ...rest,
                type: "hysteria",
                ...singPorts(entry, s.ports, s.hopInterval),
                auth_str: secret,
                up_mbps: s.upMbps,
                down_mbps: s.downMbps,
                ...(s.obfsPassword ? { obfs: s.obfsPassword } : {}),
                tls: singTls(s.tls, backendHost),
            };
        }
        case "tuic": {
            const s = typed.settings;
            // sing-box only speaks TUIC v5.
            if (s.version !== 5) return null;
            return {
                ...base,
                type: "tuic",
                uuid,
                password: secret,
                congestion_control: s.congestionControl,
                udp_relay_mode: s.udpRelayMode,
                zero_rtt_handshake: false,
                heartbeat: "10s",
                tls: {
                    ...singTls(s.tls, backendHost),
                    alpn: s.tls.alpn.length ? s.tls.alpn : ["h3"],
                },
            };
        }
        case "anytls": {
            const s = typed.settings;
            return {
                ...base,
                type: "anytls",
                password: secret,
                tls: singTls(s.tls, backendHost),
            };
        }
        case "socks": {
            // sing-box's SOCKS client has no TLS.
            if (typed.settings.security === "tls") return null;
            return {
                ...base,
                type: "socks",
                version: "5",
                username: uuid,
                password: secret,
            };
        }
        case "http": {
            const s = typed.settings;
            return {
                ...base,
                type: "http",
                username: uuid,
                password: secret,
                ...(s.security === "tls"
                    ? { tls: singTls(s.tls, backendHost) }
                    : {}),
            };
        }
        case "naive": {
            // sing-box 1.13+ (builds with cronet). Its naive TLS takes only
            // server_name and ECH.
            const tls = singTls(typed.settings.tls, backendHost);
            return {
                ...base,
                type: "naive",
                username: uuid,
                password: secret,
                tls: {
                    enabled: true,
                    server_name: tls.server_name,
                    ...(tls.ech ? { ech: tls.ech } : {}),
                },
            };
        }
        case "mieru":
            // sing-box has no mieru outbound.
            return null;
    }
}

export function singbox(entries: Entry[], uuid: string) {
    const outbounds = entries
        .map((entry) => singOutbound(entry, uuid))
        .filter((outbound): outbound is Proxy => outbound !== null);
    return {
        inbounds: [
            {
                type: "mixed",
                tag: "mixed-in",
                listen: "127.0.0.1",
                listen_port: 7890,
            },
        ],
        outbounds: [
            {
                type: "selector",
                tag: "Proxy",
                outbounds: outbounds.map((o) => o.tag as string),
            },
            ...outbounds,
        ],
        route: { final: "Proxy" },
    };
}
