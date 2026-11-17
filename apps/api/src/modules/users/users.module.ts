import { Controller, Get, Module, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { User } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AuthModule } from "../auth/auth.module";
import { CurrentUser, SessionGuard } from "../auth/session.guard";
import { toPlanDto } from "../plans/plan.mapper";
import { AccountDto } from "./account.dto";

@ApiTags("account")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("account")
class UsersController {
    constructor(private readonly prisma: PrismaService) {}

    @Get()
    @ApiOkResponse({ type: AccountDto })
    async account(@CurrentUser() user: User): Promise<AccountDto> {
        const plan =
            user.planId === null
                ? null
                : await this.prisma.plan.findUnique({
                      where: { id: user.planId },
                      include: { prices: { orderBy: { id: "asc" } } },
                  });
        // Explicit allowlist: no password, session, UUID or subscription token in responses.
        return {
            email: user.email,
            role: user.role,
            emailVerified: user.verifiedAt !== null,
            balanceMinor: user.balance,
            speedLimitMbps: user.speedLimit,
            deviceLimit: user.deviceLimit,
            uploadBytes: user.upload.toString(),
            downloadBytes: user.download.toString(),
            transferBytes: user.transferEnable.toString(),
            expiredAt: user.expiredAt,
            plan: plan ? toPlanDto(plan) : null,
        };
    }
}

@Module({ imports: [AuthModule], controllers: [UsersController] })
export class UsersModule {}
