// Node configuration: the UniProxy config node backends receive, the Mihomo
// and sing-box subscription output, validation, traffic rates and relays.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { parse as parseYaml } from "yaml";
import type { Node } from "@prisma/client";
import { nodeBody, type NodeProtocol } from "@xboard/contracts";
import { db } from "../src/db";
import {
    nodeConfig,
    xrayStreamSettings,
} from "../src/modules/nodes/node-config";
import {
    applyRate,
    currentRate,
    shadowsocksPassword,
} from "../src/modules/nodes/settings";
import {
    shadowrocket,
    shadowrocketBuild,
    shadowrocketLinks,
} from "../src/modules/nodes/shadowrocket";
import { iniProfile } from "../src/modules/nodes/ini-profile";
import { loon } from "../src/modules/nodes/loon";
import { quantumultx } from "../src/modules/nodes/quantumultx";
import { entryFor, mihomo, singbox } from "../src/modules/nodes/subscription";
import { formatForUserAgent } from "../src/modules/nodes/subscription-routes";
import { startTestApp } from "./helpers";

const UUID = "c0ffee00-1234-4abc-8def-0123456789ab";
const SECRET = "0123456789abcdef0123456789abcdef";
const PUBLIC_KEY = "Z84J2IelR9ch3k8VtlVhhs5ycBUlXA7wHBWcBrjqnAw";
const PRIVATE_KEY = "SGxmYmJ3NnNkY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHk";

let nextId = 1;
function fakeNode(
    protocol: NodeProtocol,
    settings: Record<string, unknown> = {},
    extra: Partial<Node> = {},
): Node {
    return {
        id: nextId++,
        name: `${protocol}-node`,
        protocol,
        host: "node.example.test",
        port: 443,
        serverPort: 8443,
        settings,
        serverSecret: SECRET,
        enabled: true,
        visible: true,
        tags: [],
        rate: 1,
        rateRanges: [],
        routes: [],
        customOutbounds: [],
        customRoutes: [],
        certConfig: {},
        parentId: null,
        tokenHash: "00",
        lastSeenAt: null,
        status: null,
        createdAt: new Date(),
        deletedAt: null,
        ...extra,
    } as Node;
}

/** `actual` contains every key of `expected` with equal values (recursively); `undefined` means absent. */
function assertSubset(actual: unknown, expected: unknown, path = "$"): void {
    if (
        expected &&
        typeof expected === "object" &&
        !Array.isArray(expected) &&
        actual &&
        typeof actual === "object"
    ) {
        for (const [key, value] of Object.entries(expected)) {
            const inner = (actual as Record<string, unknown>)[key];
            if (value === undefined)
                assert.ok(
                    !(key in (actual as object)),
                    `${path}.${key} should be absent`,
                );
            else assertSubset(inner, value, `${path}.${key}`);
        }
        return;
    }
    assert.deepEqual(actual, expected, path);
}

function outputs(node: Node) {
    const entry = entryFor(node);
    const clash = mihomo([entry], UUID).proxies[0] ?? null;
    const sing = singbox([entry], UUID).outbounds[1] ?? null;
    return { config: nodeConfig(node), clash, sing };
}

type Case = {
    name: string;
    node: Node;
    config: Record<string, unknown>;
    /** null: the format cannot express this node and leaves it out. */
    clash: Record<string, unknown> | null;
    sing: Record<string, unknown> | null;
};

const reality = {
    serverName: "www.microsoft.com",
    serverPort: 443,
    publicKey: PUBLIC_KEY,
    privateKey: PRIVATE_KEY,
    shortId: "0123abcd",
};

const cases: Case[] = [
    {
        name: "vless tls + tcp (defaults)",
        node: fakeNode("vless"),
        config: {
            protocol: "vless",
            server_port: 8443,
            network: "tcp",
            networkSettings: { header: { type: "none" } },
            tls: 1,
            tls_settings: {
                server_name: "node.example.test",
                allow_insecure: false,
            },
            flow: "",
            encryption: undefined,
        },
        clash: {
            type: "vless",
            server: "node.example.test",
            port: 443,
            uuid: UUID,
            tls: true,
            servername: "node.example.test",
            network: "tcp",
            flow: undefined,
        },
        sing: {
            type: "vless",
            server_port: 443,
            uuid: UUID,
            tls: {
                enabled: true,
                server_name: "node.example.test",
                insecure: false,
            },
            transport: undefined,
        },
    },
    {
        name: "vless reality + tcp + vision",
        node: fakeNode("vless", {
            security: "reality",
            flow: "xtls-rprx-vision",
            reality,
        }),
        config: {
            tls: 2,
            flow: "xtls-rprx-vision",
            server_name: "www.microsoft.com",
            tls_settings: {
                server_name: "www.microsoft.com",
                server_port: "443",
                public_key: PUBLIC_KEY,
                private_key: PRIVATE_KEY,
                short_id: "0123abcd",
            },
        },
        clash: {
            tls: true,
            flow: "xtls-rprx-vision",
            servername: "www.microsoft.com",
            "reality-opts": {
                "public-key": PUBLIC_KEY,
                "short-id": "0123abcd",
            },
            "client-fingerprint": "chrome",
        },
        sing: {
            flow: "xtls-rprx-vision",
            tls: {
                enabled: true,
                server_name: "www.microsoft.com",
                utls: { enabled: true, fingerprint: "chrome" },
                reality: {
                    enabled: true,
                    public_key: PUBLIC_KEY,
                    short_id: "0123abcd",
                },
            },
        },
    },
    {
        name: "vless reality + grpc with a firefox fingerprint",
        node: fakeNode("vless", {
            security: "reality",
            fingerprint: "firefox",
            reality,
            transport: { network: "grpc", serviceName: "tun" },
        }),
        config: {
            tls: 2,
            network: "grpc",
            network_settings: { serviceName: "tun" },
        },
        clash: {
            network: "grpc",
            "grpc-opts": { "grpc-service-name": "tun" },
            "client-fingerprint": "firefox",
        },
        sing: {
            transport: { type: "grpc", service_name: "tun" },
            tls: { utls: { enabled: true, fingerprint: "firefox" } },
        },
    },
    {
        name: "vless tls + ws with Host, ALPN, insecure, ECH and uTLS",
        node: fakeNode("vless", {
            tls: {
                serverName: "cdn.example.test",
                allowInsecure: true,
                alpn: ["h2", "http/1.1"],
                ech: {
                    enabled: true,
                    config: "AEX+DQBB",
                    queryServerName: "public.example.test",
                    key: "server-only-key",
                },
            },
            fingerprint: "safari",
            transport: {
                network: "ws",
                path: "/ws?ed=2048",
                host: "cdn.example.test",
            },
        }),
        config: {
            network: "ws",
            networkSettings: {
                path: "/ws?ed=2048",
                host: "cdn.example.test",
                headers: { Host: "cdn.example.test" },
            },
            tls_settings: {
                server_name: "cdn.example.test",
                allow_insecure: true,
                alpn: ["h2", "http/1.1"],
                ech: { enabled: true, key: "server-only-key" },
            },
        },
        clash: {
            servername: "cdn.example.test",
            "skip-cert-verify": true,
            alpn: ["h2", "http/1.1"],
            "client-fingerprint": "safari",
            "ech-opts": {
                enable: true,
                config: "AEX+DQBB",
                "query-server-name": "public.example.test",
            },
            network: "ws",
            "ws-opts": {
                path: "/ws",
                headers: { Host: "cdn.example.test" },
                "max-early-data": 2048,
                "early-data-header-name": "Sec-WebSocket-Protocol",
            },
        },
        sing: {
            tls: {
                insecure: true,
                alpn: ["h2", "http/1.1"],
                utls: { enabled: true, fingerprint: "safari" },
                ech: {
                    enabled: true,
                    config: [
                        "-----BEGIN ECH CONFIGS-----",
                        "AEX+DQBB",
                        "-----END ECH CONFIGS-----",
                    ],
                    query_server_name: "public.example.test",
                },
            },
            transport: {
                type: "ws",
                path: "/ws",
                headers: { Host: "cdn.example.test" },
                max_early_data: 2048,
                early_data_header_name: "Sec-WebSocket-Protocol",
            },
        },
    },
    {
        name: "vless tls + httpupgrade",
        node: fakeNode("vless", {
            transport: {
                network: "httpupgrade",
                path: "/up",
                host: "up.example.test",
            },
        }),
        config: {
            network: "httpupgrade",
            networkSettings: { path: "/up", host: "up.example.test" },
        },
        clash: {
            network: "ws",
            "ws-opts": {
                path: "/up",
                headers: { Host: "up.example.test" },
                "v2ray-http-upgrade": true,
            },
        },
        sing: {
            transport: {
                type: "httpupgrade",
                path: "/up",
                host: "up.example.test",
            },
        },
    },
    {
        name: "vless tls + xhttp (left out of sing-box)",
        node: fakeNode("vless", {
            transport: { network: "xhttp", path: "/x", mode: "packet-up" },
        }),
        config: {
            network: "xhttp",
            networkSettings: { path: "/x", mode: "packet-up" },
        },
        clash: {
            network: "xhttp",
            "xhttp-opts": { path: "/x", mode: "packet-up" },
        },
        sing: null,
    },
    {
        name: "vless tls + tcp with multiplex and brutal",
        node: fakeNode("vless", {
            multiplex: {
                enabled: true,
                protocol: "h2mux",
                maxConnections: 4,
                padding: true,
                brutal: true,
                brutalUpMbps: 50,
                brutalDownMbps: 200,
            },
        }),
        config: {
            multiplex: {
                enabled: true,
                protocol: "h2mux",
                max_connections: 4,
                padding: true,
                brutal: { enabled: true, up_mbps: 50, down_mbps: 200 },
            },
        },
        clash: {
            smux: {
                enabled: true,
                protocol: "h2mux",
                "max-connections": 4,
                padding: true,
                "brutal-opts": { enabled: true, up: 50, down: 200 },
            },
        },
        sing: {
            multiplex: {
                enabled: true,
                protocol: "h2mux",
                max_connections: 4,
                padding: true,
                brutal: { enabled: true, up_mbps: 50, down_mbps: 200 },
            },
        },
    },
    {
        name: "vmess without TLS, TCP with an HTTP header",
        node: fakeNode("vmess", {
            security: "none",
            transport: {
                network: "tcp",
                headerType: "http",
                path: "/",
                host: "www.qq.com",
            },
        }),
        config: {
            tls: 0,
            network: "tcp",
            networkSettings: {
                header: {
                    type: "http",
                    request: { path: ["/"], headers: { Host: ["www.qq.com"] } },
                },
            },
        },
        clash: {
            type: "vmess",
            alterId: 0,
            cipher: "auto",
            "packet-encoding": "xudp",
            tls: undefined,
            network: "http",
            "http-opts": {
                method: "GET",
                path: ["/"],
                headers: { Host: ["www.qq.com"] },
            },
        },
        sing: {
            type: "vmess",
            alter_id: 0,
            packet_encoding: "xudp",
            tls: undefined,
            transport: { type: "http", path: "/", host: ["www.qq.com"] },
        },
    },
    {
        name: "vmess tls + grpc",
        node: fakeNode("vmess", {
            transport: { network: "grpc", serviceName: "vm" },
        }),
        config: {
            tls: 1,
            network: "grpc",
            networkSettings: { serviceName: "vm" },
        },
        clash: {
            tls: true,
            network: "grpc",
            "grpc-opts": { "grpc-service-name": "vm" },
        },
        sing: {
            tls: { enabled: true },
            transport: { type: "grpc", service_name: "vm" },
        },
    },
    {
        name: "vmess tls + ws",
        node: fakeNode("vmess", { transport: { network: "ws", path: "/vm" } }),
        config: { network: "ws", networkSettings: { path: "/vm" } },
        clash: { network: "ws", "ws-opts": { path: "/vm" } },
        sing: { transport: { type: "ws", path: "/vm" } },
    },
    {
        name: "trojan tls + tcp uses sni",
        node: fakeNode("trojan", { tls: { serverName: "tj.example.test" } }),
        config: {
            tls: 1,
            server_name: "tj.example.test",
            network: "tcp",
            networkSettings: { header: { type: "none" } },
        },
        clash: {
            type: "trojan",
            password: UUID,
            sni: "tj.example.test",
            servername: undefined,
            network: "tcp",
        },
        sing: {
            type: "trojan",
            password: UUID,
            tls: { enabled: true, server_name: "tj.example.test" },
        },
    },
    {
        name: "trojan tls + ws",
        node: fakeNode("trojan", {
            transport: { network: "ws", path: "/t" },
        }),
        config: { network: "ws", networkSettings: { path: "/t" } },
        clash: { network: "ws", "ws-opts": { path: "/t" } },
        sing: { transport: { type: "ws", path: "/t" } },
    },
    {
        name: "vless tls + TCP HTTP disguise (left out of sing-box, where it would be HTTP/2)",
        node: fakeNode("vless", {
            transport: { network: "tcp", headerType: "http", path: "/a" },
        }),
        config: {
            tls: 1,
            networkSettings: {
                header: { type: "http", request: { path: ["/a"] } },
            },
        },
        clash: { network: "http", "http-opts": { path: ["/a"] } },
        sing: null,
    },
    {
        name: "trojan reality + tcp",
        node: fakeNode("trojan", { security: "reality", reality }),
        config: { tls: 2, tls_settings: { public_key: PUBLIC_KEY } },
        clash: {
            sni: "www.microsoft.com",
            "reality-opts": {
                "public-key": PUBLIC_KEY,
                "short-id": "0123abcd",
            },
        },
        sing: { tls: { reality: { enabled: true, public_key: PUBLIC_KEY } } },
    },
    {
        name: "shadowsocks aes-128-gcm",
        node: fakeNode("shadowsocks"),
        config: { cipher: "aes-128-gcm", server_key: null, plugin: null },
        clash: { type: "ss", cipher: "aes-128-gcm", password: UUID, udp: true },
        sing: { type: "shadowsocks", method: "aes-128-gcm", password: UUID },
    },
    {
        name: "shadowsocks 2022 with server and user keys",
        node: fakeNode("shadowsocks", { cipher: "2022-blake3-aes-128-gcm" }),
        config: {
            cipher: "2022-blake3-aes-128-gcm",
            server_key: Buffer.from(SECRET.slice(0, 16)).toString("base64"),
        },
        clash: {
            password: `${Buffer.from(SECRET.slice(0, 16)).toString("base64")}:${Buffer.from(UUID.slice(0, 16)).toString("base64")}`,
        },
        sing: {
            password: `${Buffer.from(SECRET.slice(0, 16)).toString("base64")}:${Buffer.from(UUID.slice(0, 16)).toString("base64")}`,
        },
    },
    {
        name: "shadowsocks with obfs",
        node: fakeNode("shadowsocks", {
            plugin: "obfs",
            pluginOpts: "obfs=tls;obfs-host=cloud.example.test",
        }),
        config: {
            plugin: "obfs",
            plugin_opts: "obfs=tls;obfs-host=cloud.example.test",
        },
        clash: {
            plugin: "obfs",
            "plugin-opts": { mode: "tls", host: "cloud.example.test" },
        },
        sing: {
            plugin: "obfs-local",
            plugin_opts: "obfs=tls;obfs-host=cloud.example.test",
        },
    },
    {
        name: "shadowsocks with v2ray-plugin",
        node: fakeNode("shadowsocks", {
            plugin: "v2ray-plugin",
            pluginOpts: "tls;host=v2.example.test;path=/ss",
        }),
        config: { plugin: "v2ray-plugin" },
        clash: {
            plugin: "v2ray-plugin",
            "plugin-opts": {
                mode: "websocket",
                tls: true,
                host: "v2.example.test",
                path: "/ss",
            },
        },
        sing: {
            plugin: "v2ray-plugin",
            plugin_opts: "tls;host=v2.example.test;path=/ss",
        },
    },
    {
        name: "hysteria2 without options",
        node: fakeNode("hysteria2"),
        config: {
            server_port: 8443,
            ignore_client_bandwidth: true,
            obfs: "",
            "obfs-password": "",
            up_mbps: 0,
        },
        clash: {
            type: "hysteria2",
            password: UUID,
            sni: "node.example.test",
            up: undefined,
            obfs: undefined,
            ports: undefined,
        },
        sing: {
            type: "hysteria2",
            server_port: 443,
            server_ports: undefined,
            obfs: undefined,
        },
    },
    {
        name: "hysteria2 with salamander, bandwidth and port hopping",
        node: fakeNode("hysteria2", {
            obfs: "salamander",
            obfsPassword: "obfs-pass",
            upMbps: 100,
            downMbps: 500,
            ports: "20000-30000,40000-50000",
            hopInterval: 30,
        }),
        config: {
            obfs: "salamander",
            "obfs-password": "obfs-pass",
            up_mbps: 100,
            down_mbps: 500,
            ignore_client_bandwidth: false,
        },
        clash: {
            obfs: "salamander",
            "obfs-password": "obfs-pass",
            up: 100,
            down: 500,
            ports: "20000-30000,40000-50000",
            "hop-interval": 30,
        },
        sing: {
            server_port: undefined,
            server_ports: ["20000:30000", "40000:50000"],
            hop_interval: "30s",
            up_mbps: 100,
            obfs: { type: "salamander", password: "obfs-pass" },
        },
    },
    {
        name: "hysteria v1",
        node: fakeNode("hysteria", {
            upMbps: 50,
            downMbps: 100,
            obfsPassword: "v1-obfs",
        }),
        config: { version: 1, up_mbps: 50, down_mbps: 100, obfs: "v1-obfs" },
        clash: {
            type: "hysteria",
            "auth-str": UUID,
            up: 50,
            down: 100,
            obfs: "v1-obfs",
        },
        sing: {
            type: "hysteria",
            auth_str: UUID,
            up_mbps: 50,
            down_mbps: 100,
            obfs: "v1-obfs",
        },
    },
    {
        name: "tuic v5 with bbr and quic relay",
        node: fakeNode("tuic", {
            congestionControl: "bbr",
            udpRelayMode: "quic",
        }),
        config: {
            version: 5,
            congestion_control: "bbr",
            udp_relay_mode: "quic",
            alpn: ["h3"],
            zero_rtt_handshake: false,
        },
        clash: {
            type: "tuic",
            uuid: UUID,
            password: UUID,
            alpn: ["h3"],
            "congestion-controller": "bbr",
            "udp-relay-mode": "quic",
        },
        sing: {
            type: "tuic",
            congestion_control: "bbr",
            udp_relay_mode: "quic",
            tls: { alpn: ["h3"] },
        },
    },
    {
        name: "tuic v4 (left out of sing-box)",
        node: fakeNode("tuic", { version: 4 }),
        config: { version: 4 },
        clash: { token: UUID, uuid: undefined },
        sing: null,
    },
    {
        name: "anytls with a padding scheme",
        node: fakeNode("anytls", { paddingScheme: ["stop=8", "0=30-30"] }),
        config: { padding_scheme: ["stop=8", "0=30-30"] },
        clash: { type: "anytls", password: UUID, sni: "node.example.test" },
        sing: { type: "anytls", password: UUID, tls: { enabled: true } },
    },
    {
        name: "socks without TLS",
        node: fakeNode("socks"),
        config: { tls: 0 },
        clash: {
            type: "socks5",
            username: UUID,
            password: UUID,
            tls: undefined,
        },
        sing: { type: "socks", version: "5", username: UUID },
    },
    {
        name: "socks over TLS (left out of sing-box)",
        node: fakeNode("socks", { security: "tls" }),
        config: { tls: 1 },
        clash: { type: "socks5", tls: true },
        sing: null,
    },
    {
        name: "http over TLS",
        node: fakeNode("http", {
            security: "tls",
            tls: { serverName: "px.example.test" },
        }),
        config: { tls: 1, tls_settings: { server_name: "px.example.test" } },
        clash: { type: "http", tls: true, sni: "px.example.test" },
        sing: { type: "http", tls: { server_name: "px.example.test" } },
    },
    {
        name: "naive (sing-box only)",
        node: fakeNode("naive", { tls: { serverName: "nv.example.test" } }),
        config: { protocol: "naive", tls: 1 },
        clash: null,
        sing: {
            type: "naive",
            server_port: 443,
            username: UUID,
            password: UUID,
            tls: {
                enabled: true,
                server_name: "nv.example.test",
                insecure: undefined,
                utls: undefined,
            },
        },
    },
    {
        name: "mieru over UDP with a port range",
        node: fakeNode("mieru", {
            transport: "UDP",
            ports: "30000-30100",
            trafficPattern: "GgQIARAK",
        }),
        config: {
            transport: "UDP",
            traffic_pattern: "GgQIARAK",
            port_range: "30000-30100",
        },
        clash: {
            type: "mieru",
            port: undefined,
            transport: "UDP",
            "port-range": "30000-30100",
            "traffic-pattern": "GgQIARAK",
            udp: true,
            username: UUID,
        },
        sing: null,
    },
];

describe("node config and subscription output", () => {
    for (const c of cases)
        it(c.name, () => {
            const out = outputs(c.node);
            assertSubset(out.config, c.config, "config");
            if (c.clash === null) assert.equal(out.clash, null, "mihomo");
            else assertSubset(out.clash, c.clash, "mihomo");
            if (c.sing === null) assert.equal(out.sing, null, "sing-box");
            else assertSubset(out.sing, c.sing, "sing-box");
            // Server-only secrets never reach clients.
            const client = JSON.stringify([out.clash, out.sing]);
            assert.ok(!client.includes(PRIVATE_KEY));
            assert.ok(!client.includes("server-only-key"));
        });

    it("sends routes, custom outbounds/routes and certificate settings to the node", () => {
        const config = nodeConfig(
            fakeNode(
                "vless",
                {},
                {
                    routes: [
                        {
                            match: ["regexp:.*\\.ads\\..*"],
                            action: "block",
                            actionValue: "",
                        },
                        {
                            match: ["geosite:netflix"],
                            action: "dns",
                            actionValue: "1.1.1.1",
                        },
                    ],
                    customOutbounds: [{ tag: "warp", protocol: "wireguard" }],
                    customRoutes: [
                        { outboundTag: "warp", domain: ["geosite:openai"] },
                    ],
                    certConfig: {
                        mode: "dns",
                        domain: "node.example.test",
                        provider: "cloudflare",
                        email: "ops@example.test",
                        dnsEnv: "CF_DNS_API_TOKEN=abc\nCF_ZONE_API_TOKEN=def",
                    },
                },
            ),
        );
        assertSubset(config, {
            routes: [
                {
                    id: 1,
                    match: ["regexp:.*\\.ads\\..*"],
                    action: "block",
                    action_value: null,
                },
                {
                    id: 2,
                    match: ["geosite:netflix"],
                    action: "dns",
                    action_value: "1.1.1.1",
                },
            ],
            custom_outbounds: [{ tag: "warp", protocol: "wireguard" }],
            custom_routes: [
                { outboundTag: "warp", domain: ["geosite:openai"] },
            ],
            cert_config: {
                cert_mode: "dns",
                cert_domain: "node.example.test",
                provider: "cloudflare",
                dns_env: { CF_DNS_API_TOKEN: "abc", CF_ZONE_API_TOKEN: "def" },
            },
        });
        const plain = nodeConfig(fakeNode("vless"));
        assert.ok(!("cert_config" in plain) && !("custom_outbounds" in plain));
    });

    it("gives the XrayR legacy adapter matching Xray stream settings", () => {
        assert.deepEqual(
            xrayStreamSettings(
                fakeNode("vless", {
                    security: "reality",
                    reality,
                    transport: { network: "grpc", serviceName: "g" },
                }),
            ),
            {
                network: "grpc",
                security: "reality",
                realitySettings: {
                    dest: "www.microsoft.com:443",
                    serverNames: ["www.microsoft.com"],
                    privateKey: PRIVATE_KEY,
                    shortIds: ["0123abcd"],
                },
                grpcSettings: { serviceName: "g" },
            },
        );
        assert.deepEqual(
            xrayStreamSettings(
                fakeNode("vmess", { transport: { network: "ws", path: "/w" } }),
            ),
            {
                network: "ws",
                security: "tls",
                tlsSettings: { serverName: "node.example.test" },
                wsSettings: { path: "/w" },
            },
        );
    });

    it("lists a relay child with its own address and the parent's settings", () => {
        const parent = fakeNode("vless", {
            security: "reality",
            reality,
            flow: "xtls-rprx-vision",
        });
        const child = fakeNode(
            "vless",
            {},
            {
                name: "relay",
                host: "relay.example.test",
                port: 10443,
                parentId: parent.id,
            },
        );
        const proxy = mihomo([entryFor(child, parent)], UUID).proxies[0]!;
        assertSubset(proxy, {
            name: `relay #${child.id}`,
            server: "relay.example.test",
            port: 10443,
            flow: "xtls-rprx-vision",
            servername: "www.microsoft.com",
        });
        // TLS without an SNI falls back to the backend's address, not the relay's.
        const tlsParent = fakeNode("trojan");
        const tlsChild = fakeNode("trojan", {}, { host: "relay.example.test" });
        assert.equal(
            mihomo([entryFor(tlsChild, tlsParent)], UUID).proxies[0]!.sni,
            "node.example.test",
        );
    });
});

describe("node settings validation", () => {
    const base = {
        name: "n",
        host: "node.example.test",
        port: 443,
        enabled: true,
        planIds: [],
    };
    const issues = (body: Record<string, unknown>) => {
        const result = nodeBody.safeParse({ ...base, ...body });
        return result.success
            ? []
            : result.error.issues.map((issue) => issue.path.join("."));
    };

    it("accepts every protocol with default settings", () => {
        for (const protocol of [
            "vless",
            "vmess",
            "trojan",
            "shadowsocks",
            "hysteria2",
            "tuic",
            "anytls",
            "socks",
            "http",
            "naive",
            "mieru",
        ])
            assert.deepEqual(issues({ protocol }), [], protocol);
    });

    it("rejects Reality without keys or with a bad short id", () => {
        assert.deepEqual(
            issues({ protocol: "vless", settings: { security: "reality" } }),
            [
                "settings.reality.serverName",
                "settings.reality.publicKey",
                "settings.reality.privateKey",
            ],
        );
        assert.deepEqual(
            issues({
                protocol: "vless",
                settings: {
                    security: "reality",
                    reality: { ...reality, shortId: "abc" },
                },
            }),
            ["settings.reality.shortId"],
        );
        assert.deepEqual(
            issues({
                protocol: "vless",
                settings: { security: "reality", reality },
            }),
            [],
        );
    });

    it("rejects transports and flows the protocol cannot carry", () => {
        assert.deepEqual(
            issues({
                protocol: "trojan",
                settings: { transport: { network: "xhttp" } },
            }),
            ["settings.transport.network"],
        );
        assert.deepEqual(
            issues({
                protocol: "vless",
                settings: {
                    security: "reality",
                    reality,
                    transport: { network: "ws" },
                },
            }),
            ["settings.transport.network"],
        );
        assert.deepEqual(
            issues({
                protocol: "vless",
                settings: {
                    flow: "xtls-rprx-vision",
                    transport: { network: "ws" },
                },
            }),
            ["settings.flow"],
        );
        assert.deepEqual(
            issues({
                protocol: "vless",
                settings: { security: "none", flow: "xtls-rprx-vision" },
            }),
            ["settings.flow"],
        );
        assert.deepEqual(
            issues({
                protocol: "vless",
                settings: {
                    flow: "xtls-rprx-vision",
                    multiplex: { enabled: true },
                },
            }),
            ["settings.multiplex.enabled"],
        );
        assert.deepEqual(
            issues({ protocol: "vmess", settings: { security: "reality" } }),
            ["settings.security"],
        );
        // Xray-core removed HTTP/2; V2bX and Mihomo run Trojan over tcp/ws/grpc only.
        assert.deepEqual(
            issues({
                protocol: "vless",
                settings: { transport: { network: "h2" } },
            }),
            ["settings.transport.network"],
        );
        assert.deepEqual(
            issues({
                protocol: "trojan",
                settings: { transport: { network: "httpupgrade" } },
            }),
            ["settings.transport.network"],
        );
        assert.deepEqual(
            issues({
                protocol: "trojan",
                settings: { transport: { network: "tcp", headerType: "http" } },
            }),
            ["settings.transport.headerType"],
        );
    });

    it("rejects incomplete protocol options", () => {
        assert.deepEqual(
            issues({ protocol: "hysteria2", settings: { obfs: "salamander" } }),
            ["settings.obfsPassword"],
        );
        assert.deepEqual(issues({ protocol: "hysteria" }), [
            "settings.upMbps",
            "settings.downMbps",
        ]);
        assert.deepEqual(
            issues({
                protocol: "hysteria2",
                settings: { ports: "50000-40000" },
            }),
            ["settings.ports"],
        );
        assert.deepEqual(
            issues({
                protocol: "shadowsocks",
                settings: { cipher: "rc4-md5" },
            }),
            ["settings.cipher"],
        );
        assert.deepEqual(
            issues({
                protocol: "vless",
                settings: { multiplex: { enabled: true, brutal: true } },
            }),
            [
                "settings.multiplex.brutalUpMbps",
                "settings.multiplex.brutalDownMbps",
            ],
        );
        assert.deepEqual(
            issues({
                protocol: "vless",
                settings: { transport: { path: "no-slash" } },
            }),
            ["settings.transport.path"],
        );
    });

    it("rejects bad rates, time ranges and certificate settings", () => {
        assert.deepEqual(issues({ protocol: "vless", rate: 1.234 }), ["rate"]);
        assert.deepEqual(issues({ protocol: "vless", rate: -1 }), ["rate"]);
        assert.deepEqual(
            issues({
                protocol: "vless",
                rateRanges: [{ start: "24:00", end: "06:00", rate: 0.5 }],
            }),
            ["rateRanges.0.start"],
        );
        assert.deepEqual(
            issues({ protocol: "vless", certConfig: { mode: "file" } }),
            ["certConfig.certFile", "certConfig.keyFile"],
        );
        assert.deepEqual(
            issues({ protocol: "vless", customOutbounds: "not json" }),
            ["customOutbounds"],
        );
        assert.deepEqual(
            issues({
                protocol: "vless",
                routes: [{ match: [], action: "block" }],
            }),
            ["routes.0.match"],
        );
    });
});

describe("traffic rate", () => {
    const node = {
        rate: 1.5,
        rateRanges: [
            { start: "23:00", end: "06:59", rate: 0.5 },
            { start: "18:00", end: "21:59", rate: 2 },
        ],
    };
    /** A Date at the given Asia/Shanghai wall-clock time. */
    const shanghai = (hhmm: string) => new Date(`2026-11-18T${hhmm}:00+08:00`);

    it("uses the first matching Shanghai time range, wrapping past midnight", () => {
        assert.equal(currentRate(node, shanghai("23:30")), 0.5);
        assert.equal(currentRate(node, shanghai("03:00")), 0.5);
        assert.equal(currentRate(node, shanghai("06:59")), 0.5);
        assert.equal(currentRate(node, shanghai("07:00")), 1.5);
        assert.equal(currentRate(node, shanghai("21:59")), 2);
        assert.equal(
            currentRate({ rate: 1, rateRanges: [] }, shanghai("12:00")),
            1,
        );
    });

    it("rounds charged bytes to the nearest byte", () => {
        assert.equal(applyRate(1001n, 1.5), 1502n);
        assert.equal(applyRate(10n ** 15n, 0.01), 10n ** 13n);
        assert.equal(applyRate(123n, 0), 0n);
    });

    it("derives Shadowsocks 2022 passwords the way V2bX does", () => {
        assert.equal(shadowsocksPassword("aes-128-gcm", SECRET, UUID), UUID);
        assert.equal(
            shadowsocksPassword("2022-blake3-aes-256-gcm", SECRET, UUID),
            `${Buffer.from(SECRET).toString("base64")}:${Buffer.from(UUID.slice(0, 32)).toString("base64")}`,
        );
    });
});

describe("node admin, relays and rates end to end", () => {
    type Harness = Awaited<ReturnType<typeof startTestApp>>;
    let t: Harness;
    let admin = "";
    let planA = 0;
    let planB = 0;
    let userA = { id: 0, uuid: "" };
    let userB = { id: 0, uuid: "" };

    // YAML is a superset of JSON: this reads API responses and Mihomo configs alike.
    const json = async (response: Response) => {
        const body = parseYaml(await response.text()) as Record<
            string,
            unknown
        >;
        return { status: response.status, body };
    };
    const node = (path: string, query: string) =>
        t.call(`/v1/server/UniProxy/${path}?${query}`);

    before(async () => {
        t = await startTestApp();
        await t.createUser("nodes-admin@example.test", "nodes-admin-pass", {
            role: "admin",
        });
        admin = await t.cookieFor(
            "nodes-admin@example.test",
            "nodes-admin-pass",
        );
        const expires = new Date(Date.now() + 30 * 86_400_000);
        for (const name of ["A", "B"]) {
            const plan = await db.plan.create({
                data: { name, transferEnable: 10n ** 12n, published: true },
            });
            if (name === "A") planA = plan.id;
            else planB = plan.id;
        }
        const a = await t.createUser("plan-a@example.test", "plan-a-password", {
            planId: planA,
            expiredAt: expires,
            transferEnable: 10n ** 12n,
        });
        const b = await t.createUser("plan-b@example.test", "plan-b-password", {
            planId: planB,
            expiredAt: expires,
            transferEnable: 10n ** 12n,
        });
        userA = { id: a.id, uuid: a.proxyUuid };
        userB = { id: b.id, uuid: b.proxyUuid };
    });
    after(async () => {
        await t?.stop();
    });

    const body = (extra: Record<string, unknown>) => ({
        name: "Backend",
        protocol: "vless",
        host: "backend.example.test",
        port: 443,
        enabled: true,
        planIds: [planA],
        ...extra,
    });

    it("serves relay users and charges traffic at the backend's rate", async () => {
        const created = await json(
            await t.call("/admin/nodes", {
                cookie: admin,
                body: body({
                    port: 443,
                    serverPort: 10443,
                    rate: 2,
                    tags: ["香港", "IPLC"],
                    settings: {
                        security: "reality",
                        flow: "xtls-rprx-vision",
                        reality,
                    },
                }),
            }),
        );
        assert.equal(created.status, 201);
        const parentId = created.body.id as number;
        const token = created.body.token as string;
        const query = `node_id=${parentId}&node_type=vless&token=${token}`;

        const config = await json(await node("config", query));
        assertSubset(config.body, {
            server_port: 10443,
            tls: 2,
            flow: "xtls-rprx-vision",
            tls_settings: { private_key: PRIVATE_KEY },
        });

        // A relay with another plan, its own address, and no settings of its own.
        const relay = await json(
            await t.call("/admin/nodes", {
                cookie: admin,
                body: body({
                    name: "Relay",
                    host: "relay.example.test",
                    port: 20443,
                    parentId,
                    planIds: [planB],
                }),
            }),
        );
        assert.equal(relay.status, 201);
        assert.equal(relay.body.token, undefined, "relays have no node key");
        const relayId = relay.body.id as number;

        const users = await json(await node("user", query));
        assert.deepEqual(
            (users.body.users as { id: number }[]).map((user) => user.id),
            [userA.id, userB.id],
        );

        // The relay cannot authenticate as a backend.
        const rotated = await t.call(`/admin/nodes/${relayId}/token`, {
            cookie: admin,
            method: "POST",
        });
        assert.equal(rotated.status, 400);

        const push = await t.call(`/v1/server/UniProxy/push?${query}`, {
            body: { [userA.id]: [100, 1000], [userB.id]: [1, 3] },
        });
        assert.equal(push.status, 201);
        const charged = await db.user.findMany({
            where: { id: { in: [userA.id, userB.id] } },
            orderBy: { id: "asc" },
            select: { upload: true, download: true },
        });
        assert.deepEqual(charged, [
            { upload: 200n, download: 2000n },
            { upload: 2n, download: 6n },
        ]);
        const records = await db.trafficRecord.findMany({
            where: { nodeId: parentId },
            orderBy: { userId: "asc" },
            select: { upload: true, download: true },
        });
        assert.deepEqual(records, [
            { upload: 200n, download: 2000n },
            { upload: 2n, download: 6n },
        ]);

        // Plan B's subscription lists the relay with the parent's Reality settings.
        const subscription = await json(
            await t.call("/account/subscription", {
                cookie: await t.cookieFor(
                    "plan-b@example.test",
                    "plan-b-password",
                ),
            }),
        );
        const sub = await json(
            await fetch(
                `${subscription.body.mihomo as string}`.replace(
                    /^https?:\/\/[^/]+/,
                    t.baseUrl,
                ),
            ),
        );
        const proxies = sub.body.proxies as Record<string, unknown>[];
        assert.equal(proxies.length, 1);
        assertSubset(proxies[0], {
            name: `Relay #${relayId}`,
            server: "relay.example.test",
            port: 20443,
            uuid: userB.uuid,
            flow: "xtls-rprx-vision",
            "reality-opts": { "public-key": PUBLIC_KEY },
        });

        // Relays block deleting or re-protocolling their parent.
        assert.equal(
            (
                await t.call(`/admin/nodes/${parentId}`, {
                    cookie: admin,
                    method: "DELETE",
                })
            ).status,
            409,
        );
        assert.equal(
            (
                await t.call(`/admin/nodes/${parentId}`, {
                    cookie: admin,
                    method: "PUT",
                    body: body({ protocol: "trojan" }),
                })
            ).status,
            400,
        );
        // A relay must match its parent's protocol and cannot chain.
        assert.equal(
            (
                await t.call("/admin/nodes", {
                    cookie: admin,
                    body: body({ protocol: "trojan", parentId }),
                })
            ).status,
            400,
        );
        assert.equal(
            (
                await t.call("/admin/nodes", {
                    cookie: admin,
                    body: body({ parentId: relayId }),
                })
            ).status,
            400,
        );

        // Disabling the parent drops the relay from subscriptions.
        assert.equal(
            (
                await t.call(`/admin/nodes/${parentId}/enabled`, {
                    cookie: admin,
                    method: "PUT",
                    body: { enabled: false },
                })
            ).status,
            200,
        );
        const after = await fetch(
            `${subscription.body.mihomo as string}`.replace(
                /^https?:\/\/[^/]+/,
                t.baseUrl,
            ),
        );
        assert.equal(after.status, 400);
    });

    it("keeps hidden nodes out of subscriptions but serves their users", async () => {
        const created = await json(
            await t.call("/admin/nodes", {
                cookie: admin,
                body: body({
                    name: "Hidden",
                    protocol: "trojan",
                    visible: false,
                    rateRanges: [{ start: "00:00", end: "23:59", rate: 0 }],
                }),
            }),
        );
        const shown = await json(
            await t.call("/admin/nodes", {
                cookie: admin,
                body: body({ name: "Shown", protocol: "hysteria2" }),
            }),
        );
        assert.equal(shown.status, 201);
        const query = `node_id=${created.body.id as number}&node_type=trojan&token=${created.body.token as string}`;
        const users = await json(await node("user", query));
        assert.ok(
            (users.body.users as { id: number }[]).some(
                (user) => user.id === userA.id,
            ),
        );
        // A free time range: reported traffic is not charged.
        const before = await db.user.findUniqueOrThrow({
            where: { id: userA.id },
        });
        await t.call(`/v1/server/UniProxy/push?${query}`, {
            body: { [userA.id]: [5000, 5000] },
        });
        const afterPush = await db.user.findUniqueOrThrow({
            where: { id: userA.id },
        });
        assert.equal(afterPush.upload, before.upload);

        const links = await json(
            await t.call("/account/subscription", {
                cookie: await t.cookieFor(
                    "plan-a@example.test",
                    "plan-a-password",
                ),
            }),
        );
        const rocket = await fetch(
            `${t.baseUrl}${new URL(links.body.url as string).pathname}`,
            { headers: { "user-agent": "Shadowrocket/2592 CFNetwork/3826" } },
        );
        assert.equal(rocket.status, 200);
        assert.match(rocket.headers.get("content-type") ?? "", /^text\/plain/);
        assert.ok(rocket.headers.get("subscription-userinfo"));
        const shared = Buffer.from(await rocket.text(), "base64").toString();
        assert.match(shared, /^STATUS=/);
        assert.match(shared, /\r\nhysteria2:\/\//);
        assert.ok(!shared.includes("Hidden"));
        for (const [agent, start] of [
            ["Quantumult%20X/1.5.2", "hysteria2="],
            ["Loon/3.3.6", "Shown #"],
        ] as const) {
            const response = await fetch(
                `${t.baseUrl}${new URL(links.body.url as string).pathname}`,
                { headers: { "user-agent": agent } },
            );
            // Quantumult X has no Hysteria2: the plan's only visible node is left out.
            if (start === "hysteria2=") {
                assert.equal(response.status, 400, agent);
                continue;
            }
            assert.equal(response.status, 200, agent);
            assert.ok(response.headers.get("subscription-userinfo"));
            const text = await response.text();
            assert.ok(text.startsWith(start), text);
            assert.ok(text.includes("= Hysteria2,"), text);
        }
        for (const format of ["mihomo", "singbox"]) {
            const sub = await json(
                await fetch(
                    `${t.baseUrl}${new URL(links.body.url as string).pathname}?format=${format}`,
                ),
            );
            const names = JSON.stringify(sub.body);
            assert.ok(
                names.includes(`Shown #${shown.body.id as number}`),
                format,
            );
            assert.ok(!names.includes("Hidden"), format);
        }
    });

    it("round-trips every option through the admin API", async () => {
        const input = body({
            name: "Full",
            serverPort: 8443,
            visible: false,
            tags: ["a"],
            rate: 0.75,
            rateRanges: [{ start: "22:00", end: "02:00", rate: 1.25 }],
            routes: [
                { match: ["geosite:cn"], action: "block", actionValue: "" },
            ],
            customOutbounds: [{ tag: "direct-v6", protocol: "freedom" }],
            customRoutes: [],
            certConfig: { mode: "http", domain: "backend.example.test" },
            settings: {
                security: "tls",
                tls: { serverName: "sni.example.test", alpn: ["h2"] },
                transport: { network: "grpc", serviceName: "svc" },
                fingerprint: "chrome",
            },
        });
        const created = await json(
            await t.call("/admin/nodes", { cookie: admin, body: input }),
        );
        assert.equal(created.status, 201);
        const list = (await (
            await t.call("/admin/nodes", { cookie: admin })
        ).json()) as Record<string, unknown>[];
        const saved = list.find((n) => n.id === created.body.id)!;
        assertSubset(saved, {
            serverPort: 8443,
            visible: false,
            tags: ["a"],
            rate: 0.75,
            rateRanges: [{ start: "22:00", end: "02:00", rate: 1.25 }],
            customOutbounds: [{ tag: "direct-v6", protocol: "freedom" }],
            certConfig: { mode: "http", domain: "backend.example.test" },
            settings: {
                tls: { serverName: "sni.example.test", alpn: ["h2"] },
                transport: { network: "grpc", serviceName: "svc" },
                fingerprint: "chrome",
                flow: "",
            },
        });
        // The saved shape is accepted back as a body unchanged.
        const { id, lastSeenAt, plans, ...rest } = saved;
        void id;
        void lastSeenAt;
        const again = await t.call(
            `/admin/nodes/${created.body.id as number}`,
            {
                cookie: admin,
                method: "PUT",
                body: {
                    ...rest,
                    planIds: (plans as { planId: number }[]).map(
                        (p) => p.planId,
                    ),
                },
            },
        );
        assert.equal(again.status, 200);
        // Validation errors come back as 400 with the field path.
        const bad = await t.call("/admin/nodes", {
            cookie: admin,
            body: body({ settings: { security: "reality" } }),
        });
        assert.equal(bad.status, 400);
    });
});

describe("Shadowrocket share links", () => {
    /** scheme, the part before "?", query params and the decoded #name. */
    function parse(link: string) {
        const [, scheme, rest] = /^([a-z0-9]+):\/\/(.*)$/.exec(link)!;
        const [beforeHash, hash = ""] = rest!.split("#");
        const [main, search = ""] = beforeHash!.split("?");
        return {
            scheme,
            main: main!,
            params: Object.fromEntries(new URLSearchParams(search)),
            name: decodeURIComponent(hash),
        };
    }
    const one = (node: Node, userAgent?: string, parent?: Node) =>
        shadowrocketLinks([entryFor(node, parent)], UUID, userAgent)[0];

    it("encodes VLESS Reality + Vision in Shadowrocket's own form", () => {
        const node = fakeNode("vless", {
            security: "reality",
            flow: "xtls-rprx-vision",
            reality,
        });
        const link = parse(one(node)!);
        assert.equal(link.scheme, "vless");
        assert.equal(
            Buffer.from(link.main, "base64").toString(),
            `auto:${UUID}@node.example.test:443`,
        );
        assertSubset(link.params, {
            remark: `vless-node #${node.id}`,
            tls: "1",
            sni: "www.microsoft.com",
            pbk: PUBLIC_KEY,
            sid: "0123abcd",
            fp: "chrome",
            xtls: "2",
            obfs: undefined,
        });
        assert.ok(!one(node)!.includes(PRIVATE_KEY));
    });

    it("maps every VMess/VLESS transport", () => {
        const cases: [
            Record<string, unknown>,
            Record<string, string | undefined>,
        ][] = [
            [
                {
                    transport: {
                        network: "ws",
                        path: "/ws",
                        host: "cdn.example.test",
                    },
                },
                {
                    obfs: "websocket",
                    path: "/ws",
                    obfsParam: "cdn.example.test",
                    tls: "1",
                    peer: "node.example.test",
                },
            ],
            [
                { transport: { network: "grpc", serviceName: "svc" } },
                { obfs: "grpc", path: "svc", host: "node.example.test" },
            ],
            [
                {
                    transport: {
                        network: "httpupgrade",
                        path: "/up",
                        host: "up.example.test",
                    },
                },
                {
                    obfs: "httpupgrade",
                    path: "/up",
                    obfsParam: "up.example.test",
                },
            ],
            [
                {
                    transport: {
                        network: "xhttp",
                        path: "/x",
                        mode: "packet-up",
                    },
                },
                { obfs: "xhttp", path: "/x", mode: "packet-up" },
            ],
            [
                {
                    security: "none",
                    transport: {
                        network: "tcp",
                        headerType: "http",
                        path: "/",
                        host: "www.qq.com",
                    },
                },
                {
                    obfs: "http",
                    path: "/",
                    obfsParam: "www.qq.com",
                    tls: undefined,
                },
            ],
            [
                {
                    tls: {
                        serverName: "sni.example.test",
                        allowInsecure: true,
                        alpn: ["h2"],
                    },
                    fingerprint: "safari",
                },
                {
                    tls: "1",
                    peer: "sni.example.test",
                    allowInsecure: "1",
                    alpn: "h2",
                    fp: "safari",
                    obfs: undefined,
                },
            ],
        ];
        for (const [settings, expected] of cases) {
            assertSubset(
                parse(one(fakeNode("vless", settings))!).params,
                expected,
            );
            if (
                (settings.transport as { network?: string } | undefined)
                    ?.network !== "xhttp"
            )
                assertSubset(parse(one(fakeNode("vmess", settings))!).params, {
                    ...expected,
                    alterId: "0",
                    fp: expected.fp,
                });
        }
    });

    it("encodes Trojan TLS, WebSocket, gRPC and Reality", () => {
        const ws = parse(
            one(
                fakeNode("trojan", {
                    tls: { serverName: "tj.example.test" },
                    transport: {
                        network: "ws",
                        path: "/t",
                        host: "cdn.example.test",
                    },
                }),
            )!,
        );
        assert.equal(ws.main, `${UUID}@node.example.test:443`);
        assertSubset(ws.params, {
            peer: "tj.example.test",
            plugin: "obfs-local;obfs=websocket;obfs-host=cdn.example.test;obfs-uri=/t",
        });
        assertSubset(
            parse(
                one(
                    fakeNode("trojan", {
                        transport: { network: "grpc", serviceName: "g" },
                    }),
                )!,
            ).params,
            { obfs: "grpc", path: "g" },
        );
        assertSubset(
            parse(one(fakeNode("trojan", { security: "reality", reality }))!)
                .params,
            {
                security: "reality",
                sni: "www.microsoft.com",
                pbk: PUBLIC_KEY,
                sid: "0123abcd",
                fp: "chrome",
            },
        );
    });

    it("encodes Shadowsocks as SIP002, with 2022 keys and plugins", () => {
        const plain = parse(one(fakeNode("shadowsocks"))!);
        assert.equal(plain.scheme, "ss");
        const [userinfo, address] = plain.main.split("@");
        assert.equal(
            Buffer.from(userinfo!, "base64url").toString(),
            `aes-128-gcm:${UUID}`,
        );
        assert.equal(address, "node.example.test:443");
        const ss2022 = parse(
            one(
                fakeNode("shadowsocks", { cipher: "2022-blake3-aes-128-gcm" }),
            )!,
        );
        assert.equal(
            Buffer.from(ss2022.main.split("@")[0]!, "base64url").toString(),
            `2022-blake3-aes-128-gcm:${shadowsocksPassword("2022-blake3-aes-128-gcm", SECRET, UUID)}`,
        );
        const obfs = one(
            fakeNode("shadowsocks", {
                plugin: "obfs",
                pluginOpts: "obfs=http;obfs-host=www.bing.com",
            }),
        )!;
        assert.equal(
            new URLSearchParams(obfs.split("?")[1]!.split("#")[0]).get(
                "plugin",
            ),
            "obfs-local;obfs=http;obfs-host=www.bing.com",
        );
        assert.ok(obfs.includes("@node.example.test:443/?plugin="));
    });

    it("encodes Hysteria2, Hysteria, TUIC, AnyTLS and SOCKS", () => {
        const hy2 = parse(
            one(
                fakeNode("hysteria2", {
                    obfs: "salamander",
                    obfsPassword: "op",
                    upMbps: 100,
                    downMbps: 500,
                    ports: "20000-30000",
                    tls: { serverName: "hy.example.test" },
                }),
            )!,
        );
        assert.equal(hy2.main, `${UUID}@node.example.test:443`);
        assertSubset(hy2.params, {
            peer: "hy.example.test",
            insecure: "0",
            obfs: "salamander",
            "obfs-password": "op",
            upmbps: "100",
            downmbps: "500",
            mport: "20000-30000",
        });
        assertSubset(parse(one(fakeNode("hysteria2"))!).params, {
            obfs: "none",
            "obfs-password": undefined,
            upmbps: undefined,
            mport: undefined,
        });
        assertSubset(
            parse(
                one(
                    fakeNode("hysteria", {
                        upMbps: 50,
                        downMbps: 100,
                        obfsPassword: "x",
                    }),
                )!,
            ).params,
            {
                auth: UUID,
                upmbps: "50",
                downmbps: "100",
                protocol: "udp",
                obfs: "xplus",
                obfsParam: "x",
            },
        );
        assertSubset(
            parse(one(fakeNode("tuic", { congestionControl: "bbr" }))!).params,
            {
                uuid: UUID,
                password: UUID,
                alpn: "h3",
                congestion_control: "bbr",
                udp_relay_mode: "native",
                token: undefined,
            },
        );
        assertSubset(parse(one(fakeNode("tuic", { version: 4 }))!).params, {
            token: UUID,
            uuid: undefined,
        });
        const anytls = parse(one(fakeNode("anytls"))!);
        assert.equal(anytls.main, `${UUID}@node.example.test:443`);
        assertSubset(anytls.params, {
            sni: "node.example.test",
            insecure: "0",
        });
        const socks = parse(one(fakeNode("socks"))!);
        assert.equal(
            Buffer.from(socks.main, "base64").toString(),
            `${UUID}:${UUID}@node.example.test:443`,
        );
        assert.equal(one(fakeNode("socks", { security: "tls" })), undefined);
        for (const protocol of ["http", "naive", "mieru"] as const)
            assert.equal(one(fakeNode(protocol)), undefined, protocol);
    });

    it("leaves out protocols an older Shadowrocket build cannot read", () => {
        assert.equal(
            one(fakeNode("hysteria2"), "Shadowrocket/1900 CFNetwork/1410"),
            undefined,
        );
        assert.ok(
            one(fakeNode("hysteria2"), "Shadowrocket/1993 CFNetwork/1410"),
        );
        assert.equal(one(fakeNode("anytls"), "Shadowrocket/2591"), undefined);
        assert.ok(one(fakeNode("anytls"), "Shadowrocket/2592"));
        assert.equal(
            shadowrocketBuild("Shadowrocket/2592 CFNetwork/3826.500"),
            2592,
        );
        assert.equal(shadowrocketBuild("ClashMeta"), null);
    });

    it("lists a relay at its own address with the backend's SNI", () => {
        const parent = fakeNode("trojan");
        const child = fakeNode(
            "trojan",
            {},
            { name: "relay", host: "relay.example.test", port: 10443 },
        );
        const link = parse(one(child, undefined, parent)!);
        assert.equal(link.main, `${UUID}@relay.example.test:10443`);
        assert.equal(link.params.peer, "node.example.test");
        assert.equal(link.name, `relay #${child.id}`);
    });

    it("wraps the links in base64 after a STATUS line", () => {
        const { body, count } = shadowrocket(
            [entryFor(fakeNode("vless")), entryFor(fakeNode("naive"))],
            UUID,
            {
                upload: 1024n ** 3n,
                download: 2n * 1024n ** 3n,
                total: 100n * 1024n ** 3n,
                expiredAt: new Date("2026-12-31T20:00:00Z"),
            },
        );
        assert.equal(count, 1);
        const lines = Buffer.from(body, "base64").toString().split("\r\n");
        assert.equal(
            lines[0],
            "STATUS=🚀↑:1.00GB,↓:2.00GB,TOT:100.00GB💡Expires:2027-01-01",
        );
        assert.match(lines[1]!, /^vless:\/\//);
        assert.equal(lines[2], "");
    });

    it("picks Shadowrocket from the User-Agent", () => {
        assert.equal(
            formatForUserAgent(
                "Shadowrocket/2592 CFNetwork/3826.500.131 Darwin/24.5.0",
            ),
            "shadowrocket",
        );
        assert.equal(formatForUserAgent("SFI/1.14.4"), "singbox");
        assert.equal(formatForUserAgent("clash-verge/v2.4.2"), "mihomo");
    });
});

describe("Quantumult X server lines", () => {
    const one = (node: Node, parent?: Node) =>
        quantumultx([entryFor(node, parent)], UUID)[0];
    /** "vless=host:port, k=v, …" → { _: "vless=host:port", k: v } */
    const fields = (text: string) => {
        const [head, ...rest] = text.split(", ");
        return {
            _: head,
            ...Object.fromEntries(
                rest.map((pair) => {
                    const index = pair.indexOf("=");
                    return [pair.slice(0, index), pair.slice(index + 1)];
                }),
            ),
        } as Record<string, string>;
    };

    it("writes VLESS Reality + Vision with the Reality keys", () => {
        const node = fakeNode("vless", {
            security: "reality",
            flow: "xtls-rprx-vision",
            reality,
        });
        assert.deepEqual(fields(one(node)!), {
            _: "vless=node.example.test:443",
            method: "none",
            password: UUID,
            obfs: "over-tls",
            "obfs-host": "www.microsoft.com",
            "reality-base64-pubkey": PUBLIC_KEY,
            "reality-hex-shortid": "0123abcd",
            "vless-flow": "xtls-rprx-vision",
            "fast-open": "false",
            "udp-relay": "true",
            tag: `vless-node #${node.id}`,
        });
        assert.ok(!one(node)!.includes(PRIVATE_KEY));
    });

    it("maps VMess/VLESS TLS, WebSocket and the HTTP disguise", () => {
        assertSubset(
            fields(
                one(
                    fakeNode("vmess", {
                        tls: {
                            serverName: "sni.example.test",
                            allowInsecure: true,
                            alpn: ["h2", "http/1.1"],
                        },
                    }),
                )!,
            ),
            {
                _: "vmess=node.example.test:443",
                method: "chacha20-poly1305",
                obfs: "over-tls",
                "obfs-host": "sni.example.test",
                "tls-verification": "false",
                "tls-alpn": "02683208687474702f312e31",
            },
        );
        assertSubset(
            fields(
                one(
                    fakeNode("vless", {
                        transport: {
                            network: "ws",
                            path: "/ws?ed=2048",
                            host: "cdn.example.test",
                        },
                    }),
                )!,
            ),
            {
                obfs: "wss",
                "obfs-host": "cdn.example.test",
                "obfs-uri": "/ws",
                "tls-verification": "true",
            },
        );
        assertSubset(
            fields(
                one(
                    fakeNode("vmess", {
                        security: "none",
                        transport: { network: "ws", path: "/w" },
                    }),
                )!,
            ),
            {
                obfs: "ws",
                "obfs-uri": "/w",
                "obfs-host": undefined,
                "tls-verification": undefined,
            },
        );
        assertSubset(
            fields(
                one(
                    fakeNode("vmess", {
                        security: "none",
                        transport: {
                            network: "tcp",
                            headerType: "http",
                            path: "/",
                            host: "www.qq.com",
                        },
                    }),
                )!,
            ),
            { obfs: "http", "obfs-host": "www.qq.com", "obfs-uri": "/" },
        );
        assertSubset(fields(one(fakeNode("vmess", { security: "none" }))!), {
            obfs: undefined,
        });
    });

    it("writes Trojan TLS, WebSocket and Reality", () => {
        assertSubset(
            fields(
                one(
                    fakeNode("trojan", {
                        tls: { serverName: "tj.example.test" },
                    }),
                )!,
            ),
            {
                _: "trojan=node.example.test:443",
                password: UUID,
                "over-tls": "true",
                "tls-host": "tj.example.test",
                "tls-verification": "true",
            },
        );
        assertSubset(
            fields(
                one(
                    fakeNode("trojan", {
                        transport: {
                            network: "ws",
                            path: "/t",
                            host: "cdn.example.test",
                        },
                    }),
                )!,
            ),
            {
                obfs: "wss",
                "obfs-host": "cdn.example.test",
                "obfs-uri": "/t",
                "over-tls": undefined,
            },
        );
        assertSubset(
            fields(one(fakeNode("trojan", { security: "reality", reality }))!),
            {
                "over-tls": "true",
                "tls-host": "www.microsoft.com",
                "reality-base64-pubkey": PUBLIC_KEY,
            },
        );
    });

    it("writes Shadowsocks with 2022 keys and obfs / v2ray-plugin", () => {
        assertSubset(
            fields(
                one(
                    fakeNode("shadowsocks", {
                        cipher: "2022-blake3-aes-128-gcm",
                    }),
                )!,
            ),
            {
                _: "shadowsocks=node.example.test:443",
                method: "2022-blake3-aes-128-gcm",
                password: shadowsocksPassword(
                    "2022-blake3-aes-128-gcm",
                    SECRET,
                    UUID,
                ),
            },
        );
        assertSubset(
            fields(
                one(
                    fakeNode("shadowsocks", {
                        plugin: "obfs",
                        pluginOpts: "obfs=http;obfs-host=www.bing.com",
                    }),
                )!,
            ),
            { obfs: "http", "obfs-host": "www.bing.com", "obfs-uri": "/" },
        );
        assertSubset(
            fields(
                one(
                    fakeNode("shadowsocks", {
                        plugin: "v2ray-plugin",
                        pluginOpts: "tls;host=v2.example.test;path=/ss",
                    }),
                )!,
            ),
            { obfs: "wss", "obfs-host": "v2.example.test", "obfs-uri": "/ss" },
        );
    });

    it("writes http, socks5 and anytls, and skips what Quantumult X lacks", () => {
        assertSubset(fields(one(fakeNode("http", { security: "tls" }))!), {
            _: "http=node.example.test:443",
            username: UUID,
            "over-tls": "true",
            "tls-host": "node.example.test",
            "udp-relay": "false",
        });
        assertSubset(fields(one(fakeNode("socks"))!), {
            _: "socks5=node.example.test:443",
            "over-tls": undefined,
            "udp-relay": "true",
        });
        assertSubset(fields(one(fakeNode("anytls"))!), {
            _: "anytls=node.example.test:443",
            "over-tls": "true",
            "tls-host": "node.example.test",
        });
        for (const node of [
            fakeNode("vless", {
                transport: { network: "grpc", serviceName: "g" },
            }),
            fakeNode("vless", { transport: { network: "xhttp" } }),
            fakeNode("vmess", { transport: { network: "httpupgrade" } }),
            fakeNode("vless", {
                transport: { network: "tcp", headerType: "http" },
            }),
            fakeNode("trojan", { transport: { network: "grpc" } }),
            fakeNode("hysteria2"),
            fakeNode("hysteria", { upMbps: 1, downMbps: 1 }),
            fakeNode("tuic"),
            fakeNode("naive"),
            fakeNode("mieru"),
        ])
            assert.equal(one(node), undefined, node.protocol);
    });

    it("keeps commas in names from splitting the line, and uses the relay's address", () => {
        const parent = fakeNode("trojan");
        const child = fakeNode(
            "trojan",
            {},
            { name: "香港, IPLC", host: "relay.example.test", port: 10443 },
        );
        const line = fields(one(child, parent)!);
        assert.equal(line._, "trojan=relay.example.test:10443");
        assert.equal(line["tls-host"], "node.example.test");
        assert.equal(line.tag, `香港  IPLC #${child.id}`);
    });
});

describe("Loon node lines", () => {
    const one = (node: Node, parent?: Node) =>
        loon([entryFor(node, parent)], UUID)[0];
    /** "name = proto,host,port,a,b,k=v" → name, positional values and options. */
    const parse = (text: string) => {
        const [name, rest] = text.split(" = ");
        const parts = rest!.match(/("[^"]*"|[^,])+/g)!;
        const positional = parts.filter((p) => !/^[\w-]+=/.test(p));
        const options = Object.fromEntries(
            parts
                .filter((p) => /^[\w-]+=/.test(p))
                .map((p) => [
                    p.slice(0, p.indexOf("=")),
                    p.slice(p.indexOf("=") + 1),
                ]),
        ) as Record<string, string>;
        return { name, positional, options };
    };

    it("writes VLESS Reality + Vision", () => {
        const node = fakeNode("vless", {
            security: "reality",
            flow: "xtls-rprx-vision",
            reality,
        });
        const line = parse(one(node)!);
        assert.equal(line.name, `vless-node #${node.id}`);
        assert.deepEqual(line.positional, [
            "VLESS",
            "node.example.test",
            "443",
            `"${UUID}"`,
        ]);
        assertSubset(line.options, {
            transport: "tcp",
            flow: "xtls-rprx-vision",
            "over-tls": "true",
            "public-key": `"${PUBLIC_KEY}"`,
            "short-id": "0123abcd",
            sni: "www.microsoft.com",
            "tls-profile": "chrome",
            udp: "true",
        });
        assert.ok(!one(node)!.includes(PRIVATE_KEY));
    });

    it("writes VMess / VLESS over TCP, WebSocket and the HTTP disguise", () => {
        const vmess = parse(
            one(
                fakeNode("vmess", {
                    tls: {
                        serverName: "sni.example.test",
                        allowInsecure: true,
                    },
                    fingerprint: "safari",
                }),
            )!,
        );
        assert.deepEqual(vmess.positional, [
            "vmess",
            "node.example.test",
            "443",
            "aes-128-gcm",
            `"${UUID}"`,
        ]);
        assertSubset(vmess.options, {
            transport: "tcp",
            alterId: "0",
            "over-tls": "true",
            sni: "sni.example.test",
            "skip-cert-verify": "true",
            "tls-profile": "safari-ios-26",
        });
        assertSubset(
            parse(
                one(
                    fakeNode("vless", {
                        transport: {
                            network: "ws",
                            path: "/ws?ed=2048",
                            host: "cdn.example.test",
                        },
                    }),
                )!,
            ).options,
            {
                transport: "ws",
                path: "/ws",
                host: "cdn.example.test",
                "over-tls": "true",
            },
        );
        assertSubset(
            parse(
                one(
                    fakeNode("vmess", {
                        security: "none",
                        transport: {
                            network: "tcp",
                            headerType: "http",
                            path: "/",
                            host: "www.qq.com",
                        },
                    }),
                )!,
            ).options,
            {
                transport: "http",
                path: "/",
                host: "www.qq.com",
                "over-tls": "false",
            },
        );
    });

    it("writes Trojan, Shadowsocks, Hysteria2, AnyTLS, SOCKS5 and HTTP(S)", () => {
        const trojan = parse(
            one(
                fakeNode("trojan", {
                    tls: { alpn: ["h2", "http/1.1"] },
                    transport: { network: "ws", path: "/t" },
                }),
            )!,
        );
        assert.deepEqual(trojan.positional, [
            "trojan",
            "node.example.test",
            "443",
            `"${UUID}"`,
        ]);
        assertSubset(trojan.options, {
            transport: "ws",
            path: "/t",
            alpn: '"h2,http/1.1"',
            sni: "node.example.test",
        });

        const ss = parse(
            one(
                fakeNode("shadowsocks", {
                    cipher: "2022-blake3-aes-256-gcm",
                    plugin: "obfs",
                    pluginOpts: "obfs=tls;obfs-host=cloud.example.test",
                }),
            )!,
        );
        assert.deepEqual(ss.positional, [
            "Shadowsocks",
            "node.example.test",
            "443",
            "2022-blake3-aes-256-gcm",
            `"${shadowsocksPassword("2022-blake3-aes-256-gcm", SECRET, UUID)}"`,
        ]);
        assertSubset(ss.options, {
            "obfs-name": "tls",
            "obfs-host": "cloud.example.test",
        });

        const hy2 = parse(
            one(
                fakeNode("hysteria2", {
                    obfs: "salamander",
                    obfsPassword: "op",
                    downMbps: 500,
                    ports: "20000-30000,40000-50000",
                    hopInterval: 30,
                    tls: { alpn: ["h3"] },
                }),
            )!,
        );
        assert.deepEqual(hy2.positional, [
            "Hysteria2",
            "node.example.test",
            "443",
            `"${UUID}"`,
        ]);
        assertSubset(hy2.options, {
            sni: "node.example.test",
            "salamander-password": "op",
            "server-ports": '"20000-30000,40000-50000"',
            "hop-interval": "30",
            "download-bandwidth": "500",
            alpn: "h3",
        });

        assert.deepEqual(parse(one(fakeNode("anytls"))!).positional, [
            "AnyTLS",
            "node.example.test",
            "443",
            `"${UUID}"`,
        ]);
        assert.deepEqual(parse(one(fakeNode("socks"))!).positional, [
            "SOCKS5",
            "node.example.test",
            "443",
            UUID,
            `"${UUID}"`,
        ]);
        assert.equal(parse(one(fakeNode("http"))!).positional[0], "http");
        assertSubset(parse(one(fakeNode("http", { security: "tls" }))!), {
            positional: [
                "https",
                "node.example.test",
                "443",
                UUID,
                `"${UUID}"`,
            ],
            options: { sni: "node.example.test", "skip-cert-verify": "false" },
        });
    });

    it("skips what Loon does not document", () => {
        for (const node of [
            fakeNode("vless", {
                transport: { network: "grpc", serviceName: "g" },
            }),
            fakeNode("vless", {
                security: "reality",
                reality,
                transport: { network: "grpc" },
            }),
            fakeNode("vless", { transport: { network: "xhttp" } }),
            fakeNode("vmess", { transport: { network: "httpupgrade" } }),
            fakeNode("trojan", { security: "reality", reality }),
            fakeNode("shadowsocks", {
                plugin: "v2ray-plugin",
                pluginOpts: "tls",
            }),
            fakeNode("socks", { security: "tls" }),
            fakeNode("hysteria", { upMbps: 1, downMbps: 1 }),
            fakeNode("tuic"),
            fakeNode("naive"),
            fakeNode("mieru"),
        ])
            assert.equal(
                one(node),
                undefined,
                `${node.protocol} ${JSON.stringify(node.settings)}`,
            );
    });

    it("keeps separators out of names and uses the relay's address", () => {
        const parent = fakeNode("hysteria2");
        const child = fakeNode(
            "hysteria2",
            {},
            { name: "日本=A,B", host: "relay.example.test", port: 8443 },
        );
        const line = parse(one(child, parent)!);
        assert.equal(line.name, `日本 A B #${child.id}`);
        assert.deepEqual(line.positional.slice(1, 3), [
            "relay.example.test",
            "8443",
        ]);
        assert.equal(line.options.sni, "node.example.test");
    });
});

describe("client format detection", () => {
    it("recognises Quantumult X and Loon", () => {
        assert.equal(
            formatForUserAgent("Quantumult%20X/1.5.2 (iPhone16,2; iOS 18.5)"),
            "quantumultx",
        );
        assert.equal(
            formatForUserAgent("Loon/3.3.6 (iPhone; iOS 18.5) CFNetwork"),
            "loon",
        );
        assert.equal(formatForUserAgent("Balloon/1.0"), "mihomo");
    });
});

describe("Surge and Surfboard subscription profiles", () => {
    it("writes only public Reality parameters for a TCP VLESS node", () => {
        const node = fakeNode("vless", {
            security: "reality",
            flow: "xtls-rprx-vision",
            reality: {
                serverName: "cover.example.test",
                publicKey: PUBLIC_KEY,
                privateKey: PRIVATE_KEY,
                shortId: "abcd",
            },
        });
        const profile = iniProfile([entryFor(node)], UUID, "surge");
        assert.ok(profile);
        assert.ok(profile.includes(`reality-public-key=${PUBLIC_KEY}`));
        assert.match(profile, /reality-short-id=abcd, flow=xtls-rprx-vision/);
        assert.ok(!profile.includes(PRIVATE_KEY));
        // Surfboard has no VLESS proxy type: the node is left out.
        assert.equal(iniProfile([entryFor(node)], UUID, "surfboard"), null);
    });

    it("skips transports neither client documents and keeps the other nodes", () => {
        const upgrade = fakeNode("vmess", {
            transport: { network: "httpupgrade", path: "/up", host: "" },
        });
        const ss = fakeNode("shadowsocks");
        for (const client of ["surge", "surfboard"] as const) {
            const profile = iniProfile(
                [entryFor(upgrade), entryFor(ss)],
                UUID,
                client,
            );
            assert.ok(profile);
            assert.doesNotMatch(profile, /http-upgrade|vmess/);
            assert.match(profile, /ss, node\.example\.test, 443/);
        }
    });

    it("writes safe INI with the relay address and backend TLS for both clients", () => {
        const relay = fakeNode(
            "vmess",
            {},
            {
                name: "Relay,=\n[Rule]",
                host: "relay.example.test",
                port: 8443,
            },
        );
        const parent = fakeNode("vmess", {
            transport: {
                network: "ws",
                path: "/tunnel",
                host: "cdn.example.test",
            },
        });
        const ss = fakeNode("shadowsocks");
        const reality = fakeNode("vless", { security: "reality" });
        const entries = [
            entryFor(relay, parent),
            entryFor(ss),
            entryFor(reality),
        ];
        for (const client of ["surge", "surfboard"] as const) {
            const profile = iniProfile(entries, UUID, client);
            assert.ok(profile);
            assert.match(profile, /vmess, relay\.example\.test, 8443/);
            assert.match(
                profile,
                /sni=node\.example\.test, skip-cert-verify=false, ws=true, ws-path=\/tunnel, ws-headers=Host:cdn\.example\.test/,
            );
            assert.match(
                profile,
                /ss, node\.example\.test, 443, encrypt-method=aes-128-gcm/,
            );
            assert.equal(profile.match(/\[Rule\]/g)?.length, 1);
            assert.match(profile, /\[Proxy Group\]\nXboard = select/);
            assert.match(profile, /FINAL, Xboard/);
            assert.ok(!profile.includes("vless-node"));
            assert.equal(iniProfile([entryFor(reality)], UUID, client), null);
        }
    });

    it("keeps Stash on compatible Mihomo output and detects the new clients", () => {
        assert.equal(formatForUserAgent("Surge/6.5"), "surge");
        assert.equal(formatForUserAgent("Surfboard/2.9 Android"), "surfboard");
        assert.equal(formatForUserAgent("Stash/3.2"), "mihomo");
    });
});
