import type { Node } from "@prisma/client";
import type { NodeSettings } from "@xboard/contracts";
import {
    jsonObjects,
    nodeCertConfig,
    nodeRoutes,
    sniOf,
    ss2022ServerKey,
    typedSettings,
    xrayNetworkSettings,
} from "./settings";

// What node software receives from GET /api/v1/server/UniProxy/config.
// Field names follow the PHP panel (ServerService::buildNodeConfig) and
// what V2bX reads (api/panel/node.go): snake_case, `tls` as 0/1/2, Xray-style
// `network_settings`, Reality options inside `tls_settings`.

type Tls = NodeSettings<"naive">["tls"];
type Multiplex = NodeSettings<"vless">["multiplex"];
type Reality = NodeSettings<"vless">["reality"];

function tlsSettings(tls: Tls, host: string) {
    return {
        server_name: sniOf(tls, host),
        allow_insecure: tls.allowInsecure,
        ...(tls.alpn.length ? { alpn: tls.alpn } : {}),
        ...(tls.ech.enabled
            ? {
                  ech: {
                      enabled: true,
                      config: tls.ech.config || null,
                      query_server_name: tls.ech.queryServerName || null,
                      key: tls.ech.key || null,
                  },
              }
            : {}),
    };
}

/** V2bX joins `server_name` and `server_port` into the Reality dest. */
function realitySettings(reality: Reality) {
    return {
        server_name: reality.serverName,
        server_port: String(reality.serverPort),
        public_key: reality.publicKey,
        private_key: reality.privateKey,
        short_id: reality.shortId,
    };
}

function multiplex(m: Multiplex) {
    return m.enabled
        ? {
              enabled: true,
              protocol: m.protocol,
              max_connections: m.maxConnections,
              padding: m.padding,
              brutal: {
                  enabled: m.brutal,
                  up_mbps: m.brutalUpMbps ?? 0,
                  down_mbps: m.brutalDownMbps ?? 0,
              },
          }
        : null;
}

/** dns_env "KEY=VALUE" lines as an object. */
function envObject(lines: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const line of lines.split(/\r?\n/)) {
        const index = line.indexOf("=");
        if (index > 0)
            env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
    return env;
}

/** The config for a backend node (never a relay child). */
export function nodeConfig(node: Node) {
    const typed = typedSettings(node);
    const routes = nodeRoutes(node).map((rule, index) => ({
        id: index + 1,
        match: rule.match,
        action: rule.action,
        action_value: rule.actionValue || null,
    }));
    const common = {
        protocol: typed.protocol,
        listen_ip: "0.0.0.0",
        host: node.host,
        server_port: node.serverPort,
        server_name: node.host,
        routes,
        base_config: { push_interval: 60, pull_interval: 60 },
    };

    let config: Record<string, unknown>;
    switch (typed.protocol) {
        case "vmess":
        case "vless":
        case "trojan": {
            const s = typed.settings;
            const networkSettings = xrayNetworkSettings(s.transport);
            const reality = s.security === "reality";
            config = {
                ...common,
                server_name: reality
                    ? (s as NodeSettings<"vless">).reality.serverName
                    : sniOf(s.tls, node.host),
                network: s.transport.network,
                network_settings: networkSettings,
                networkSettings,
                tls: s.security === "tls" ? 1 : reality ? 2 : 0,
                tls_settings: reality
                    ? realitySettings((s as NodeSettings<"vless">).reality)
                    : tlsSettings(s.tls, node.host),
                multiplex: multiplex(s.multiplex),
                ...(typed.protocol === "vless"
                    ? { flow: typed.settings.flow }
                    : {}),
            };
            break;
        }
        case "shadowsocks": {
            const s = typed.settings;
            config = {
                ...common,
                cipher: s.cipher,
                plugin: s.plugin || null,
                plugin_opts: s.pluginOpts || null,
                server_key: ss2022ServerKey(s.cipher, node.serverSecret),
            };
            break;
        }
        case "hysteria2": {
            const s = typed.settings;
            config = {
                ...common,
                version: 2,
                server_name: sniOf(s.tls, node.host),
                tls_settings: tlsSettings(s.tls, node.host),
                ignore_client_bandwidth:
                    s.upMbps === null && s.downMbps === null,
                up_mbps: s.upMbps ?? 0,
                down_mbps: s.downMbps ?? 0,
                obfs: s.obfs,
                "obfs-password": s.obfs ? s.obfsPassword : "",
            };
            break;
        }
        case "hysteria": {
            const s = typed.settings;
            config = {
                ...common,
                version: 1,
                server_name: sniOf(s.tls, node.host),
                tls_settings: tlsSettings(s.tls, node.host),
                up_mbps: s.upMbps ?? 0,
                down_mbps: s.downMbps ?? 0,
                obfs: s.obfsPassword,
            };
            break;
        }
        case "tuic": {
            const s = typed.settings;
            config = {
                ...common,
                version: s.version,
                server_name: sniOf(s.tls, node.host),
                tls_settings: tlsSettings(s.tls, node.host),
                congestion_control: s.congestionControl,
                udp_relay_mode: s.udpRelayMode,
                alpn: s.tls.alpn.length ? s.tls.alpn : ["h3"],
                auth_timeout: "3s",
                zero_rtt_handshake: false,
                heartbeat: "3s",
            };
            break;
        }
        case "anytls": {
            const s = typed.settings;
            config = {
                ...common,
                server_name: sniOf(s.tls, node.host),
                tls_settings: tlsSettings(s.tls, node.host),
                ...(s.paddingScheme.length
                    ? { padding_scheme: s.paddingScheme }
                    : {}),
            };
            break;
        }
        case "socks":
        case "http": {
            const s = typed.settings;
            config = {
                ...common,
                tls: s.security === "tls" ? 1 : 0,
                tls_settings: tlsSettings(s.tls, node.host),
            };
            break;
        }
        case "naive": {
            const s = typed.settings;
            config = {
                ...common,
                server_name: sniOf(s.tls, node.host),
                tls: 1,
                tls_settings: tlsSettings(s.tls, node.host),
            };
            break;
        }
        case "mieru": {
            const s = typed.settings;
            config = {
                ...common,
                transport: s.transport,
                traffic_pattern: s.trafficPattern,
                ...(s.ports ? { port_range: s.ports } : {}),
            };
            break;
        }
    }

    const customOutbounds = jsonObjects(node.customOutbounds);
    const customRoutes = jsonObjects(node.customRoutes);
    const cert = nodeCertConfig(node);
    return {
        ...config,
        ...(customOutbounds.length
            ? { custom_outbounds: customOutbounds }
            : {}),
        ...(customRoutes.length ? { custom_routes: customRoutes } : {}),
        ...(cert.mode !== "none"
            ? {
                  cert_config: {
                      cert_mode: cert.mode,
                      cert_domain: cert.domain,
                      cert_file: cert.certFile,
                      key_file: cert.keyFile,
                      provider: cert.provider,
                      email: cert.email,
                      dns_env: envObject(cert.dnsEnv),
                  },
              }
            : {}),
    };
}

const XRAY_NETWORK_KEY = {
    tcp: "tcpSettings",
    ws: "wsSettings",
    grpc: "grpcSettings",
    httpupgrade: "httpupgradeSettings",
    xhttp: "xhttpSettings",
} as const;

/** Xray `streamSettings` for the XrayR Deepbwork (legacy V2board) adapter. */
export function xrayStreamSettings(node: Node) {
    const typed = typedSettings(node);
    if (
        typed.protocol !== "vmess" &&
        typed.protocol !== "vless" &&
        typed.protocol !== "trojan"
    )
        return { network: "tcp", security: "none" };
    const s = typed.settings;
    const network = s.transport.network;
    const r = (s as NodeSettings<"vless">).reality;
    return {
        network,
        security: s.security,
        ...(s.security === "tls"
            ? { tlsSettings: { serverName: sniOf(s.tls, node.host) } }
            : {}),
        ...(s.security === "reality"
            ? {
                  realitySettings: {
                      dest: `${r.serverName}:${r.serverPort}`,
                      serverNames: [r.serverName],
                      privateKey: r.privateKey,
                      shortIds: [r.shortId],
                  },
              }
            : {}),
        [XRAY_NETWORK_KEY[network]]: xrayNetworkSettings(s.transport),
    };
}
