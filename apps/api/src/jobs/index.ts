import { flushTelegram } from "../modules/telegram/service";
import { reportJobFailure } from "../logging";
import { getConfig } from "../config";
import { runBackup } from "./backup";
import { flushMail } from "./mail-queue";
import { runMaintenance } from "./maintenance";
import { checkOfflineNodes } from "./node-monitor";

/** Start the periodic workers; returns a function that stops them. */
export function startJobs(): () => void {
    if (getConfig().environment === "test") return () => {};
    const timers = [setInterval(() => void runMaintenance(), 60_000)];
    timers.push(
        setInterval(() => void flushMail(), 5_000),
        setInterval(
            () =>
                void flushTelegram().catch((error) =>
                    reportJobFailure("telegram notifications", error),
                ),
            5_000,
        ),
        setInterval(() => void runBackup(), 60_000),
        setInterval(() => void checkOfflineNodes(), 60_000),
    );
    for (const timer of timers) timer.unref();
    return () => timers.forEach(clearInterval);
}
