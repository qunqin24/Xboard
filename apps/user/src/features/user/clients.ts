import type { SubscriptionLinks } from "@xboard/contracts";

// Proxy clients the subscription link can be imported into. The link is the
// same for all of them: the API picks Mihomo, sing-box, Shadowrocket share
// links or Quantumult X / Loon node lines from the client's User-Agent. `importUrl` builds the app's own "add
// subscription" link; `name` is what the app shows for the subscription.

export type Platform = "ios" | "android" | "windows" | "mac" | "linux";

export const PLATFORMS: { value: Platform; label: string }[] = [
    { value: "ios", label: "iOS" },
    { value: "android", label: "Android" },
    { value: "windows", label: "Windows" },
    { value: "mac", label: "macOS" },
    { value: "linux", label: "Linux" },
];

export type Client = {
    id: string;
    name: string;
    /** What the app reads: Mihomo (Clash) YAML, sing-box JSON, share links or its own node list. */
    core: "Mihomo" | "sing-box" | "分享链接" | "节点列表" | "配置文件";
    platforms: Platform[];
    importUrl: (links: SubscriptionLinks, name: string) => string;
    /** A second link that adds the panel's rules, for apps that import them apart from the nodes. */
    rulesUrl?: (links: SubscriptionLinks) => string;
};

const enc = encodeURIComponent;
/** UTF-8 safe base64 (btoa alone rejects non-Latin-1 text). */
const base64 = (text: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const clash = ({ url }: SubscriptionLinks) =>
    `clash://install-config?url=${enc(url)}`;

export const CLIENTS: Client[] = [
    {
        id: "verge",
        name: "Clash Verge Rev",
        core: "Mihomo",
        platforms: ["windows", "mac", "linux"],
        importUrl: clash,
    },
    {
        id: "cmfa",
        name: "Clash Meta",
        core: "Mihomo",
        platforms: ["android"],
        importUrl: clash,
    },
    {
        id: "flclash",
        name: "FlClash",
        core: "Mihomo",
        platforms: ["android", "windows", "mac", "linux"],
        importUrl: clash,
    },
    {
        id: "stash",
        name: "Stash",
        core: "Mihomo",
        platforms: ["ios", "mac"],
        importUrl: ({ url }) => `stash://install-config?url=${enc(url)}`,
    },
    {
        id: "hiddify",
        name: "Hiddify",
        core: "sing-box",
        platforms: ["ios", "android", "windows", "mac", "linux"],
        importUrl: ({ url }) => `hiddify://import/${url}`,
    },
    {
        id: "singbox",
        name: "sing-box",
        core: "sing-box",
        platforms: ["ios", "android", "mac"],
        importUrl: ({ url }, name) =>
            `sing-box://import-remote-profile?url=${enc(url)}#${enc(name)}`,
    },
    {
        id: "karing",
        name: "Karing",
        core: "sing-box",
        platforms: ["ios", "android", "windows", "mac"],
        importUrl: ({ url }, name) =>
            `karing://install-config?url=${enc(url)}&name=${enc(name)}`,
    },
    {
        id: "shadowrocket",
        name: "Shadowrocket",
        core: "分享链接",
        // Paid. On a Mac it runs as the iPad app (Apple silicon only).
        platforms: ["ios", "mac"],
        importUrl: ({ url }, name) =>
            `shadowrocket://add/sub://${base64(url)}?remark=${enc(name)}`,
        // Shadowrocket's configuration file cannot reference a subscription,
        // so the rules come as a second import.
        rulesUrl: (links) => links.imports.shadowrocketRules,
    },
    {
        id: "quantumultx",
        name: "Quantumult X",
        core: "节点列表",
        // Paid; on a Mac it runs as the iPad app (Apple silicon only).
        platforms: ["ios", "mac"],
        // add-resource (crossutility/Quantumult-X url-scheme.md) adds the node
        // subscription and the panel's filter_remote rules, keeping the user's
        // other resources; the API builds it from the rule template.
        importUrl: (links) => links.imports.quantumultx,
    },
    {
        id: "loon",
        name: "Loon",
        core: "配置文件",
        // Paid; on a Mac it runs as the iPad app (Apple silicon only).
        platforms: ["ios", "mac"],
        // import?sub= installs the panel's Loon configuration, whose
        // [Remote Proxy] pulls the node list (Loon manual, docs/cn/scheme.md).
        importUrl: (links) => links.imports.loon,
    },
];

/** The free, cross-platform default offered first on each platform. */
const RECOMMENDED: Record<Platform, string> = {
    ios: "hiddify",
    android: "cmfa",
    windows: "verge",
    mac: "verge",
    linux: "verge",
};

export function recommendedClient(platform: Platform): Client {
    return CLIENTS.find((client) => client.id === RECOMMENDED[platform])!;
}

export function clientsFor(platform: Platform): Client[] {
    return CLIENTS.filter((client) => client.platforms.includes(platform));
}

/** Best guess from the browser; iPadOS reports itself as a Mac with touch. */
export function detectPlatform(
    userAgent: string,
    maxTouchPoints = 0,
): Platform {
    if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
    if (/Android/.test(userAgent)) return "android";
    if (/Macintosh|Mac OS X/.test(userAgent))
        return maxTouchPoints > 1 ? "ios" : "mac";
    if (/Windows/.test(userAgent)) return "windows";
    if (/Linux|X11/.test(userAgent)) return "linux";
    return "windows";
}
