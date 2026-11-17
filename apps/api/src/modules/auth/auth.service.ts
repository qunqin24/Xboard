import {
    ConflictException,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { hashPassword, normalizeEmail, verifyPassword } from "./password";
import { SettingsService } from "../site/settings.service";

export const SESSION_COOKIE = "xboard_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;
// Missing identities perform the same password derivation as existing users.
const dummyHash = hashPassword(randomBytes(32).toString("hex"));

export function sessionDigest(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly settings: SettingsService,
    ) {}

    async register(email: string, password: string) {
        if (!(await this.settings.read()).registrationOpen)
            throw new ForbiddenException("暂未开放注册。");
        try {
            const user = await this.prisma.user.create({
                data: {
                    email: normalizeEmail(email),
                    password: await hashPassword(password),
                },
            });
            return { email: user.email };
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
            ) {
                throw new ConflictException(
                    "无法使用此邮箱注册，请登录或使用其他邮箱。",
                );
            }
            throw error;
        }
    }

    async login(email: string, password: string) {
        const user = await this.prisma.user.findUnique({
            where: { email: normalizeEmail(email) },
        });
        const verified = await verifyPassword(
            password,
            user?.password ?? (await dummyHash),
        );
        if (!user || !verified || user.banned) {
            throw new UnauthorizedException("邮箱或密码不正确，或账户不可用。");
        }
        const token = randomBytes(32).toString("base64url");
        await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
            const latest = await tx.user.findUniqueOrThrow({
                where: { id: user.id },
            });
            if (latest.banned || latest.password !== user.password)
                throw new UnauthorizedException("账户状态已变化，请重试。");
            await tx.session.deleteMany({
                where: { expiresAt: { lte: new Date() } },
            });
            await tx.session.create({
                data: {
                    id: sessionDigest(token),
                    userId: user.id,
                    expiresAt: new Date(
                        Date.now() + SESSION_TTL_SECONDS * 1000,
                    ),
                },
            });
            await tx.user.update({
                where: { id: user.id },
                data: { lastLoginAt: Math.floor(Date.now() / 1000) },
            });
        });
        return { token, email: user.email };
    }

    async authenticate(token: string | undefined) {
        if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
            throw new UnauthorizedException("请先登录。");
        const session = await this.prisma.session.findUnique({
            where: { id: sessionDigest(token) },
            include: { user: true },
        });
        if (
            !session ||
            session.expiresAt <= new Date() ||
            session.user.banned
        ) {
            throw new UnauthorizedException("登录已失效，请重新登录。");
        }
        return session.user;
    }

    async logout(token: string | undefined) {
        if (token) {
            await this.prisma.session.deleteMany({
                where: { id: sessionDigest(token) },
            });
        }
    }
}
