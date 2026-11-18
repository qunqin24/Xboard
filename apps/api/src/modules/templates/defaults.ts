import type { TemplateFormat } from "@xboard/contracts";

// Built-in subscription templates. Rule lists are only referenced by URL, so
// clients fetch and refresh them from their sources:
// - Mihomo: MetaCubeX/meta-rules-dat, branch "meta" (.mrs)
// - sing-box: MetaCubeX/meta-rules-dat, branch "sing" (.srs): the same data
//   as Mihomo, whose China IP list is more accurate than SagerNet's
//   MaxMind-based sing-geoip
// - Quantumult X, Loon, Shadowrocket: blackmatrix7/ios_rule_script; Loon and
//   Shadowrocket also SukkaW's AI list (ruleset.skk.moe, AGPL-3.0, linked)
// Every URL here was checked to exist on 2026-11-18.
//
// AI services follow common community practice (Aethersailor's
// Custom_OpenClash_Rules, powerfullz/override-rules): one group per vendor
// plus "AI 服务", all defaulting to "节点选择", and AI rules ahead of
// streaming and China-direct rules.

const META =
    "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo";
const SING =
    "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo";
const BM =
    "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule";
const SUKKA_AI = "https://ruleset.skk.moe/List/non_ip/ai.conf";
const TEST_URL = "https://www.gstatic.com/generate_204";

/** International streaming geosite categories, close to blackmatrix7's GlobalMedia. */
const STREAMING = [
    "youtube",
    "netflix",
    "disney",
    "hbo",
    "primevideo",
    "hulu",
    "spotify",
    "tiktok",
    "twitch",
    "dazn",
    "bbc",
    "abema",
    "bahamut",
];

// ---------- AI vendors ----------

/**
 * Per-vendor AI groups and their rule sources. `extra` holds the official
 * domains none of the referenced lists covered on 2026-11-18; they are
 * written into every client's rules (Quantumult X reads them from the
 * panel, see /api/rules/quantumultx).
 */
export const AI_VENDORS = [
    {
        group: "OpenAI",
        slug: "openai",
        geosite: ["openai"],
        blackmatrix: ["OpenAI"],
        extra: ["chat.com", "sora.com"],
    },
    {
        group: "Claude",
        slug: "claude",
        geosite: ["anthropic"],
        blackmatrix: ["Anthropic", "Claude"],
        extra: ["claude.com", "claudeusercontent.com"],
    },
    {
        group: "Gemini",
        slug: "gemini",
        geosite: ["google-gemini"],
        blackmatrix: ["Gemini"],
        extra: [
            "gemini.google",
            "aistudio.google.com",
            "notebooklm.google",
            "labs.google",
        ],
    },
    {
        group: "其他 AI",
        slug: "other",
        // Covers the vendors above too, so it comes after them.
        geosite: ["category-ai-!cn"],
        blackmatrix: ["Copilot"],
        extra: [
            // GitHub Copilot and Microsoft Copilot
            "githubcopilot.com",
            "copilot-proxy.githubusercontent.com",
            "copilot.cloud.microsoft",
            "sydney.bing.com",
            // Perplexity, xAI Grok, Meta AI, Mistral, Poe
            "perplexity.ai",
            "perplexity.com",
            "pplx.ai",
            "x.ai",
            "grok.com",
            "meta.ai",
            "mistral.ai",
            "poe.com",
            "poecdn.net",
            // Character.AI, Midjourney, Cursor
            "character.ai",
            "c.ai",
            "midjourney.com",
            "cursor.com",
            "cursor.sh",
            "cursorapi.com",
            // Groq, OpenRouter, JetBrains AI
            "groq.com",
            "openrouter.ai",
            "jetbrains.ai",
            "grazie.ai",
            "grazie.aws.intellij.net",
        ],
    },
] as const;

export type AiVendorSlug = (typeof AI_VENDORS)[number]["slug"];

// ---------- Mihomo ----------

const mrs = (name: string, behavior: "domain" | "ipcidr", file: string) =>
    `  ${name}:
    type: http
    behavior: ${behavior}
    format: mrs
    url: ${META}/${file}
    path: ./ruleset/${name}.mrs
    interval: 86400
    proxy: 节点选择`;

/** A select group defaulting to "节点选择", with every node to pick from. */
const followMain = (name: string) => `  - name: ${name}
    type: select
    proxies: [节点选择]
    include-all-proxies: true`;

const MIHOMO = `# Xboard 默认 Mihomo 模板
# 面板把节点写入 proxies，并把全部节点名加入带有 include-all-proxies: true 的分组。
mixed-port: 7890
allow-lan: false
mode: rule
log-level: warning
unified-delay: true
tcp-concurrent: true

dns:
  enable: true
  ipv6: true
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  fake-ip-filter:
    - "rule-set:private_domain,cn_domain"
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  nameserver:
    - https://dns.alidns.com/dns-query
    - https://doh.pub/dns-query

proxy-groups:
  - name: 节点选择
    type: select
    proxies: [自动选择, 故障转移, DIRECT]
    include-all-proxies: true
  - name: 自动选择
    type: url-test
    include-all-proxies: true
    url: ${TEST_URL}
    interval: 300
    tolerance: 50
  - name: 故障转移
    type: fallback
    include-all-proxies: true
    url: ${TEST_URL}
    interval: 300
${["AI 服务", ...AI_VENDORS.map((vendor) => vendor.group)].map(followMain).join("\n")}
  - name: 流媒体
    type: select
    proxies: [节点选择, 自动选择]
    include-all-proxies: true

rule-providers:
${[
    mrs("private_domain", "domain", "geosite/private.mrs"),
    // category-ads, not category-ads-all: fewer false blocks.
    mrs("ads", "domain", "geosite/category-ads.mrs"),
    ...AI_VENDORS.flatMap((vendor) =>
        vendor.geosite.map((name) =>
            mrs(`ai_${vendor.slug}`, "domain", `geosite/${name}.mrs`),
        ),
    ),
    ...STREAMING.map((name) => mrs(name, "domain", `geosite/${name}.mrs`)),
    mrs("cn_domain", "domain", "geosite/cn.mrs"),
    mrs("private_ip", "ipcidr", "geoip/private.mrs"),
    mrs("cn_ip", "ipcidr", "geoip/cn.mrs"),
].join("\n")}

# AI 在流媒体与国内直连之前，避免被 geosite cn / GEOIP CN 先匹配
rules:
  - RULE-SET,private_domain,DIRECT
  - RULE-SET,ads,REJECT
${AI_VENDORS.map((vendor) =>
    [
        ...vendor.extra.map(
            (domain) => `  - DOMAIN-SUFFIX,${domain},${vendor.group}`,
        ),
        `  - RULE-SET,ai_${vendor.slug},${vendor.group}`,
    ].join("\n"),
).join("\n")}
${STREAMING.map((name) => `  - RULE-SET,${name},流媒体`).join("\n")}
  - RULE-SET,cn_domain,DIRECT
  - RULE-SET,private_ip,DIRECT,no-resolve
  - RULE-SET,cn_ip,DIRECT
  - MATCH,节点选择
`;

// ---------- sing-box ----------

/** A remote rule set named "geosite-cn" / "geoip-cn" from meta-rules-dat's sing branch. */
const srs = (tag: string) => ({
    tag,
    type: "remote",
    format: "binary",
    url: `${SING}/${tag.replace(/^(geosite|geoip)-/, "$1/")}.srs`,
    // Through the proxy: GitHub is often unreachable directly from China.
    download_detour: "节点选择",
});

/** A selector defaulting to "节点选择", with every node to pick from. */
const followMainSelector = (tag: string) => ({
    type: "selector",
    tag,
    outbounds: ["节点选择", "{{nodes}}"],
});

const SINGBOX = `${JSON.stringify(
    {
        log: { level: "warn" },
        dns: {
            servers: [
                { tag: "local", type: "udp", server: "223.5.5.5" },
                {
                    tag: "remote",
                    type: "https",
                    server: "1.1.1.1",
                    detour: "节点选择",
                },
            ],
            rules: [
                { rule_set: "geosite-category-ads", action: "reject" },
                {
                    rule_set: ["geosite-private", "geosite-cn"],
                    server: "local",
                },
            ],
            final: "remote",
        },
        inbounds: [
            {
                type: "tun",
                tag: "tun-in",
                address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
                auto_route: true,
                strict_route: true,
            },
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
                tag: "节点选择",
                outbounds: ["自动选择", "{{nodes}}", "direct"],
            },
            {
                type: "urltest",
                tag: "自动选择",
                outbounds: ["{{nodes}}"],
                url: TEST_URL,
                interval: "5m",
                tolerance: 50,
            },
            ...["AI 服务", ...AI_VENDORS.map((vendor) => vendor.group)].map(
                followMainSelector,
            ),
            {
                type: "selector",
                tag: "流媒体",
                outbounds: ["节点选择", "自动选择", "{{nodes}}"],
            },
            { type: "direct", tag: "direct" },
        ],
        route: {
            rules: [
                { action: "sniff" },
                { protocol: "dns", action: "hijack-dns" },
                { ip_is_private: true, outbound: "direct" },
                { rule_set: "geosite-private", outbound: "direct" },
                { rule_set: "geosite-category-ads", action: "reject" },
                // AI before streaming and China-direct rules.
                ...AI_VENDORS.flatMap((vendor) => [
                    {
                        domain_suffix: [...vendor.extra],
                        outbound: vendor.group,
                    },
                    {
                        rule_set: vendor.geosite.map(
                            (name) => `geosite-${name}`,
                        ),
                        outbound: vendor.group,
                    },
                ]),
                {
                    rule_set: STREAMING.map((name) => `geosite-${name}`),
                    outbound: "流媒体",
                },
                { rule_set: ["geosite-cn", "geoip-cn"], outbound: "direct" },
            ],
            rule_set: [
                srs("geosite-private"),
                srs("geosite-category-ads"),
                ...AI_VENDORS.flatMap((vendor) =>
                    vendor.geosite.map((name) => srs(`geosite-${name}`)),
                ),
                ...STREAMING.map((name) => srs(`geosite-${name}`)),
                srs("geosite-cn"),
                srs("geoip-cn"),
            ],
            final: "节点选择",
            auto_detect_interface: true,
            default_domain_resolver: "local",
        },
        experimental: { cache_file: { enabled: true } },
    },
    null,
    2,
)}
`;

// ---------- Quantumult X ----------

const qx = (url: string, tag: string, policy: string) =>
    `${url}, tag=${tag}, force-policy=${policy}, update-interval=86400, opt-parser=false, enabled=true`;
const bmQx = (name: string) => `${BM}/QuantumultX/${name}/${name}.list`;

const QUANTUMULTX = `# Xboard 默认 Quantumult X 规则：每行一条 filter_remote，一键导入时与节点订阅一起添加。
# Quantumult X 的导入不能定义策略组，AI 与流媒体都走内置的 proxy；局域网（FILTER_LAN）由 Quantumult X 自带。
# {{origin}}/api/rules/quantumultx/… 是面板提供的补充 AI 域名。
${qx(bmQx("AdvertisingLite"), "广告拦截", "reject")}
${AI_VENDORS.map((vendor) =>
    [
        qx(
            `{{origin}}/api/rules/quantumultx/ai-${vendor.slug}.list`,
            `${vendor.group} 补充`,
            "proxy",
        ),
        ...vendor.blackmatrix.map((name) => qx(bmQx(name), name, "proxy")),
    ].join("\n"),
).join("\n")}
${qx(bmQx("GlobalMedia"), "国际流媒体", "proxy")}
${qx(bmQx("China"), "国内网站", "direct")}
${qx(bmQx("ChinaIPs"), "国内 IP", "direct")}
`;

// ---------- Loon ----------

const AI_GROUPS = ["AI 服务", ...AI_VENDORS.map((vendor) => vendor.group)];

const LOON = `# Xboard 默认 Loon 配置
# {{subscription}} 由面板换成本用户的 Loon 节点订阅地址，策略组通过“节点订阅”引用其中的节点。
[General]
ip-mode = dual
dns-server = system,223.5.5.5,119.29.29.29
doh-server = https://dns.alidns.com/dns-query
skip-proxy = 192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,localhost,*.local
bypass-tun = 10.0.0.0/8,100.64.0.0/10,127.0.0.0/8,169.254.0.0/16,172.16.0.0/12,192.0.0.0/24,192.0.2.0/24,192.88.99.0/24,192.168.0.0/16,198.51.100.0/24,203.0.113.0/24,224.0.0.0/4,255.255.255.255/32
proxy-test-url = ${TEST_URL}

[Remote Proxy]
节点订阅 = {{subscription}},udp=true,enabled=true

[Proxy Group]
节点选择 = select,自动选择,故障转移,节点订阅,DIRECT
自动选择 = url-test,节点订阅,url=${TEST_URL},interval=600,tolerance=50
故障转移 = fallback,节点订阅,url=${TEST_URL},interval=600,max-timeout=3000
${AI_GROUPS.map((group) => `${group} = select,节点选择,节点订阅`).join("\n")}
流媒体 = select,节点选择,自动选择,节点订阅

[Rule]
# Sukka 的 AI 列表含 api.github.com，GitHub API 不归 AI
DOMAIN,api.github.com,节点选择
${AI_VENDORS.flatMap((vendor) => vendor.extra.map((domain) => `DOMAIN-SUFFIX,${domain},${vendor.group}`)).join("\n")}
GEOIP,CN,DIRECT
FINAL,节点选择

[Remote Rule]
${BM}/Loon/Lan/Lan.list,policy=DIRECT,tag=局域网,enabled=true
${BM}/Loon/AdvertisingLite/AdvertisingLite.list,policy=REJECT,tag=广告拦截,enabled=true
${BM}/Loon/AdvertisingLite/AdvertisingLite_Domain.list,policy=REJECT,tag=广告域名,enabled=true
${AI_VENDORS.flatMap((vendor) => vendor.blackmatrix.map((name) => `${BM}/Loon/${name}/${name}.list,policy=${vendor.group},tag=${name},enabled=true`)).join("\n")}
${SUKKA_AI},policy=其他 AI,tag=AI（Sukka）,enabled=true
${BM}/Loon/GlobalMedia/GlobalMedia.list,policy=流媒体,tag=国际流媒体,enabled=true
${BM}/Loon/China/China.list,policy=DIRECT,tag=国内网站,enabled=true
${BM}/Loon/China/China_Domain.list,policy=DIRECT,tag=国内域名,enabled=true
`;

// ---------- Shadowrocket ----------

const SHADOWROCKET = `# Xboard 默认 Shadowrocket 配置（规则与分组）
# 节点来自同时导入的订阅；PROXY 是 Shadowrocket 内置的节点选择，policy-regex-filter=.* 让分组包含订阅中的全部节点。
[General]
ipv6 = true
dns-server = https://dns.alidns.com/dns-query,https://doh.pub/dns-query,223.5.5.5
fallback-dns-server = system
skip-proxy = 192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,localhost,*.local,captive.apple.com
tun-excluded-routes = 10.0.0.0/8,100.64.0.0/10,127.0.0.0/8,169.254.0.0/16,172.16.0.0/12,192.0.0.0/24,192.0.2.0/24,192.88.99.0/24,192.168.0.0/16,198.51.100.0/24,203.0.113.0/24,224.0.0.0/4,255.255.255.255/32

[Proxy Group]
节点选择 = select,PROXY,自动选择,故障转移,DIRECT
自动选择 = url-test,url=${TEST_URL},interval=600,tolerance=50,timeout=5,policy-regex-filter=.*
故障转移 = fallback,url=${TEST_URL},interval=600,timeout=5,policy-regex-filter=.*
${AI_GROUPS.map((group) => `${group} = select,节点选择,PROXY`).join("\n")}
流媒体 = select,节点选择,自动选择,PROXY

[Rule]
RULE-SET,${BM}/Shadowrocket/Lan/Lan.list,DIRECT
RULE-SET,${BM}/Shadowrocket/AdvertisingLite/AdvertisingLite.list,REJECT
DOMAIN-SET,${BM}/Shadowrocket/AdvertisingLite/AdvertisingLite_Domain.list,REJECT
${AI_VENDORS.map((vendor) =>
    [
        ...vendor.extra.map(
            (domain) => `DOMAIN-SUFFIX,${domain},${vendor.group}`,
        ),
        ...vendor.blackmatrix.map(
            (name) =>
                `RULE-SET,${BM}/Shadowrocket/${name}/${name}.list,${vendor.group}`,
        ),
        ...(vendor.slug === "other"
            ? [
                  // Sukka's list includes api.github.com, which is not AI.
                  "DOMAIN,api.github.com,节点选择",
                  `RULE-SET,${SUKKA_AI},其他 AI`,
              ]
            : []),
    ].join("\n"),
).join("\n")}
RULE-SET,${BM}/Shadowrocket/GlobalMedia/GlobalMedia.list,流媒体
RULE-SET,${BM}/Shadowrocket/China/China.list,DIRECT
DOMAIN-SET,${BM}/Shadowrocket/China/China_Domain.list,DIRECT
GEOIP,CN,DIRECT
FINAL,节点选择
`;

export const DEFAULT_TEMPLATES: Record<TemplateFormat, string> = {
    mihomo: MIHOMO,
    singbox: SINGBOX,
    quantumultx: QUANTUMULTX,
    loon: LOON,
    shadowrocket: SHADOWROCKET,
};
