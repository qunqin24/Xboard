import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { VersionInfo } from "@xboard/contracts";
import { appDirectory } from "../../config";
import { errorFields, log } from "../../logging";

/** Releases are looked up here unless APP_UPDATE_REPO says otherwise. */
const DEFAULT_REPO = "qunqin24/Xboard";
const CACHE_MS = 60 * 60_000;
const RETRY_MS = 10 * 60_000;

const packageVersion = (() => {
    try {
        const pkg = JSON.parse(
            readFileSync(join(appDirectory, "package.json"), "utf8"),
        ) as { version?: string };
        return pkg.version ?? "0.0.0";
    } catch {
        return "0.0.0";
    }
})();

/**
 * The version this process runs: the image sets APP_VERSION from the release
 * tag ("1.2.3") or "edge" for main; a checkout falls back to package.json.
 */
export function currentVersion() {
    return {
        current: process.env.APP_VERSION?.trim() || packageVersion,
        commit: process.env.APP_COMMIT?.trim().slice(0, 12) || null,
    };
}

/** owner/name, or null when the operator turned the check off. */
function updateRepo(): string | null {
    const repo = (process.env.APP_UPDATE_REPO ?? DEFAULT_REPO).trim();
    return /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : null;
}

type Semver = { core: [number, number, number]; pre: string | null };

function parseSemver(text: string): Semver | null {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(
        text.trim(),
    );
    if (!match) return null;
    return {
        core: [Number(match[1]), Number(match[2]), Number(match[3])],
        pre: match[4] ?? null,
    };
}

/** True when `latest` is newer; null when either side is not a version. */
export function isNewer(latest: string, current: string): boolean | null {
    const a = parseSemver(latest);
    const b = parseSemver(current);
    if (!a || !b) return null;
    for (let i = 0; i < 3; i++)
        if (a.core[i] !== b.core[i]) return a.core[i]! > b.core[i]!;
    // 1.2.3 is newer than 1.2.3-rc.1; GitHub's "latest" is never a pre-release.
    return b.pre !== null && a.pre === null;
}

const releaseSchema = z.object({
    tag_name: z.string(),
    html_url: z.string().url(),
    published_at: z.string(),
});

type Check = Pick<VersionInfo, "latest" | "checkedAt" | "error">;
let cache: { repo: string; until: number; check: Check } | null = null;

async function fetchLatest(repo: string): Promise<Check> {
    const checkedAt = new Date().toISOString();
    try {
        const response = await fetch(
            `https://api.github.com/repos/${repo}/releases/latest`,
            {
                headers: {
                    accept: "application/vnd.github+json",
                    "user-agent": "xboard-update-check",
                    "x-github-api-version": "2022-11-28",
                },
                signal: AbortSignal.timeout(10_000),
            },
        );
        if (response.status === 404)
            return { latest: null, checkedAt, error: null };
        if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
        const release = releaseSchema.parse(await response.json());
        return {
            latest: {
                version: release.tag_name.replace(/^v/, ""),
                url: release.html_url,
                publishedAt: release.published_at,
            },
            checkedAt,
            error: null,
        };
    } catch (error) {
        log("warn", "version.check_failed", { error: errorFields(error) });
        return {
            latest: null,
            checkedAt,
            error: "无法连接 GitHub 检查更新，请稍后重试。",
        };
    }
}

/** The running version plus the newest release, cached for an hour. */
export async function versionInfo(refresh = false): Promise<VersionInfo> {
    const { current, commit } = currentVersion();
    const repo = updateRepo();
    if (!repo)
        return {
            current,
            commit,
            checkEnabled: false,
            latest: null,
            updateAvailable: null,
            checkedAt: null,
            error: null,
        };
    if (refresh || !cache || cache.repo !== repo || cache.until <= Date.now()) {
        const check = await fetchLatest(repo);
        cache = {
            repo,
            until: Date.now() + (check.error ? RETRY_MS : CACHE_MS),
            check,
        };
    }
    const { latest } = cache.check;
    return {
        current,
        commit,
        checkEnabled: true,
        ...cache.check,
        updateAvailable: latest
            ? isNewer(latest.version, current)
            : cache.check.error
              ? null
              : false,
    };
}

/** For tests: forget the cached release. */
export function resetVersionCache() {
    cache = null;
}
