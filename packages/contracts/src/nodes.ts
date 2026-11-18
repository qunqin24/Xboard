import { z } from "zod";
import { idSchema } from "./common";

// Node configuration: what an admin saves, what node backends (V2bX / XrayR)
// receive and what the Mihomo and sing-box subscriptions are built from.
// Protocol-specific options live in one JSON column, validated here per
// protocol. Every option has a default, so `settings: {}` is a valid start.

export const NODE_PROTOCOLS = [
    "vless",
    "vmess",
    "trojan",
    "shadowsocks",
    "hysteria2",
    "hysteria",
    "tuic",
    "anytls",
    "socks",
    "http",
    "naive",
    "mieru",
] as const;
export const nodeProtocolSchema = z.enum(NODE_PROTOCOLS);
export type NodeProtocol = z.infer<typeof nodeProtocolSchema>;

/** Protocols whose options include a transport (`network`) and TLS/Reality. */
export const V2RAY_PROTOCOLS = ["vless", "vmess", "trojan"] as const;

export const NETWORKS = ["tcp", "ws", "grpc", "httpupgrade", "xhttp"] as const;
export type Network = (typeof NETWORKS)[number];

/**
 * Transports each protocol supports on the node (V2bX's Xray core) and in
 * Mihomo. HTTP/2 is gone: Xray-core removed it in favour of XHTTP. Trojan
 * keeps what V2bX and Mihomo both implement for it.
 */
export const NETWORKS_BY_PROTOCOL: Record<
    (typeof V2RAY_PROTOCOLS)[number],
    readonly Network[]
> = {
    vless: NETWORKS,
    vmess: ["tcp", "ws", "grpc", "httpupgrade"],
    trojan: ["tcp", "ws", "grpc"],
};

/** Transports Xray's REALITY can carry. */
export const REALITY_NETWORKS: readonly Network[] = ["tcp", "grpc", "xhttp"];

export const XHTTP_MODES = [
    "auto",
    "packet-up",
    "stream-up",
    "stream-one",
] as const;

export const FINGERPRINTS = [
    "chrome",
    "firefox",
    "safari",
    "ios",
    "android",
    "edge",
    "360",
    "qq",
    "random",
] as const;

export const ALPN_VALUES = ["h3", "h2", "http/1.1"] as const;

export const SS_CIPHERS = [
    "aes-128-gcm",
    "aes-256-gcm",
    "chacha20-ietf-poly1305",
    "2022-blake3-aes-128-gcm",
    "2022-blake3-aes-256-gcm",
] as const;
export const cipherSchema = z.enum(SS_CIPHERS);

/** Shadowsocks 2022 ciphers and their key length in bytes. */
export const SS2022_KEY_BYTES: Partial<Record<string, number>> = {
    "2022-blake3-aes-128-gcm": 16,
    "2022-blake3-aes-256-gcm": 32,
};

export const ROUTE_ACTIONS = [
    "block",
    "block_ip",
    "block_port",
    "protocol",
    "dns",
    "route",
    "route_ip",
    "default_out",
] as const;

export const CERT_MODES = ["none", "file", "http", "dns", "self"] as const;

/** X25519 key as Xray prints it: 32 bytes, base64url without padding. */
export const REALITY_KEY = /^[A-Za-z0-9_-]{43}$/;
/** Reality short id: up to 16 hex digits, even length (may be empty). */
export const SHORT_ID = /^(?:[0-9a-f]{2}){0,8}$/;

/**
 * "443", "20000-50000" or "443,20000-30000" as [from, to] pairs; null when
 * malformed. Used for port hopping (Hysteria) and Mieru port ranges.
 */
export function parsePortList(value: string): [number, number][] | null {
    const parts = value.split(",").map((part) => part.trim());
    const ranges: [number, number][] = [];
    for (const part of parts) {
        const match = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(part);
        if (!match) return null;
        const from = Number(match[1]);
        const to = Number(match[2] ?? match[1]);
        if (from < 1 || to > 65535 || from > to) return null;
        ranges.push([from, to]);
    }
    return ranges.length ? ranges : null;
}

const unique = (values: readonly unknown[]) =>
    new Set(values).size === values.length;

const portSchema = z
    .number({ error: "请输入端口" })
    .int("端口为整数")
    .min(1, "端口为 1 到 65535")
    .max(65535, "端口为 1 到 65535");

const domain = (label: string) =>
    z
        .string()
        .trim()
        .max(253, `${label}最多 253 个字符`)
        .regex(/^[a-zA-Z0-9.-]*$/, `${label}只能包含字母、数字、点和连字符`);

const pathSchema = z
    .string()
    .trim()
    .max(256, "路径最多 256 个字符")
    .regex(/^(?:\/\S*)?$/, "路径需以 / 开头，不含空格");

const mbpsSchema = z
    .number({ error: "请输入整数" })
    .int("请输入整数")
    .min(1, "至少 1 Mbps")
    .max(100_000, "最多 100000 Mbps")
    .nullable();

const portListSchema = z
    .string()
    .trim()
    .max(200, "最多 200 个字符")
    .refine(
        (value) => value === "" || parsePortList(value) !== null,
        "格式如 20000-50000，多段用逗号分隔",
    );

const secret = (label: string, max: number) =>
    z.string().trim().max(max, `${label}最多 ${max} 个字符`);

// ---------- Shared option groups ----------

export const echSchema = z.strictObject({
    enabled: z.boolean().default(false),
    /** Client-side ECHConfigList (base64, or the PEM block). Empty: look it up over DNS. */
    config: secret("ECH 配置", 8192).default(""),
    queryServerName: domain("查询域名").default(""),
    /** Server-side ECH key; sent to the node only, never to clients. */
    key: secret("ECH 密钥", 8192).default(""),
});

export const tlsSchema = z.strictObject({
    serverName: domain("SNI").default(""),
    allowInsecure: z.boolean().default(false),
    alpn: z
        .array(z.enum(ALPN_VALUES))
        .max(3)
        .refine(unique, "ALPN 重复")
        .default([]),
    ech: echSchema.prefault({}),
});

/** Checked only when the node uses Reality; see `checkNode`. */
export const realitySchema = z.strictObject({
    /** The site Reality borrows its handshake from (Xray `dest` / `serverNames`). */
    serverName: domain("目标网站").default(""),
    serverPort: portSchema.default(443),
    publicKey: secret("公钥", 64).default(""),
    privateKey: secret("私钥", 64).default(""),
    shortId: secret("Short ID", 16).default(""),
});

export const transportSchema = z.strictObject({
    network: z.enum(NETWORKS).default("tcp"),
    /** ws, httpupgrade, xhttp; TCP with an HTTP header. A ws path may end in "?ed=2048" (early data). */
    path: pathSchema.default(""),
    /** Host header (ws, httpupgrade, xhttp, TCP HTTP header). */
    host: domain("Host").default(""),
    serviceName: z
        .string()
        .trim()
        .max(128, "服务名最多 128 个字符")
        .regex(/^[\w./-]*$/, "服务名只能包含字母、数字和 . _ / -")
        .default(""),
    /** TCP only: disguise as plain HTTP/1.1. */
    headerType: z.enum(["none", "http"]).default("none"),
    /** XHTTP only. */
    mode: z.enum(XHTTP_MODES).default("auto"),
});

export const multiplexSchema = z.strictObject({
    enabled: z.boolean().default(false),
    protocol: z.enum(["smux", "yamux", "h2mux"]).default("yamux"),
    maxConnections: z.number().int().min(1).max(64).nullable().default(null),
    padding: z.boolean().default(false),
    brutal: z.boolean().default(false),
    brutalUpMbps: mbpsSchema.default(null),
    brutalDownMbps: mbpsSchema.default(null),
});

const fingerprintSchema = z.enum(["", ...FINGERPRINTS]).default("");

// ---------- Per-protocol settings ----------

export const vmessSettingsSchema = z.strictObject({
    security: z.enum(["none", "tls"]).default("tls"),
    tls: tlsSchema.prefault({}),
    fingerprint: fingerprintSchema,
    transport: transportSchema.prefault({}),
    multiplex: multiplexSchema.prefault({}),
});

export const vlessSettingsSchema = z.strictObject({
    security: z.enum(["none", "tls", "reality"]).default("tls"),
    tls: tlsSchema.prefault({}),
    reality: realitySchema.prefault({}),
    fingerprint: fingerprintSchema,
    flow: z.enum(["", "xtls-rprx-vision"]).default(""),
    transport: transportSchema.prefault({}),
    multiplex: multiplexSchema.prefault({}),
});

export const trojanSettingsSchema = z.strictObject({
    security: z.enum(["tls", "reality"]).default("tls"),
    tls: tlsSchema.prefault({}),
    reality: realitySchema.prefault({}),
    fingerprint: fingerprintSchema,
    transport: transportSchema.prefault({}),
    multiplex: multiplexSchema.prefault({}),
});

export const shadowsocksSettingsSchema = z.strictObject({
    cipher: cipherSchema.default("aes-128-gcm"),
    plugin: z.enum(["", "obfs", "v2ray-plugin"]).default(""),
    /** SIP003 options, e.g. "obfs=http;obfs-host=www.bing.com". */
    pluginOpts: z
        .string()
        .trim()
        .max(1024, "插件参数最多 1024 个字符")
        .default(""),
});

export const hysteria2SettingsSchema = z.strictObject({
    tls: tlsSchema.prefault({}),
    obfs: z.enum(["", "salamander"]).default(""),
    obfsPassword: secret("混淆密码", 128).default(""),
    upMbps: mbpsSchema.default(null),
    downMbps: mbpsSchema.default(null),
    /** Port hopping range clients dial, e.g. "20000-50000". */
    ports: portListSchema.default(""),
    hopInterval: z
        .number({ error: "请输入整数" })
        .int("请输入整数")
        .min(5, "至少 5 秒")
        .max(3600, "最多 3600 秒")
        .nullable()
        .default(null),
});

export const hysteriaSettingsSchema = z.strictObject({
    tls: tlsSchema.prefault({}),
    obfsPassword: secret("混淆密码", 128).default(""),
    upMbps: mbpsSchema.default(null),
    downMbps: mbpsSchema.default(null),
    ports: portListSchema.default(""),
    hopInterval: z
        .number({ error: "请输入整数" })
        .int("请输入整数")
        .min(5, "至少 5 秒")
        .max(3600, "最多 3600 秒")
        .nullable()
        .default(null),
});

export const tuicSettingsSchema = z.strictObject({
    tls: tlsSchema.prefault({}),
    version: z.union([z.literal(5), z.literal(4)]).default(5),
    congestionControl: z.enum(["cubic", "new_reno", "bbr"]).default("cubic"),
    udpRelayMode: z.enum(["native", "quic"]).default("native"),
});

export const anytlsSettingsSchema = z.strictObject({
    tls: tlsSchema.prefault({}),
    /** One rule per line; empty uses the node software's default scheme. */
    paddingScheme: z
        .array(z.string().trim().min(1).max(256))
        .max(64, "最多 64 行")
        .default([]),
});

export const socksSettingsSchema = z.strictObject({
    security: z.enum(["none", "tls"]).default("none"),
    tls: tlsSchema.prefault({}),
});

export const httpSettingsSchema = z.strictObject({
    security: z.enum(["none", "tls"]).default("none"),
    tls: tlsSchema.prefault({}),
});

export const naiveSettingsSchema = z.strictObject({
    tls: tlsSchema.prefault({}),
});

/** Mihomo's mieru `port-range` takes exactly one "from-to" range. */
const singleRangeSchema = z
    .string()
    .trim()
    .refine((value) => {
        if (value === "") return true;
        const ranges = /^\d+-\d+$/.test(value) ? parsePortList(value) : null;
        return ranges !== null && ranges.length === 1;
    }, "格式如 30000-30100，只能填一段");

export const mieruSettingsSchema = z.strictObject({
    transport: z.enum(["TCP", "UDP"]).default("TCP"),
    trafficPattern: z.string().trim().max(2048, "最多 2048 个字符").default(""),
    ports: singleRangeSchema.default(""),
});

export const NODE_SETTINGS = {
    vless: vlessSettingsSchema,
    vmess: vmessSettingsSchema,
    trojan: trojanSettingsSchema,
    shadowsocks: shadowsocksSettingsSchema,
    hysteria2: hysteria2SettingsSchema,
    hysteria: hysteriaSettingsSchema,
    tuic: tuicSettingsSchema,
    anytls: anytlsSettingsSchema,
    socks: socksSettingsSchema,
    http: httpSettingsSchema,
    naive: naiveSettingsSchema,
    mieru: mieruSettingsSchema,
} as const;

export type NodeSettings<P extends NodeProtocol = NodeProtocol> = z.output<
    (typeof NODE_SETTINGS)[P]
>;

/** Settings of a new node of this protocol: every option at its default. */
export function defaultNodeSettings<P extends NodeProtocol>(
    protocol: P,
): NodeSettings<P> {
    return NODE_SETTINGS[protocol].parse({}) as NodeSettings<P>;
}

// ---------- Node-level options ----------

const rateSchema = z
    .number({ error: "请输入倍率" })
    .min(0, "倍率不能小于 0")
    .max(100, "倍率最多 100")
    .refine(
        (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9,
        "倍率最多两位小数",
    );

const timeOfDay = z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "时间格式为 HH:MM");

/** From `start` to `end` inclusive (Asia/Shanghai); start > end crosses midnight. */
export const rateRangeSchema = z.strictObject({
    start: timeOfDay,
    end: timeOfDay,
    rate: rateSchema,
});
export type RateRange = z.infer<typeof rateRangeSchema>;

/** One V2bX/XrayR route rule, sent as `routes` in the node config. */
export const routeRuleSchema = z.strictObject({
    match: z
        .array(z.string().trim().min(1).max(512))
        .min(1, "match 不能为空")
        .max(2000),
    action: z.enum(ROUTE_ACTIONS),
    actionValue: z.string().trim().max(2048).default(""),
});
export type RouteRule = z.infer<typeof routeRuleSchema>;

const jsonObjects = z
    .array(z.record(z.string(), z.unknown()), {
        error: "需为 JSON 对象数组",
    })
    .max(100, "最多 100 项")
    .default([]);

export const certConfigSchema = z.strictObject({
    mode: z.enum(CERT_MODES).default("none"),
    domain: domain("证书域名").default(""),
    certFile: z.string().trim().max(512).default(""),
    keyFile: z.string().trim().max(512).default(""),
    /** ACME DNS provider name (lego), for mode "dns". */
    provider: z.string().trim().max(64).default(""),
    email: z.string().trim().max(254).default(""),
    /** "KEY=VALUE" per line: the DNS provider's credentials. */
    dnsEnv: z.string().max(4096).default(""),
});
export type CertConfig = z.infer<typeof certConfigSchema>;

const nodeCommon = {
    name: z.string().trim().min(1, "请输入名称").max(80, "名称最多 80 个字"),
    host: z
        .string()
        .trim()
        .regex(/^[a-zA-Z0-9.:[\]-]{1,253}$/, "节点地址不是有效的 IP 或域名。"),
    /** The port clients dial. */
    port: portSchema,
    /** The port the node listens on; defaults to `port`. */
    serverPort: portSchema.optional(),
    enabled: z.boolean(),
    /** Listed in subscriptions. A hidden node still serves its users. */
    visible: z.boolean().default(true),
    tags: z
        .array(
            z
                .string()
                .trim()
                .min(1, "标签不能为空")
                .max(20, "标签最多 20 个字"),
        )
        .max(10, "最多 10 个标签")
        .refine(unique, "标签重复")
        .default([]),
    /**
     * A relay entry for another node: subscriptions list it with its own
     * name, address and port, and the parent's protocol settings; the
     * parent's backend serves its users.
     */
    parentId: idSchema.nullable().default(null),
    rate: rateSchema.default(1),
    rateRanges: z.array(rateRangeSchema).max(24, "最多 24 个时段").default([]),
    routes: z
        .array(routeRuleSchema, { error: "需为 JSON 数组" })
        .max(200, "最多 200 条")
        .default([]),
    customOutbounds: jsonObjects,
    customRoutes: jsonObjects,
    certConfig: certConfigSchema.prefault({}),
    planIds: z.array(idSchema).max(100).refine(unique, "套餐重复"),
};

type Issue = { path: (string | number)[]; message: string };

/** Cross-field rules a single field schema cannot express. */
export function nodeIssues(node: {
    protocol: NodeProtocol;
    settings: unknown;
    parentId: number | null;
    certConfig: CertConfig;
}): Issue[] {
    const issues: Issue[] = [];
    const add = (path: (string | number)[], message: string) =>
        issues.push({ path, message });
    // A relay uses its parent's settings; its own are not used.
    const protocol = node.parentId === null ? node.protocol : null;
    if (protocol === "vless" || protocol === "vmess" || protocol === "trojan") {
        const s = node.settings as NodeSettings<"vless" | "vmess" | "trojan">;
        const network = s.transport.network;
        if (!NETWORKS_BY_PROTOCOL[protocol].includes(network))
            add(["settings", "transport", "network"], "该协议不支持此传输方式");
        if (
            protocol === "trojan" &&
            network === "tcp" &&
            s.transport.headerType === "http"
        )
            add(
                ["settings", "transport", "headerType"],
                "Trojan 不支持 HTTP 伪装",
            );
        if (s.security === "reality") {
            const r = (s as NodeSettings<"vless">).reality;
            if (!REALITY_NETWORKS.includes(network))
                add(
                    ["settings", "transport", "network"],
                    "Reality 仅支持 TCP、gRPC、XHTTP 传输",
                );
            if (network === "tcp" && s.transport.headerType === "http")
                add(
                    ["settings", "transport", "headerType"],
                    "Reality 不能与 HTTP 伪装同时使用",
                );
            if (!r.serverName)
                add(["settings", "reality", "serverName"], "请输入目标网站");
            if (!REALITY_KEY.test(r.publicKey))
                add(
                    ["settings", "reality", "publicKey"],
                    "公钥应为 43 位 base64url 字符",
                );
            if (!REALITY_KEY.test(r.privateKey))
                add(
                    ["settings", "reality", "privateKey"],
                    "私钥应为 43 位 base64url 字符",
                );
            if (!SHORT_ID.test(r.shortId))
                add(
                    ["settings", "reality", "shortId"],
                    "Short ID 为最多 16 位小写十六进制，长度为偶数",
                );
        }
        if (protocol === "vless") {
            const v = s as NodeSettings<"vless">;
            if (
                v.flow &&
                (network !== "tcp" ||
                    v.security === "none" ||
                    v.transport.headerType === "http")
            )
                add(
                    ["settings", "flow"],
                    "xtls-rprx-vision 需要 TCP 传输（无 HTTP 伪装），并启用 TLS 或 Reality",
                );
            if (v.flow && v.multiplex.enabled)
                add(
                    ["settings", "multiplex", "enabled"],
                    "xtls-rprx-vision 不能与多路复用同时使用",
                );
        }
        const m = s.multiplex;
        if (m.enabled && m.brutal) {
            if (m.brutalUpMbps === null)
                add(
                    ["settings", "multiplex", "brutalUpMbps"],
                    "请输入上行带宽",
                );
            if (m.brutalDownMbps === null)
                add(
                    ["settings", "multiplex", "brutalDownMbps"],
                    "请输入下行带宽",
                );
        }
    }
    if (protocol === "hysteria2") {
        const s = node.settings as NodeSettings<"hysteria2">;
        if (s.obfs && !s.obfsPassword)
            add(["settings", "obfsPassword"], "请输入混淆密码");
    }
    if (protocol === "hysteria") {
        const s = node.settings as NodeSettings<"hysteria">;
        if (s.upMbps === null)
            add(["settings", "upMbps"], "Hysteria v1 需要填写上行带宽");
        if (s.downMbps === null)
            add(["settings", "downMbps"], "Hysteria v1 需要填写下行带宽");
    }
    const cert = node.certConfig;
    if (cert.mode === "file") {
        if (!cert.certFile) add(["certConfig", "certFile"], "请输入证书路径");
        if (!cert.keyFile) add(["certConfig", "keyFile"], "请输入私钥路径");
    }
    if ((cert.mode === "http" || cert.mode === "dns") && !cert.domain)
        add(["certConfig", "domain"], "请输入证书域名");
    if (cert.mode === "dns" && !cert.provider)
        add(["certConfig", "provider"], "请输入 DNS 服务商");
    return issues;
}

export const nodeBody = z
    .discriminatedUnion("protocol", [
        z.strictObject({
            ...nodeCommon,
            protocol: z.literal("vless"),
            settings: vlessSettingsSchema.prefault({}),
        }),
        z.strictObject({
            ...nodeCommon,
            protocol: z.literal("vmess"),
            settings: vmessSettingsSchema.prefault({}),
        }),
        z.strictObject({
            ...nodeCommon,
            protocol: z.literal("trojan"),
            settings: trojanSettingsSchema.prefault({}),
        }),
        z.strictObject({
            ...nodeCommon,
            protocol: z.literal("shadowsocks"),
            settings: shadowsocksSettingsSchema.prefault({}),
        }),
        z.strictObject({
            ...nodeCommon,
            protocol: z.literal("hysteria2"),
            settings: hysteria2SettingsSchema.prefault({}),
        }),
        z.strictObject({
            ...nodeCommon,
            protocol: z.literal("hysteria"),
            settings: hysteriaSettingsSchema.prefault({}),
        }),
        z.strictObject({
            ...nodeCommon,
            protocol: z.literal("tuic"),
            settings: tuicSettingsSchema.prefault({}),
        }),
        z.strictObject({
            ...nodeCommon,
            protocol: z.literal("anytls"),
            settings: anytlsSettingsSchema.prefault({}),
        }),
        z.strictObject({
            ...nodeCommon,
            protocol: z.literal("socks"),
            settings: socksSettingsSchema.prefault({}),
        }),
        z.strictObject({
            ...nodeCommon,
            protocol: z.literal("http"),
            settings: httpSettingsSchema.prefault({}),
        }),
        z.strictObject({
            ...nodeCommon,
            protocol: z.literal("naive"),
            settings: naiveSettingsSchema.prefault({}),
        }),
        z.strictObject({
            ...nodeCommon,
            protocol: z.literal("mieru"),
            settings: mieruSettingsSchema.prefault({}),
        }),
    ])
    .superRefine((node, ctx) => {
        for (const issue of nodeIssues(node))
            ctx.addIssue({ code: "custom", ...issue });
    });
export type NodeBody = z.output<typeof nodeBody>;
export type NodeBodyInput = z.input<typeof nodeBody>;

export const nodeEnabledBody = z.strictObject({ enabled: z.boolean() });

// ---------- Admin response ----------

const viewCommon = {
    id: z.number().int(),
    name: z.string(),
    host: z.string(),
    port: z.number().int(),
    serverPort: z.number().int(),
    enabled: z.boolean(),
    visible: z.boolean(),
    tags: z.array(z.string()),
    parentId: z.number().int().nullable(),
    rate: z.number(),
    rateRanges: z.array(rateRangeSchema),
    routes: z.array(routeRuleSchema),
    customOutbounds: z.array(z.record(z.string(), z.unknown())),
    customRoutes: z.array(z.record(z.string(), z.unknown())),
    certConfig: certConfigSchema,
    lastSeenAt: z.string().nullable(),
    plans: z.array(z.object({ planId: z.number().int() })),
};

export const adminNodeSchema = z.discriminatedUnion("protocol", [
    z.object({
        ...viewCommon,
        protocol: z.literal("vless"),
        settings: vlessSettingsSchema,
    }),
    z.object({
        ...viewCommon,
        protocol: z.literal("vmess"),
        settings: vmessSettingsSchema,
    }),
    z.object({
        ...viewCommon,
        protocol: z.literal("trojan"),
        settings: trojanSettingsSchema,
    }),
    z.object({
        ...viewCommon,
        protocol: z.literal("shadowsocks"),
        settings: shadowsocksSettingsSchema,
    }),
    z.object({
        ...viewCommon,
        protocol: z.literal("hysteria2"),
        settings: hysteria2SettingsSchema,
    }),
    z.object({
        ...viewCommon,
        protocol: z.literal("hysteria"),
        settings: hysteriaSettingsSchema,
    }),
    z.object({
        ...viewCommon,
        protocol: z.literal("tuic"),
        settings: tuicSettingsSchema,
    }),
    z.object({
        ...viewCommon,
        protocol: z.literal("anytls"),
        settings: anytlsSettingsSchema,
    }),
    z.object({
        ...viewCommon,
        protocol: z.literal("socks"),
        settings: socksSettingsSchema,
    }),
    z.object({
        ...viewCommon,
        protocol: z.literal("http"),
        settings: httpSettingsSchema,
    }),
    z.object({
        ...viewCommon,
        protocol: z.literal("naive"),
        settings: naiveSettingsSchema,
    }),
    z.object({
        ...viewCommon,
        protocol: z.literal("mieru"),
        settings: mieruSettingsSchema,
    }),
]);
export type AdminNode = z.infer<typeof adminNodeSchema>;
