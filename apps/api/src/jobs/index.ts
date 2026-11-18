import { getConfig, getSmtpConfig } from "../config";
import { flushMail } from "./mail-queue";
import { runMaintenance } from "./maintenance";

/** Start the periodic workers; returns a function that stops them. */
export function startJobs(): () => void {
    if (getConfig().environment === "test") return () => {};
    const timers = [setInterval(() => void runMaintenance(), 60_000)];
    if (getSmtpConfig())
        timers.push(setInterval(() => void flushMail(), 5_000));
    for (const timer of timers) timer.unref();
    return () => timers.forEach(clearInterval);
}
