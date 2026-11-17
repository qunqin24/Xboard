import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Injectable,
    Module,
    OnModuleDestroy,
    OnModuleInit,
    Post,
    ServiceUnavailableException,
    UseGuards,
} from "@nestjs/common";
import {
    IsEmail,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from "class-validator";
import { Throttle } from "@nestjs/throttler";
import { User } from "@prisma/client";
import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { PrismaService } from "../../database/prisma.service";
import { json } from "../../common/json";
import { getConfig } from "../../config";
import { AuthModule } from "../auth/auth.module";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { hashPassword, normalizeEmail, verifyPassword } from "../auth/password";
import { sessionDigest } from "../auth/auth.service";

class PasswordInput {
    @IsString() @MinLength(1) @MaxLength(256) oldPassword!: string;
    @IsString() @MinLength(12) @MaxLength(128) password!: string;
}
class EmailInput {
    @IsEmail() @MaxLength(64) email!: string;
}
class TokenInput {
    @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
}
class RecoverInput extends TokenInput {
    @IsString() @MinLength(12) @MaxLength(128) password!: string;
}

@Injectable()
export class MailService implements OnModuleInit, OnModuleDestroy {
    private timer?: ReturnType<typeof setInterval>;
    private busy = false;
    constructor(private readonly db: PrismaService) {}
    onModuleInit() {
        if (process.env.SMTP_HOST && getConfig().environment !== "test") {
            this.timer = setInterval(() => {
                void this.flush();
            }, 5000);
            this.timer.unref();
        }
    }
    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }
    async flush() {
        if (this.busy) return;
        this.busy = true;
        const transport = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT ?? 587),
            secure: process.env.SMTP_SECURE === "true",
            auth: process.env.SMTP_USER
                ? {
                      user: process.env.SMTP_USER,
                      pass: process.env.SMTP_PASSWORD,
                  }
                : undefined,
            connectionTimeout: 10000,
            socketTimeout: 15000,
        });
        try {
            // Claim one mail across instances. Failed jobs retry with exponential backoff.
            const jobs = await this.db.$transaction(async (tx) => {
                const rows = await tx.$queryRaw<Array<{ id: number }>>`
                    SELECT id FROM "Mail" WHERE "sentAt" IS NULL AND attempts < 5
                    AND "nextAttempt" <= NOW() ORDER BY id LIMIT 5 FOR UPDATE SKIP LOCKED`;
                const jobs = [];
                for (const row of rows)
                    jobs.push(
                        await tx.mail.update({
                            where: { id: row.id },
                            data: {
                                attempts: { increment: 1 },
                                nextAttempt: new Date(Date.now() + 120000),
                            },
                        }),
                    );
                return jobs;
            });
            for (const mail of jobs) {
                try {
                    await transport.sendMail({
                        from:
                            process.env.MAIL_FROM ??
                            "Xboard <noreply@example.test>",
                        to: mail.to,
                        subject: mail.subject,
                        text: mail.text,
                        messageId: `<xboard-${mail.id}@${new URL(getConfig().origin).hostname}>`,
                    });
                    await this.db.mail.update({
                        where: { id: mail.id },
                        data: { sentAt: new Date(), text: "" },
                    });
                } catch {
                    await this.db.mail.update({
                        where: { id: mail.id },
                        data: {
                            nextAttempt: new Date(
                                Date.now() + 60000 * 2 ** mail.attempts,
                            ),
                        },
                    });
                }
            }
        } catch {
            /* A database interruption is retried on the next worker tick. */
        } finally {
            transport.close();
            this.busy = false;
        }
    }
}

@Controller()
class AccountController {
    constructor(private readonly db: PrismaService) {}
    private requireMail() {
        if (!process.env.SMTP_HOST)
            throw new ServiceUnavailableException(
                "邮件服务尚未配置，请联系管理员。",
            );
    }
    private async issue(user: User, purpose: "verify" | "reset") {
        const token = randomBytes(32).toString("base64url");
        const link = `${getConfig().origin}/recover#${purpose}:${token}`;
        await this.db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
            await tx.emailToken.deleteMany({
                where: { userId: user.id, purpose },
            });
            await tx.emailToken.create({
                data: {
                    hash: sessionDigest(token),
                    userId: user.id,
                    purpose,
                    expiresAt: new Date(Date.now() + 30 * 60000),
                },
            });
            await tx.mail.create({
                data: {
                    to: user.email,
                    subject:
                        purpose === "verify" ? "验证你的邮箱" : "重置账户密码",
                    text: `请在 30 分钟内打开链接：\n${link}\n若非本人操作，请忽略此邮件。`,
                },
            });
        });
    }

    @Post("auth/forgot")
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    async forgot(@Body() input: EmailInput) {
        this.requireMail();
        const user = await this.db.user.findUnique({
            where: { email: normalizeEmail(input.email) },
        });
        if (user && !user.banned) await this.issue(user, "reset");
        return { ok: true, message: "如果账户存在，重置邮件将发送到该邮箱。" };
    }

    @Post("account/verify-email")
    @UseGuards(SessionGuard)
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    async requestVerification(@CurrentUser() user: User) {
        this.requireMail();
        if (!user.verifiedAt) await this.issue(user, "verify");
        return { ok: true };
    }

    private async consume(token: string, purpose: string, password?: string) {
        const encoded = password ? await hashPassword(password) : undefined;
        await this.db.$transaction(async (tx) => {
            const hash = sessionDigest(token);
            const record = await tx.emailToken.findUnique({ where: { hash } });
            if (
                !record ||
                record.purpose !== purpose ||
                record.expiresAt <= new Date()
            )
                throw new BadRequestException("链接无效或已过期。");
            await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${record.userId} FOR UPDATE`;
            const consumed = await tx.emailToken.deleteMany({
                where: { hash, expiresAt: { gt: new Date() } },
            });
            if (consumed.count !== 1)
                throw new BadRequestException("链接已使用。");
            await tx.user.update({
                where: { id: record.userId },
                data: encoded
                    ? { password: encoded }
                    : { verifiedAt: new Date() },
            });
            if (encoded) {
                await tx.session.deleteMany({
                    where: { userId: record.userId },
                });
                await tx.emailToken.deleteMany({
                    where: { userId: record.userId },
                });
            }
        });
        return { ok: true };
    }
    @Post("auth/reset") reset(@Body() input: RecoverInput) {
        return this.consume(input.token, "reset", input.password);
    }
    @Post("auth/verify") verify(@Body() input: TokenInput) {
        return this.consume(input.token, "verify");
    }

    @Post("account/password")
    @UseGuards(SessionGuard)
    async changePassword(
        @CurrentUser() user: User,
        @Body() input: PasswordInput,
    ) {
        if (!(await verifyPassword(input.oldPassword, user.password)))
            throw new BadRequestException("原密码不正确。");
        const password = await hashPassword(input.password);
        await this.db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
            const result = await tx.user.updateMany({
                where: { id: user.id, password: user.password },
                data: { password },
            });
            if (result.count !== 1)
                throw new BadRequestException("密码已改变，请重新登录。");
            await tx.session.deleteMany({ where: { userId: user.id } });
            await tx.emailToken.deleteMany({ where: { userId: user.id } });
        });
        return { ok: true };
    }

    @Get("account/ledger")
    @UseGuards(SessionGuard)
    async ledger(@CurrentUser() user: User) {
        return json(
            await this.db.balanceEntry.findMany({
                where: { userId: user.id },
                take: 100,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    amountMinor: true,
                    reason: true,
                    orderId: true,
                    createdAt: true,
                },
            }),
        );
    }

    @Get("account/traffic")
    @UseGuards(SessionGuard)
    async traffic(@CurrentUser() user: User) {
        return json(
            await this.db.trafficRecord.findMany({
                where: { userId: user.id },
                take: 100,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    upload: true,
                    download: true,
                    createdAt: true,
                    node: { select: { name: true } },
                },
            }),
        );
    }
}

@Module({
    imports: [AuthModule],
    controllers: [AccountController],
    providers: [MailService],
})
export class AccountModule {}
