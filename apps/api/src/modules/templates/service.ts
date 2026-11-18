import {
    parse as parseYaml,
    stringify as stringifyYaml,
    YAMLParseError,
} from "yaml";
import type { TemplateFormat } from "@xboard/contracts";
import { db } from "../../db";
import {
    mihomoProxies,
    singboxOutbounds,
    type Entry,
} from "../nodes/subscription";
import { DEFAULT_TEMPLATES } from "./defaults";

// Subscription templates: the rules and proxy groups around the nodes.
// Injection points, one per format:
// - Mihomo (YAML): node proxies are appended to `proxies`; every proxy group
//   with `include-all-proxies: true` (or `include-all: true`) gets all node
//   names appended to its `proxies`, and the flag is removed, so clients
//   without that option (Stash) read the same file.
// - sing-box (JSON): node outbounds are appended to `outbounds`; the string
//   "{{nodes}}" inside any `outbounds` list is replaced by all node tags.
// - Loon: "{{subscription}}" is replaced by the user's Loon node-list URL.
// - Quantumult X: the template is the filter_remote list added next to the
//   node subscription; nothing is injected.
// - Shadowrocket: groups pick nodes from the separately imported
//   subscription (PROXY, policy-regex-filter); nothing is injected.

export const NODES = "{{nodes}}";
export const SUBSCRIPTION = "{{subscription}}";

type Doc = Record<string, unknown>;
const isObject = (value: unknown): value is Doc =>
    !!value && typeof value === "object" && !Array.isArray(value);

/** The admin's template, or the built-in one. */
export async function loadTemplate(format: TemplateFormat): Promise<string> {
    const row = await db.subscriptionTemplate.findUnique({ where: { format } });
    return row?.content ?? DEFAULT_TEMPLATES[format];
}

// ---------- Rendering ----------

export function renderMihomo(
    template: string,
    entries: Entry[],
    uuid: string,
    options: { stash?: boolean } = {},
): string {
    const doc = parseYaml(template) as Doc;
    const proxies = mihomoProxies(entries, uuid);
    const names = proxies.map((proxy) => proxy.name as string);
    doc.proxies = [
        ...(Array.isArray(doc.proxies) ? doc.proxies : []),
        ...proxies,
    ];
    for (const group of (doc["proxy-groups"] as Doc[] | undefined) ?? []) {
        if (
            !isObject(group) ||
            (group["include-all-proxies"] !== true &&
                group["include-all"] !== true)
        )
            continue;
        delete group["include-all-proxies"];
        delete group["include-all"];
        group.proxies = [
            ...(Array.isArray(group.proxies) ? group.proxies : []),
            ...names,
        ];
    }
    // Stash reads YAML/text rule sets but not Mihomo's binary .mrs; MetaCubeX
    // publishes a .yaml next to every .mrs.
    if (options.stash && isObject(doc["rule-providers"]))
        for (const provider of Object.values(doc["rule-providers"])) {
            if (!isObject(provider) || provider.format !== "mrs") continue;
            provider.format = "yaml";
            for (const key of ["url", "path"])
                if (typeof provider[key] === "string")
                    provider[key] = (provider[key] as string).replace(
                        /\.mrs$/,
                        ".yaml",
                    );
        }
    return stringifyYaml(doc, { lineWidth: 0 });
}

export function renderSingbox(
    template: string,
    entries: Entry[],
    uuid: string,
): string {
    const doc = JSON.parse(template) as Doc;
    const nodes = singboxOutbounds(entries, uuid);
    const tags = nodes.map((node) => node.tag as string);
    const outbounds = ((doc.outbounds as Doc[] | undefined) ?? []).filter(
        isObject,
    );
    for (const outbound of outbounds)
        if (Array.isArray(outbound.outbounds))
            outbound.outbounds = (outbound.outbounds as string[]).flatMap(
                (tag) => (tag === NODES ? tags : [tag]),
            );
    doc.outbounds = [...outbounds, ...nodes];
    return `${JSON.stringify(doc, null, 2)}\n`;
}

/** Non-empty, non-comment lines of a line-based template. */
const lines = (template: string) =>
    template
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(
            (line) => line && !line.startsWith("#") && !line.startsWith(";"),
        );

export const ORIGIN = "{{origin}}";

/** Quantumult X filter_remote entries; "{{origin}}" is the panel's address. */
export const quantumultxFilters = (template: string, origin = "") =>
    lines(template).map((line) => line.replaceAll(ORIGIN, origin));

export function renderLoon(template: string, nodeListUrl: string): string {
    return template.replaceAll(SUBSCRIPTION, nodeListUrl);
}

// ---------- Validation ----------

const SAMPLE_UUID = "00000000-0000-4000-8000-000000000000";

/** A node used to check that a template renders. */
function sampleEntries(): Entry[] {
    return [
        {
            id: 1,
            name: "示例节点",
            host: "node.example.com",
            port: 443,
            backend: {
                id: 1,
                name: "示例节点",
                protocol: "trojan",
                host: "node.example.com",
                port: 443,
                serverPort: 443,
                settings: {},
                serverSecret: "0".repeat(32),
            } as never,
        },
    ];
}

const MIHOMO_BUILTIN = [
    "DIRECT",
    "REJECT",
    "REJECT-DROP",
    "PASS",
    "COMPATIBLE",
];
const LOGIC_RULE = /^(AND|OR|NOT|SUB-RULE)\s*,/i;

function yamlError(error: unknown): string {
    if (error instanceof YAMLParseError) {
        const line = error.linePos?.[0]?.line;
        return `YAML 格式错误${line ? `（第 ${line} 行）` : ""}：${error.message.split("\n")[0]}`;
    }
    return `YAML 格式错误：${String(error)}`;
}

function validateMihomo(template: string): string[] {
    let doc: unknown;
    try {
        doc = parseYaml(template);
    } catch (error) {
        return [yamlError(error)];
    }
    if (!isObject(doc)) return ["模板顶层需为 YAML 映射"];
    const errors: string[] = [];
    const groups = doc["proxy-groups"];
    if (!Array.isArray(groups) || !groups.length)
        return ["需要 proxy-groups 列表"];
    const staticProxies = Array.isArray(doc.proxies)
        ? (doc.proxies as Doc[]).map((proxy) => String(proxy?.name))
        : [];
    const names = new Set<string>();
    let injected = false;
    for (const [index, group] of groups.entries()) {
        if (!isObject(group) || typeof group.name !== "string" || !group.name) {
            errors.push(`proxy-groups 第 ${index + 1} 项缺少 name`);
            continue;
        }
        if (typeof group.type !== "string")
            errors.push(`分组“${group.name}”缺少 type`);
        if (names.has(group.name)) errors.push(`分组“${group.name}”重名`);
        names.add(group.name);
    }
    const known = new Set([...names, ...staticProxies, ...MIHOMO_BUILTIN]);
    for (const group of groups) {
        if (!isObject(group) || typeof group.name !== "string") continue;
        const includesNodes =
            group["include-all-proxies"] === true ||
            group["include-all"] === true;
        injected ||= includesNodes;
        const members = Array.isArray(group.proxies) ? group.proxies : [];
        for (const member of members)
            if (!known.has(String(member)))
                errors.push(
                    `分组“${group.name}”引用了不存在的“${String(member)}”`,
                );
        if (!members.length && !includesNodes && !group.use)
            errors.push(`分组“${group.name}”没有任何节点或分组`);
    }
    if (!injected)
        errors.push(
            "至少一个分组需要 include-all-proxies: true，节点才会出现在分组中",
        );
    const providers = isObject(doc["rule-providers"])
        ? new Set(Object.keys(doc["rule-providers"]))
        : new Set<string>();
    const rules = doc.rules;
    if (!Array.isArray(rules) || !rules.length) errors.push("需要 rules 列表");
    else {
        for (const rule of rules) {
            if (typeof rule !== "string") {
                errors.push(`规则需为字符串：${JSON.stringify(rule)}`);
                continue;
            }
            if (LOGIC_RULE.test(rule)) continue;
            const parts = rule.split(",").map((part) => part.trim());
            const type = parts[0]!.toUpperCase();
            const target = type === "MATCH" ? parts[1] : parts[2];
            if (!target || !known.has(target))
                errors.push(
                    `规则“${rule}”的目标“${target ?? ""}”不是分组或内置策略`,
                );
            if (type === "RULE-SET" && !providers.has(parts[1] ?? ""))
                errors.push(`规则“${rule}”引用的 rule-provider 不存在`);
        }
        const last = String(rules.at(-1)).toUpperCase();
        if (!last.startsWith("MATCH,")) errors.push("最后一条规则需为 MATCH");
    }
    return errors;
}

function validateSingbox(template: string): string[] {
    let doc: unknown;
    try {
        doc = JSON.parse(template);
    } catch (error) {
        return [`JSON 格式错误：${(error as Error).message}`];
    }
    if (!isObject(doc)) return ["模板顶层需为 JSON 对象"];
    const errors: string[] = [];
    const outbounds = doc.outbounds;
    if (!Array.isArray(outbounds) || !outbounds.length)
        return ["需要 outbounds 列表"];
    const tags = new Set<string>();
    for (const [index, outbound] of outbounds.entries()) {
        if (
            !isObject(outbound) ||
            typeof outbound.tag !== "string" ||
            typeof outbound.type !== "string"
        ) {
            errors.push(`outbounds 第 ${index + 1} 项需要 type 与 tag`);
            continue;
        }
        if (tags.has(outbound.tag)) errors.push(`出站“${outbound.tag}”重名`);
        tags.add(outbound.tag);
    }
    let injected = false;
    for (const outbound of outbounds) {
        if (!isObject(outbound) || !Array.isArray(outbound.outbounds)) continue;
        for (const member of outbound.outbounds as unknown[]) {
            if (member === NODES) injected = true;
            else if (!tags.has(String(member)))
                errors.push(
                    `出站“${String(outbound.tag)}”引用了不存在的“${String(member)}”`,
                );
        }
        if (typeof outbound.default === "string" && !tags.has(outbound.default))
            errors.push(`出站“${String(outbound.tag)}”的 default 不存在`);
    }
    if (!injected)
        errors.push(
            `至少一个分组的 outbounds 需要包含 "${NODES}"，节点才会出现在分组中`,
        );
    const route = isObject(doc.route) ? doc.route : {};
    const ruleSets = new Set(
        Array.isArray(route.rule_set)
            ? (route.rule_set as Doc[]).map((set) => String(set?.tag))
            : [],
    );
    for (const set of Array.isArray(route.rule_set)
        ? (route.rule_set as Doc[])
        : [])
        if (
            typeof set?.download_detour === "string" &&
            !tags.has(set.download_detour)
        )
            errors.push(`规则集“${String(set.tag)}”的 download_detour 不存在`);
    const dns = isObject(doc.dns) ? doc.dns : {};
    const servers = new Set(
        Array.isArray(dns.servers)
            ? (dns.servers as Doc[]).map((server) => String(server?.tag))
            : [],
    );
    for (const server of Array.isArray(dns.servers)
        ? (dns.servers as Doc[])
        : [])
        if (typeof server?.detour === "string" && !tags.has(server.detour))
            errors.push(`DNS 服务器“${String(server.tag)}”的 detour 不存在`);
    const checkRuleSets = (where: string, value: unknown) => {
        for (const tag of Array.isArray(value)
            ? value
            : value === undefined
              ? []
              : [value])
            if (!ruleSets.has(String(tag)))
                errors.push(`${where}引用的规则集“${String(tag)}”不存在`);
    };
    for (const rule of Array.isArray(route.rules)
        ? (route.rules as Doc[])
        : []) {
        if (!isObject(rule)) continue;
        if (typeof rule.outbound === "string" && !tags.has(rule.outbound))
            errors.push(`路由规则的出站“${rule.outbound}”不存在`);
        checkRuleSets("路由规则", rule.rule_set);
    }
    for (const rule of Array.isArray(dns.rules) ? (dns.rules as Doc[]) : []) {
        if (!isObject(rule)) continue;
        if (typeof rule.server === "string" && !servers.has(rule.server))
            errors.push(`DNS 规则的服务器“${rule.server}”不存在`);
        checkRuleSets("DNS 规则", rule.rule_set);
    }
    if (typeof route.final === "string" && !tags.has(route.final))
        errors.push(`route.final“${route.final}”不存在`);
    if (typeof dns.final === "string" && !servers.has(dns.final))
        errors.push(`dns.final“${dns.final}”不存在`);
    if (
        typeof route.default_domain_resolver === "string" &&
        !servers.has(route.default_domain_resolver)
    )
        errors.push("route.default_domain_resolver 不是已定义的 DNS 服务器");
    return errors;
}

/** "[Section]" → its lines, for Loon and Shadowrocket configurations. */
function sections(template: string): Map<string, string[]> {
    const result = new Map<string, string[]>();
    let current = "";
    for (const line of lines(template)) {
        const header = /^\[(.+)\]$/.exec(line);
        if (header) {
            current = header[1]!.trim();
            result.set(current, result.get(current) ?? []);
        } else result.get(current)?.push(line);
    }
    return result;
}

/** "Name = type,a,b,key=value" → name and the members that are not options. */
function groupLine(line: string) {
    const index = line.indexOf("=");
    if (index < 0) return null;
    const name = line.slice(0, index).trim();
    const [type, ...rest] = line
        .slice(index + 1)
        .split(",")
        .map((part) => part.trim());
    return {
        name,
        type: type ?? "",
        members: rest.filter((part) => part && !part.includes("=")),
    };
}

function validateSurgeLike(
    template: string,
    builtin: string[],
    extraNames: (parts: Map<string, string[]>) => string[],
): { errors: string[]; parts: Map<string, string[]>; known: Set<string> } {
    const errors: string[] = [];
    const parts = sections(template);
    for (const required of ["Proxy Group", "Rule"])
        if (!parts.has(required)) errors.push(`缺少 [${required}] 段`);
    const groups = (parts.get("Proxy Group") ?? []).map(groupLine);
    const names = new Set<string>();
    for (const [index, group] of groups.entries()) {
        if (!group || !group.name) {
            errors.push(
                `[Proxy Group] 第 ${index + 1} 行格式应为“名称 = 类型,成员…”`,
            );
            continue;
        }
        if (names.has(group.name)) errors.push(`策略组“${group.name}”重名`);
        names.add(group.name);
    }
    const known = new Set([...names, ...builtin, ...extraNames(parts)]);
    for (const group of groups)
        if (group)
            for (const member of group.members)
                if (!known.has(member))
                    errors.push(
                        `策略组“${group.name}”引用了不存在的“${member}”`,
                    );
    const rules = parts.get("Rule") ?? [];
    for (const rule of rules) {
        if (LOGIC_RULE.test(rule)) continue;
        const fields = rule.split(",").map((part) => part.trim());
        const type = fields[0]!.toUpperCase();
        const target = type === "FINAL" ? fields[1] : fields[2];
        if (!target || !known.has(target))
            errors.push(`规则“${rule}”的策略“${target ?? ""}”不存在`);
    }
    if (!rules.length || !/^FINAL\s*,/i.test(rules.at(-1)!))
        errors.push("[Rule] 的最后一条需为 FINAL");
    return { errors, parts, known };
}

function validateLoon(template: string): string[] {
    const { errors, parts, known } = validateSurgeLike(
        template,
        [
            "DIRECT",
            "REJECT",
            "REJECT-DROP",
            "REJECT-IMG",
            "REJECT-DICT",
            "REJECT-ARRAY",
        ],
        (parts) =>
            [
                ...(parts.get("Remote Proxy") ?? []),
                ...(parts.get("Proxy") ?? []),
                ...(parts.get("Remote Filter") ?? []),
            ]
                .map((line) => line.slice(0, line.indexOf("=")).trim())
                .filter(Boolean),
    );
    if (!template.includes(SUBSCRIPTION))
        errors.push(
            `需要在 [Remote Proxy] 中使用 ${SUBSCRIPTION} 引用节点订阅`,
        );
    for (const line of parts.get("Remote Rule") ?? []) {
        const policy = /(?:^|,)\s*policy\s*=\s*([^,]+)/.exec(line)?.[1]?.trim();
        if (!/^https?:\/\//.test(line))
            errors.push(`远程规则需以 http(s) 地址开头：${line}`);
        else if (!policy) errors.push(`远程规则缺少 policy：${line}`);
        else if (!known.has(policy))
            errors.push(`远程规则的策略“${policy}”不存在`);
    }
    return errors;
}

function validateShadowrocket(template: string): string[] {
    return validateSurgeLike(
        template,
        [
            "DIRECT",
            "REJECT",
            "REJECT-DROP",
            "REJECT-TINYGIF",
            "REJECT-NO-DROP",
            "PROXY",
        ],
        (parts) =>
            (parts.get("Proxy") ?? [])
                .map((line) => line.slice(0, line.indexOf("=")).trim())
                .filter(Boolean),
    ).errors;
}

function validateQuantumultx(template: string): string[] {
    const filters = lines(template);
    if (!filters.length) return ["至少需要一条 filter_remote"];
    const errors: string[] = [];
    for (const line of filters) {
        const [url, ...options] = line.split(",").map((part) => part.trim());
        if (!/^(https?:\/\/|\{\{origin\}\}\/)\S+$/.test(url ?? ""))
            errors.push(`每行需以 http(s) 地址或 {{origin}}/ 开头：${line}`);
        for (const option of options)
            if (!/^[\w-]+=.+$/.test(option))
                errors.push(`参数格式应为 key=value：${option}`);
    }
    return errors;
}

/** Problems with a template, in Chinese; empty when it can be saved. */
export function validateTemplate(
    format: TemplateFormat,
    content: string,
): string[] {
    const errors =
        format === "mihomo"
            ? validateMihomo(content)
            : format === "singbox"
              ? validateSingbox(content)
              : format === "loon"
                ? validateLoon(content)
                : format === "shadowrocket"
                  ? validateShadowrocket(content)
                  : validateQuantumultx(content);
    if (errors.length) return errors.slice(0, 20);
    // It must also render with a node.
    try {
        if (format === "mihomo")
            renderMihomo(content, sampleEntries(), SAMPLE_UUID);
        if (format === "singbox")
            renderSingbox(content, sampleEntries(), SAMPLE_UUID);
    } catch (error) {
        return [`无法生成配置：${(error as Error).message}`];
    }
    return [];
}
