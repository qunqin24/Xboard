// Subscription templates: default rules and groups per client format,
// node injection, validation, the admin API and the import links.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { parse as parseYaml } from "yaml";
import { TEMPLATE_FORMATS } from "@xboard/contracts";
import { db } from "../src/db";
import { entryFor } from "../src/modules/nodes/subscription";
import {
    AI_VENDORS,
    DEFAULT_TEMPLATES,
} from "../src/modules/templates/defaults";
import {
    quantumultxFilters,
    renderLoon,
    renderMihomo,
    renderSingbox,
    validateTemplate,
} from "../src/modules/templates/service";
import { startTestApp } from "./helpers";

const UUID = "c0ffee00-1234-4abc-8def-0123456789ab";
type Doc = Record<string, unknown>;

function node(id: number, name: string, protocol = "trojan") {
    return entryFor({
        id,
        name,
        protocol,
        host: `n${id}.example.test`,
        port: 443,
        serverPort: 443,
        settings: {},
        serverSecret: "0".repeat(32),
    } as never);
}
const ENTRIES = [node(1, "HK"), node(2, "JP")];
const META_MRS =
    /^https:\/\/raw\.githubusercontent\.com\/MetaCubeX\/meta-rules-dat\/meta\/geo\/(geosite|geoip)\/[\w!-]+\.mrs$/;
const META_SRS =
    /^https:\/\/raw\.githubusercontent\.com\/MetaCubeX\/meta-rules-dat\/sing\/geo\/(geosite|geoip)\/[\w!-]+\.srs$/;
const AI_GROUPS = ["AI 服务", "OpenAI", "Claude", "Gemini", "其他 AI"];
const GROUPS = ["节点选择", "自动选择", "故障转移", ...AI_GROUPS, "流媒体"];
/** Groups the panel no longer creates: regions by node name. */
const REMOVED = ["美国", "日本", "新加坡", "台湾", "香港", "AI 自动选择"];

describe("default templates", () => {
    it("all validate", () => {
        for (const format of TEMPLATE_FORMATS)
            assert.deepEqual(
                validateTemplate(format, DEFAULT_TEMPLATES[format]),
                [],
                format,
            );
    });

    it("Mihomo: AI groups default to 节点选择 with every node, no region groups", () => {
        const doc = parseYaml(
            renderMihomo(DEFAULT_TEMPLATES.mihomo, ENTRIES, UUID),
        ) as Doc;
        const groups = new Map(
            (doc["proxy-groups"] as Doc[]).map((group) => [group.name, group]),
        );
        assert.deepEqual([...groups.keys()], GROUPS);
        for (const name of AI_GROUPS)
            assert.deepEqual(
                groups.get(name)!.proxies,
                ["节点选择", "HK #1", "JP #2"],
                name,
            );
        assert.deepEqual(groups.get("节点选择")!.proxies, [
            "自动选择",
            "故障转移",
            "DIRECT",
            "HK #1",
            "JP #2",
        ]);
        assert.deepEqual(groups.get("流媒体")!.proxies, [
            "节点选择",
            "自动选择",
            "HK #1",
            "JP #2",
        ]);
        for (const group of groups.values())
            for (const key of [
                "include-all-proxies",
                "filter",
                "exclude-filter",
            ])
                assert.ok(!(key in group), `${String(group.name)}: ${key}`);
    });

    it("Mihomo: AI before streaming and China-direct rules, every vendor covered", () => {
        const doc = parseYaml(
            renderMihomo(DEFAULT_TEMPLATES.mihomo, ENTRIES, UUID),
        ) as Doc;
        const rules = doc.rules as string[];
        const at = (rule: string) => {
            const index = rules.indexOf(rule);
            assert.ok(index >= 0, rule);
            return index;
        };
        const firstStreaming = at("RULE-SET,youtube,流媒体");
        const cn = at("RULE-SET,cn_domain,DIRECT");
        for (const [rule, before] of [
            ["RULE-SET,ai_openai,OpenAI", firstStreaming],
            ["RULE-SET,ai_claude,Claude", firstStreaming],
            ["RULE-SET,ai_gemini,Gemini", firstStreaming],
            ["RULE-SET,ai_other,其他 AI", firstStreaming],
            ["DOMAIN-SUFFIX,sora.com,OpenAI", at("RULE-SET,ai_openai,OpenAI")],
            ["DOMAIN-SUFFIX,claudeusercontent.com,Claude", cn],
            ["DOMAIN-SUFFIX,aistudio.google.com,Gemini", cn],
            ["DOMAIN-SUFFIX,perplexity.ai,其他 AI", cn],
            ["DOMAIN-SUFFIX,grok.com,其他 AI", cn],
            ["DOMAIN-SUFFIX,githubcopilot.com,其他 AI", cn],
            ["DOMAIN-SUFFIX,groq.com,其他 AI", cn],
            ["DOMAIN-SUFFIX,openrouter.ai,其他 AI", cn],
            ["DOMAIN-SUFFIX,jetbrains.ai,其他 AI", cn],
        ] as const)
            assert.ok(at(rule) < before, rule);
        // Vendor lists come before the catch-all AI list that also covers them.
        assert.ok(
            at("RULE-SET,ai_gemini,Gemini") < at("RULE-SET,ai_other,其他 AI"),
        );
        for (const rule of [
            "RULE-SET,ads,REJECT",
            "RULE-SET,spotify,流媒体",
            "RULE-SET,cn_ip,DIRECT",
        ])
            at(rule);
        assert.equal(rules.at(-1), "MATCH,节点选择");
        const providers = doc["rule-providers"] as Record<string, Doc>;
        assert.equal(
            providers.ai_openai!.url,
            "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/openai.mrs",
        );
        assert.equal(
            providers.ai_claude!.url,
            "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/anthropic.mrs",
        );
        assert.equal(
            providers.ai_gemini!.url,
            "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/google-gemini.mrs",
        );
        assert.equal(
            providers.ai_other!.url,
            "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/category-ai-!cn.mrs",
        );
        assert.equal(
            providers.ads!.url,
            "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/category-ads.mrs",
        );
        for (const provider of Object.values(providers)) {
            assert.equal(provider.format, "mrs");
            assert.match(String(provider.url), META_MRS);
        }
    });

    it("Mihomo for Stash: YAML rule sets instead of .mrs", () => {
        const doc = parseYaml(
            renderMihomo(DEFAULT_TEMPLATES.mihomo, ENTRIES, UUID, {
                stash: true,
            }),
        ) as Doc;
        const cn = (doc["rule-providers"] as Record<string, Doc>).cn_domain!;
        assert.equal(cn.format, "yaml");
        assert.match(String(cn.url), /geosite\/cn\.yaml$/);
    });

    it("sing-box: the same groups and rule order from meta-rules-dat", () => {
        const doc = JSON.parse(
            renderSingbox(DEFAULT_TEMPLATES.singbox, ENTRIES, UUID),
        ) as Doc;
        const outbounds = doc.outbounds as Doc[];
        const byTag = new Map(outbounds.map((o) => [o.tag, o]));
        // sing-box has no fallback group type.
        for (const tag of GROUPS.filter((g) => g !== "故障转移"))
            assert.ok(byTag.has(tag), tag);
        for (const tag of REMOVED) assert.ok(!byTag.has(tag), tag);
        for (const tag of AI_GROUPS)
            assert.deepEqual(
                byTag.get(tag)!.outbounds,
                ["节点选择", "HK #1", "JP #2"],
                tag,
            );
        assert.ok(!JSON.stringify(doc).includes("{{nodes"));
        const route = doc.route as Doc;
        const rules = route.rules as Doc[];
        const index = (match: (rule: Doc) => boolean) => rules.findIndex(match);
        const streaming = index((r) => r.outbound === "流媒体");
        const china = index(
            (r) =>
                JSON.stringify(r.rule_set) ===
                JSON.stringify(["geosite-cn", "geoip-cn"]),
        );
        for (const vendor of AI_VENDORS) {
            const domains = index(
                (r) =>
                    r.outbound === vendor.group &&
                    Array.isArray(r.domain_suffix),
            );
            const lists = index(
                (r) => r.outbound === vendor.group && Array.isArray(r.rule_set),
            );
            assert.ok(
                domains >= 0 && domains < streaming && lists < streaming,
                vendor.group,
            );
            assert.deepEqual(rules[domains]!.domain_suffix, [...vendor.extra]);
        }
        assert.ok(streaming < china);
        assert.equal(route.final, "节点选择");
        const sets = new Map(
            (route.rule_set as Doc[]).map((set) => [set.tag, String(set.url)]),
        );
        for (const url of sets.values()) assert.match(url, META_SRS);
        for (const [tag, file] of [
            ["geosite-openai", "geosite/openai"],
            ["geosite-anthropic", "geosite/anthropic"],
            ["geosite-google-gemini", "geosite/google-gemini"],
            ["geosite-category-ai-!cn", "geosite/category-ai-!cn"],
            ["geoip-cn", "geoip/cn"],
        ])
            assert.equal(
                sets.get(tag),
                `https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/${file}.srs`,
            );
        const dns = doc.dns as Doc;
        assert.equal(dns.final, "remote");
        assert.ok(!("geoip" in route) && !("geosite" in route));
        for (const server of dns.servers as Doc[])
            assert.ok("type" in server && !("address" in server));
        assert.ok(
            !outbounds.some((o) => o.type === "block" || o.type === "dns"),
        );
    });

    it("Loon, Shadowrocket and Quantumult X: the same AI vendors, all on 节点选择", () => {
        const loon = renderLoon(
            DEFAULT_TEMPLATES.loon,
            "https://panel.example/sub?format=loon",
        );
        const rocket = DEFAULT_TEMPLATES.shadowrocket;
        const filters = quantumultxFilters(
            DEFAULT_TEMPLATES.quantumultx,
            "https://panel.example",
        );
        assert.ok(
            loon.includes("节点订阅 = https://panel.example/sub?format=loon,"),
        );
        assert.ok(!loon.includes("[Remote Filter]"));
        for (const name of REMOVED) {
            assert.ok(!new RegExp(`^${name} =`, "m").test(loon), name);
            assert.ok(!new RegExp(`^${name} =`, "m").test(rocket), name);
        }
        assert.ok(!/policy-regex-filter=(?!\.\*)/.test(rocket));
        for (const group of AI_GROUPS) {
            assert.match(
                loon,
                new RegExp(`^${group} = select,节点选择,节点订阅$`, "m"),
            );
            assert.match(
                rocket,
                new RegExp(`^${group} = select,节点选择,PROXY$`, "m"),
            );
        }
        for (const vendor of AI_VENDORS) {
            for (const name of vendor.blackmatrix) {
                assert.ok(
                    loon.includes(
                        `/Loon/${name}/${name}.list,policy=${vendor.group},`,
                    ),
                    name,
                );
                assert.ok(
                    rocket.includes(
                        `/Shadowrocket/${name}/${name}.list,${vendor.group}`,
                    ),
                    name,
                );
                assert.ok(
                    filters.some(
                        (f) =>
                            f.includes(`/QuantumultX/${name}/${name}.list, `) &&
                            f.includes("force-policy=proxy"),
                    ),
                    name,
                );
            }
            for (const domain of vendor.extra) {
                assert.ok(
                    loon.includes(`DOMAIN-SUFFIX,${domain},${vendor.group}\n`),
                    domain,
                );
                assert.ok(
                    rocket.includes(
                        `DOMAIN-SUFFIX,${domain},${vendor.group}\n`,
                    ),
                    domain,
                );
            }
            assert.ok(
                filters.some((f) =>
                    f.startsWith(
                        `https://panel.example/api/rules/quantumultx/ai-${vendor.slug}.list, `,
                    ),
                ),
                vendor.slug,
            );
        }
        for (const domain of ["groq.com", "openrouter.ai", "jetbrains.ai"])
            assert.ok(
                AI_VENDORS.at(-1)!.extra.includes(domain as never),
                domain,
            );
        // api.github.com is in Sukka's AI list but is not AI.
        assert.ok(
            rocket.indexOf("DOMAIN,api.github.com,节点选择") <
                rocket.indexOf("ruleset.skk.moe/List/non_ip/ai.conf"),
        );
        assert.match(
            loon,
            /^\[Rule\]\n(?:#.*\n)?DOMAIN,api\.github\.com,节点选择$/m,
        );
        assert.ok(
            loon.includes(
                "https://ruleset.skk.moe/List/non_ip/ai.conf,policy=其他 AI,",
            ),
        );
        assert.ok(
            rocket.includes(
                "RULE-SET,https://ruleset.skk.moe/List/non_ip/ai.conf,其他 AI",
            ),
        );
        // Shadowrocket reads rules in order: AI before China.
        assert.ok(
            rocket.indexOf("DOMAIN-SUFFIX,sora.com,OpenAI") <
                rocket.indexOf("/Shadowrocket/China/China.list"),
        );
        assert.ok(
            rocket.indexOf("ai.conf,其他 AI") < rocket.indexOf("GlobalMedia"),
        );
        assert.match(loon, /\/Loon\/China\/China\.list,policy=DIRECT/);
        assert.match(loon, /GEOIP,CN,DIRECT\nFINAL,节点选择/);
        assert.match(rocket, /GEOIP,CN,DIRECT\nFINAL,节点选择\n$/);
        assert.ok(
            filters.some((f) =>
                /QuantumultX\/ChinaIPs\/ChinaIPs\.list, .*force-policy=direct/.test(
                    f,
                ),
            ),
        );
        assert.ok(
            filters.some((f) => /AdvertisingLite.*force-policy=reject/.test(f)),
        );
        for (const url of loon.match(
            /https:\/\/raw\.githubusercontent\.com\/\S+?\.list/g,
        )!)
            assert.match(
                url,
                /\/blackmatrix7\/ios_rule_script\/master\/rule\/Loon\//,
            );
        for (const url of rocket.match(
            /https:\/\/raw\.githubusercontent\.com\/\S+?\.list/g,
        )!)
            assert.match(
                url,
                /\/blackmatrix7\/ios_rule_script\/master\/rule\/Shadowrocket\//,
            );
    });
});

describe("custom templates", () => {
    it("inject nodes into a minimal Mihomo and sing-box template", () => {
        const yaml = renderMihomo(
            "proxy-groups:\n  - {name: 出口, type: select, include-all-proxies: true}\nrules:\n  - MATCH,出口\n",
            ENTRIES,
            UUID,
        );
        const doc = parseYaml(yaml) as Doc;
        assert.deepEqual((doc["proxy-groups"] as Doc[])[0]!.proxies, [
            "HK #1",
            "JP #2",
        ]);
        assert.equal((doc.proxies as Doc[]).length, 2);
        const json = JSON.parse(
            renderSingbox(
                '{"outbounds":[{"type":"selector","tag":"出口","outbounds":["{{nodes}}"]}],"route":{"final":"出口"}}',
                ENTRIES,
                UUID,
            ),
        ) as Doc;
        assert.deepEqual((json.outbounds as Doc[])[0]!.outbounds, [
            "HK #1",
            "JP #2",
        ]);
        assert.equal((json.outbounds as Doc[]).length, 3);
    });

    it("are rejected when broken", () => {
        const cases: [
            Parameters<typeof validateTemplate>[0],
            string,
            RegExp,
        ][] = [
            ["mihomo", "proxy-groups: [\n", /YAML 格式错误/],
            [
                "mihomo",
                "proxy-groups:\n  - {name: A, type: select, proxies: [DIRECT]}\nrules:\n  - MATCH,A\n",
                /include-all-proxies/,
            ],
            [
                "mihomo",
                "proxy-groups:\n  - {name: A, type: select, include-all-proxies: true}\nrules:\n  - DOMAIN,x.com,B\n  - MATCH,A\n",
                /目标“B”/,
            ],
            [
                "mihomo",
                "proxy-groups:\n  - {name: A, type: select, include-all-proxies: true}\nrules:\n  - RULE-SET,cn,DIRECT\n  - MATCH,A\n",
                /rule-provider 不存在/,
            ],
            [
                "mihomo",
                "proxy-groups:\n  - {name: A, type: select, include-all-proxies: true}\nrules:\n  - DOMAIN,x.com,A\n",
                /最后一条规则需为 MATCH/,
            ],
            ["singbox", "{ not json", /JSON 格式错误/],
            [
                "singbox",
                '{"outbounds":[{"type":"selector","tag":"A","outbounds":["direct"]},{"type":"direct","tag":"direct"}]}',
                /\{\{nodes\}\}/,
            ],
            [
                "singbox",
                '{"outbounds":[{"type":"selector","tag":"A","outbounds":["{{nodes}}"]}],"route":{"final":"B"}}',
                /route\.final“B”不存在/,
            ],
            [
                "singbox",
                '{"outbounds":[{"type":"selector","tag":"A","outbounds":["{{nodes}}"]}],"route":{"rules":[{"rule_set":"cn","outbound":"A"}]}}',
                /规则集“cn”不存在/,
            ],
            [
                "loon",
                "[Proxy Group]\nA = select,DIRECT\n[Rule]\nFINAL,A\n",
                /\{\{subscription\}\}/,
            ],
            [
                "loon",
                "[Remote Proxy]\nS = {{subscription}}\n[Proxy Group]\nA = select,S\n[Rule]\nFINAL,B\n",
                /策略“B”不存在/,
            ],
            [
                "shadowrocket",
                "[Proxy Group]\nA = select,PROXY\n[Rule]\nGEOIP,CN,DIRECT\n",
                /FINAL/,
            ],
            ["shadowrocket", "[Rule]\nFINAL,PROXY\n", /\[Proxy Group\]/],
            ["quantumultx", "not-a-url, tag=x\n", /http\(s\)/],
            ["quantumultx", "# only a comment\n", /至少需要一条/],
        ];
        for (const [format, content, expected] of cases) {
            const errors = validateTemplate(format, content);
            assert.ok(
                errors.some((error) => expected.test(error)),
                `${format}: ${content}\n→ ${errors.join(" | ")}`,
            );
        }
    });
});

describe("template admin API and subscriptions", () => {
    type Harness = Awaited<ReturnType<typeof startTestApp>>;
    let t: Harness;
    let admin = "";
    let token = "";

    before(async () => {
        t = await startTestApp();
        await t.createUser("tpl-admin@example.test", "tpl-admin-password", {
            role: "admin",
        });
        admin = await t.cookieFor(
            "tpl-admin@example.test",
            "tpl-admin-password",
        );
        const plan = await db.plan.create({
            data: { name: "T", transferEnable: 10n ** 12n, published: true },
        });
        await t.createUser("tpl-user@example.test", "tpl-user-password", {
            planId: plan.id,
            expiredAt: new Date(Date.now() + 86_400_000 * 30),
            transferEnable: 10n ** 12n,
        });
        await db.node.create({
            data: {
                name: "Tokyo",
                protocol: "vless",
                host: "tokyo.example.test",
                port: 443,
                serverPort: 443,
                enabled: true,
                tokenHash: "00",
                plans: { create: [{ planId: plan.id }] },
            },
        });
        const links = (await (
            await t.call("/account/subscription", {
                cookie: await t.cookieFor(
                    "tpl-user@example.test",
                    "tpl-user-password",
                ),
            })
        ).json()) as { url: string; imports: Record<string, string> };
        token = new URL(links.url).pathname.split("/").at(-1)!;
    });
    after(async () => {
        await t?.stop();
    });

    const subscription = async (format: string) => {
        const response = await fetch(
            `${t.baseUrl}/api/subscription/${token}?format=${format}`,
        );
        assert.equal(response.status, 200, format);
        return response.text();
    };

    it("serves every format with groups, rules and the node", async () => {
        const mihomo = parseYaml(await subscription("mihomo")) as Doc;
        assert.ok(
            (mihomo.proxies as Doc[]).some(
                (p) =>
                    p.name === `Tokyo #${1}` ||
                    String(p.name).startsWith("Tokyo #"),
            ),
        );
        assert.ok(
            (mihomo["proxy-groups"] as Doc[]).some(
                (g) => g.name === "节点选择",
            ),
        );
        assert.equal((mihomo.rules as string[]).at(-1), "MATCH,节点选择");
        const sing = JSON.parse(await subscription("singbox")) as Doc;
        assert.ok(
            (sing.outbounds as Doc[]).some((o) =>
                String(o.tag).startsWith("Tokyo #"),
            ),
        );
        assert.equal((sing.route as Doc).final, "节点选择");
        const loon = await subscription("loon-config");
        assert.ok(loon.includes(`/api/subscription/${token}?format=loon,`));
        assert.ok(loon.includes("FINAL,节点选择"));
        const nodeList = await subscription("loon");
        assert.match(nodeList, /^Tokyo #\d+ = VLESS,tokyo\.example\.test,443,/);
        assert.match(
            await subscription("shadowrocket-rules"),
            /FINAL,节点选择/,
        );
    });

    it("builds import links that carry the rules", async () => {
        const links = (await (
            await t.call("/account/subscription", {
                cookie: await t.cookieFor(
                    "tpl-user@example.test",
                    "tpl-user-password",
                ),
            })
        ).json()) as { url: string; imports: Record<string, string> };
        const qx = new URL(
            links.imports.quantumultx!.replace(
                "quantumult-x:///",
                "https://x/",
            ),
        );
        const resource = JSON.parse(
            qx.searchParams.get("remote-resource")!,
        ) as {
            server_remote: string[];
            filter_remote: string[];
        };
        assert.deepEqual(resource.server_remote, [
            `${links.url}?format=quantumultx, tag=Xboard`,
        ]);
        assert.deepEqual(
            resource.filter_remote,
            quantumultxFilters(
                DEFAULT_TEMPLATES.quantumultx,
                new URL(links.url).origin,
            ),
        );
        assert.equal(
            links.imports.loon,
            `loon://import?sub=${encodeURIComponent(`${links.url}?format=loon-config`)}`,
        );
        // Quantumult X's supplementary AI domains are served by the panel.
        assert.ok(
            resource.filter_remote.some((line) =>
                line.startsWith(
                    `${new URL(links.url).origin}/api/rules/quantumultx/ai-openai.list, `,
                ),
            ),
        );
        const extra = await fetch(
            `${t.baseUrl}/api/rules/quantumultx/ai-other.list`,
        );
        assert.equal(extra.status, 200);
        const text = await extra.text();
        for (const domain of ["perplexity.ai", "grok.com", "character.ai"])
            assert.ok(text.includes(`host-suffix, ${domain}, proxy\n`), domain);
        assert.equal(
            (await fetch(`${t.baseUrl}/api/rules/quantumultx/nope.list`))
                .status,
            404,
        );
        assert.equal(
            links.imports.shadowrocketRules,
            `shadowrocket://config/add/${links.url}?format=shadowrocket-rules`,
        );
    });

    it("lets admins edit, validates, audits and restores defaults", async () => {
        const list = (await (
            await t.call("/admin/subscription-templates", { cookie: admin })
        ).json()) as {
            format: string;
            customized: boolean;
            content: string;
        }[];
        assert.deepEqual(
            list.map((x) => x.format),
            [...TEMPLATE_FORMATS],
        );
        assert.ok(
            list.every(
                (x) =>
                    !x.customized &&
                    x.content ===
                        DEFAULT_TEMPLATES[
                            x.format as keyof typeof DEFAULT_TEMPLATES
                        ],
            ),
        );

        const bad = await t.call("/admin/subscription-templates/mihomo", {
            cookie: admin,
            method: "PUT",
            body: { content: "proxy-groups: [\n" },
        });
        assert.equal(bad.status, 400);
        assert.match(
            ((await bad.json()) as { error: { message: string } }).error
                .message,
            /YAML/,
        );

        const custom =
            "proxy-groups:\n  - name: 出口\n    type: select\n    include-all-proxies: true\nrules:\n  - GEOIP,CN,DIRECT\n  - MATCH,出口\n";
        const saved = await t.call("/admin/subscription-templates/mihomo", {
            cookie: admin,
            method: "PUT",
            body: { content: custom },
        });
        assert.equal(saved.status, 200);
        assert.equal(
            ((await saved.json()) as { customized: boolean }).customized,
            true,
        );
        // The saved text stays the admin's, whatever the built-in default is.
        const listed = (await (
            await t.call("/admin/subscription-templates", { cookie: admin })
        ).json()) as {
            format: string;
            content: string;
            defaultContent: string;
            customized: boolean;
        }[];
        const mihomoRow = listed.find((x) => x.format === "mihomo")!;
        assert.equal(mihomoRow.content, custom);
        assert.equal(mihomoRow.defaultContent, DEFAULT_TEMPLATES.mihomo);
        assert.ok(mihomoRow.customized);
        const doc = parseYaml(await subscription("mihomo")) as Doc;
        assert.deepEqual(
            (doc["proxy-groups"] as Doc[]).map((g) => g.name),
            ["出口"],
        );
        assert.ok(
            (
                (doc["proxy-groups"] as Doc[])[0]!.proxies as string[]
            )[0]!.startsWith("Tokyo #"),
        );
        assert.deepEqual(doc.rules, ["GEOIP,CN,DIRECT", "MATCH,出口"]);

        const reset = await t.call("/admin/subscription-templates/mihomo", {
            cookie: admin,
            method: "DELETE",
        });
        assert.equal(reset.status, 200);
        assert.equal(
            ((await reset.json()) as { customized: boolean }).customized,
            false,
        );
        const restored = parseYaml(await subscription("mihomo")) as Doc;
        assert.equal((restored.rules as string[]).at(-1), "MATCH,节点选择");

        const audits = await db.audit.findMany({
            where: { action: { in: ["template.save", "template.reset"] } },
            orderBy: { id: "asc" },
        });
        assert.deepEqual(
            audits.map((a) => [a.action, a.target]),
            [
                ["template.save", "mihomo"],
                ["template.reset", "mihomo"],
            ],
        );

        assert.equal(
            (
                await t.call("/admin/subscription-templates/clash", {
                    cookie: admin,
                    method: "DELETE",
                })
            ).status,
            400,
        );
        assert.equal(
            (await t.call("/admin/subscription-templates", {})).status,
            401,
        );
    });
});
