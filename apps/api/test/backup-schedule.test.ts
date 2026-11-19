import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { db } from "../src/db";
import { runBackup } from "../src/jobs/backup";
import { startTestApp } from "./helpers";

/** Scheduling and bookkeeping only; backup.test.ts covers the dump itself. */
describe("backup scheduling", () => {
    let test: Awaited<ReturnType<typeof startTestApp>>;
    before(async () => {
        test = await startTestApp();
        // Enabled from midnight, but without storage, so every run fails fast.
        await db.setting.createMany({
            data: [
                { key: "backupEnabled", value: true },
                { key: "backupTime", value: "00:00" },
            ],
        });
    });
    after(async () => test?.stop());

    it("records a failed scheduled run and does not retry it the same day", async () => {
        const now = new Date("2026-11-19T04:00:00Z");
        await Promise.all([runBackup(now), runBackup(now)]);
        const runs = await db.backupRun.findMany();
        assert.equal(runs.length, 1);
        assert.equal(runs[0]?.status, "failed");
        assert.equal(runs[0]?.scheduledDay, "2026-11-19");
        assert.ok(runs[0]?.startedAt && runs[0]?.finishedAt);
        await runBackup(new Date(now.getTime() + 60_000));
        assert.equal(await db.backupRun.count(), 1);
        await runBackup(new Date("2026-11-20T04:00:00Z"));
        assert.equal(await db.backupRun.count(), 2);
    });

    it("lets a running backup finish before the next one and fails a stale run", async () => {
        await db.backupRun.deleteMany();
        const now = new Date("2026-11-21T04:00:00Z");
        const running = await db.backupRun.create({
            data: { status: "running", startedAt: now },
        });
        const queued = await db.backupRun.create({ data: {} });
        await runBackup(new Date(now.getTime() + 60_000));
        assert.equal(
            (await db.backupRun.findUniqueOrThrow({ where: { id: queued.id } }))
                .status,
            "pending",
        );
        assert.equal(await db.backupRun.count(), 2);
        // After 90 minutes the running row is presumed dead (OOM, restart).
        await runBackup(new Date(now.getTime() + 91 * 60_000));
        assert.equal(
            (
                await db.backupRun.findUniqueOrThrow({
                    where: { id: running.id },
                })
            ).status,
            "failed",
        );
        assert.equal(
            (await db.backupRun.findUniqueOrThrow({ where: { id: queued.id } }))
                .status,
            "failed",
        );
    });
});
