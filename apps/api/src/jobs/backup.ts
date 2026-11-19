import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { copyFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import type { BackupRun as BackupRunRow } from "@prisma/client";
import { backupRunSchema } from "@xboard/contracts";
import { getConfig } from "../config";
import { db, type Tx } from "../db";
import { badRequest } from "../http/errors";
import { reportJobFailure } from "../logging";
import { secretPath } from "../modules/system/secrets";
import {
    getSettingSecret,
    readOperationalGroup,
} from "../modules/system/settings";

const run = promisify(execFile);
const timeout = 10 * 60_000;
const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});
const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});
const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
});

export function backupView(row: BackupRunRow) {
    return backupRunSchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
        bytes: row.bytes?.toString() ?? null,
    });
}

async function storage(tx: Tx = db) {
    const settings = await readOperationalGroup("backup", tx);
    const secretAccessKey = await getSettingSecret("backupSecretAccessKey", tx);
    if (
        !settings.backupBucket ||
        !settings.backupAccessKeyId ||
        !secretAccessKey
    )
        throw badRequest("请先配置备份存储桶及访问密钥。");
    const r2 = settings.backupStorage === "r2";
    if (r2 && !/^[a-f0-9]{32}$/i.test(settings.backupR2AccountId))
        throw badRequest("Cloudflare 账户 ID 格式不正确。");
    if (!r2 && !settings.backupS3Region) throw badRequest("请输入 S3 区域。");
    const domain =
        settings.backupR2Jurisdiction === "eu"
            ? "eu.r2.cloudflarestorage.com"
            : "r2.cloudflarestorage.com";
    const endpoint = r2
        ? `https://${settings.backupR2AccountId}.${domain}`
        : settings.backupS3Endpoint;
    if (endpoint) {
        const parsed = URL.parse(endpoint);
        if (
            !parsed ||
            !["http:", "https:"].includes(parsed.protocol) ||
            parsed.username ||
            parsed.password ||
            parsed.hash ||
            parsed.search
        )
            throw badRequest("S3 地址须为有效的 HTTP 或 HTTPS 地址。");
    }
    const client = new S3Client({
        endpoint: endpoint || undefined,
        region: r2 ? "auto" : settings.backupS3Region,
        credentials: {
            accessKeyId: settings.backupAccessKeyId,
            secretAccessKey,
        },
        forcePathStyle: r2 || settings.backupS3ForcePathStyle,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
    });
    return {
        settings,
        client,
        bucket: settings.backupBucket,
        prefix: settings.backupPrefix.replace(/^\/+|\/+$/g, ""),
    };
}

type Storage = Awaited<ReturnType<typeof storage>>;
const objectKey = (prefix: string, path: string) =>
    prefix ? `${prefix}/${path}` : path;

export async function testBackupStorage() {
    const { client, bucket, prefix } = await storage();
    try {
        const key = objectKey(prefix, `xboard-test/${randomUUID()}`);
        const expected = randomBytes(32);
        const options = { abortSignal: AbortSignal.timeout(15_000) };
        await client.send(
            new PutObjectCommand({ Bucket: bucket, Key: key, Body: expected }),
            options,
        );
        const response = await client.send(
            new GetObjectCommand({ Bucket: bucket, Key: key }),
            options,
        );
        const received = await response.Body?.transformToByteArray();
        if (!received || !expected.equals(Buffer.from(received)))
            throw badRequest("备份测试文件校验失败。");
    } finally {
        client.destroy();
    }
}

function dumpTarget() {
    const url = new URL(getConfig().databaseUrl);
    const password = decodeURIComponent(url.password);
    const schema = url.searchParams.get("schema");
    url.password = "";
    for (const param of [
        "schema",
        "connection_limit",
        "pool_timeout",
        "pgbouncer",
        "socket_timeout",
        "statement_cache_size",
        "sslaccept",
    ])
        url.searchParams.delete(param);
    return { url: url.toString(), password, schema };
}

async function writeBackup(connection: Storage, now: Date, runId: string) {
    const recipient = connection.settings.backupAgeRecipient;
    if (!/^age1[023456789ac-hj-np-z]{58}$/.test(recipient))
        throw badRequest("请填写有效的 age 公钥。");
    const folder = await mkdtemp(join(tmpdir(), "xboard-backup-"));
    try {
        const target = dumpTarget();
        await run(
            "pg_dump",
            [
                "--format=custom",
                "--no-password",
                `--file=${join(folder, "database.dump")}`,
                `--dbname=${target.url}`,
                ...(target.schema ? [`--schema=${target.schema}`] : []),
                // The run being taken is already recorded as "running"; a
                // restored copy of that row would look like a stalled backup.
                '--exclude-table-data=*."BackupRun"',
            ],
            {
                env: { ...process.env, PGPASSWORD: target.password },
                timeout,
            },
        );
        await copyFile(secretPath("app.key"), join(folder, "app.key"));
        await run(
            "tar",
            [
                "-C",
                folder,
                "-cf",
                join(folder, "bundle.tar"),
                "database.dump",
                "app.key",
            ],
            { timeout },
        );
        const file = join(folder, "backup.tar.age");
        await run(
            "age",
            [
                "--recipient",
                recipient,
                "--output",
                file,
                join(folder, "bundle.tar"),
            ],
            { timeout },
        );
        const bytes = (await stat(file)).size;
        const stamp = `${now.toISOString().replaceAll(":", "-")}-${runId}.tar.age`;
        const prefixes = ["daily"];
        if (weekday.format(now) === "Sun") prefixes.push("weekly");
        if (
            day.formatToParts(now).find((part) => part.type === "day")
                ?.value === "01"
        )
            prefixes.push("monthly");
        const objects = prefixes.map((period) =>
            objectKey(connection.prefix, `${period}/${stamp}`),
        );
        for (const object of objects) {
            const body = createReadStream(file);
            try {
                await connection.client.send(
                    new PutObjectCommand({
                        Bucket: connection.bucket,
                        Key: object,
                        Body: body,
                        ContentLength: bytes,
                        ContentType: "application/octet-stream",
                    }),
                    { abortSignal: AbortSignal.timeout(timeout) },
                );
            } finally {
                body.destroy();
            }
        }
        return { bytes: BigInt(bytes), objects };
    } finally {
        await rm(folder, { force: true, recursive: true });
    }
}

/** A run still "running" after this long died with its process (OOM, restart). */
const STALE_RUN_MS = 90 * 60_000;

/**
 * Claim at most one run in a short transaction: the oldest manual request,
 * or today's scheduled backup once its time has come. Only one run is ever
 * "running", which keeps replicas from backing up twice.
 */
async function claimBackup(now: Date) {
    return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('xboard:backup'))::text`;
        const stale = await tx.backupRun.findMany({
            where: {
                status: "running",
                startedAt: { lt: new Date(now.getTime() - STALE_RUN_MS) },
            },
            select: { id: true },
        });
        for (const { id } of stale) {
            await tx.backupRun.update({
                where: { id },
                data: { status: "failed", finishedAt: now },
            });
            reportJobFailure(
                "database backup",
                new Error("Backup run stopped"),
                { backupId: id },
            );
        }
        if (await tx.backupRun.findFirst({ where: { status: "running" } }))
            return null;
        const pending = await tx.backupRun.findFirst({
            where: { status: "pending" },
            orderBy: { createdAt: "asc" },
        });
        if (pending)
            return tx.backupRun.update({
                where: { id: pending.id },
                data: { status: "running", startedAt: now },
            });
        const settings = await readOperationalGroup("backup", tx);
        const scheduledDay = day.format(now);
        if (
            !settings.backupEnabled ||
            time.format(now) < settings.backupTime ||
            // One scheduled attempt per day: a failure alerts and waits for an
            // admin rather than uploading again every minute.
            (await tx.backupRun.findUnique({ where: { scheduledDay } }))
        )
            return null;
        return tx.backupRun.create({
            data: { scheduledDay, status: "running", startedAt: now },
        });
    });
}

/**
 * The dump and uploads run outside any transaction, so a slow upload cannot
 * outlive a transaction timeout and lose the run's record.
 */
export async function runBackup(now = new Date()) {
    let job: Awaited<ReturnType<typeof claimBackup>>;
    try {
        job = await claimBackup(now);
    } catch (error) {
        reportJobFailure("database backup", error);
        return;
    }
    if (!job) return;
    try {
        const connection = await storage();
        let result: Awaited<ReturnType<typeof writeBackup>>;
        try {
            result = await writeBackup(connection, now, job.id);
        } finally {
            connection.client.destroy();
        }
        await db.backupRun.update({
            where: { id: job.id },
            data: { ...result, status: "completed", finishedAt: new Date() },
        });
    } catch (error) {
        reportJobFailure("database backup", error, { backupId: job.id });
        await db.backupRun
            .update({
                where: { id: job.id },
                data: { status: "failed", finishedAt: new Date() },
            })
            .catch((failure: unknown) =>
                reportJobFailure("database backup", failure, {
                    backupId: job.id,
                }),
            );
    }
}
