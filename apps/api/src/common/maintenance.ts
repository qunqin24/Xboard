import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { getConfig } from "../config";

@Injectable()
export class Maintenance implements OnModuleInit, OnModuleDestroy {
    private timer?: ReturnType<typeof setInterval>;
    private busy = false;
    private readonly logger = new Logger(Maintenance.name);
    constructor(private readonly db: PrismaService) {}
    onModuleInit() {
        if (getConfig().environment === "test") return;
        this.timer = setInterval(() => {
            void this.clean();
        }, 60000);
        this.timer.unref();
    }
    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }
    async clean() {
        if (this.busy) return;
        this.busy = true;
        try {
            const now = new Date();
            await this.db.$transaction([
                this.db.order.updateMany({
                    where: { status: "pending", expiresAt: { lte: now } },
                    data: { status: "cancelled" },
                }),
                this.db.session.deleteMany({
                    where: { expiresAt: { lte: now } },
                }),
                this.db.emailToken.deleteMany({
                    where: { expiresAt: { lte: now } },
                }),
                this.db.onlineDevice.deleteMany({
                    where: { seenAt: { lt: new Date(Date.now() - 180000) } },
                }),
                this.db.rateLimit.deleteMany({
                    where: {
                        expiresAt: { lt: now },
                        OR: [
                            { blockedUntil: null },
                            { blockedUntil: { lt: now } },
                        ],
                    },
                }),
                this.db.mail.deleteMany({
                    where: {
                        createdAt: { lt: new Date(Date.now() - 7 * 86400000) },
                    },
                }),
                this.db.trafficReceipt.deleteMany({
                    where: {
                        createdAt: { lt: new Date(Date.now() - 30 * 86400000) },
                    },
                }),
            ]);
        } catch {
            this.logger.warn("Maintenance failed; retrying on next tick.");
        } finally {
            this.busy = false;
        }
    }
}
