import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import {
    ApiCookieAuth,
    ApiCreatedResponse,
    ApiOkResponse,
    ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
    AuthService,
    SESSION_COOKIE,
    SESSION_TTL_SECONDS,
} from "./auth.service";
import { LoginDto, LoginResultDto, RegisterDto } from "./auth.dto";
import { getConfig } from "../../config";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
    constructor(private readonly auth: AuthService) {}

    @Post("register")
    @Throttle({ default: { limit: 3, ttl: 60_000 } })
    @ApiCreatedResponse({ type: LoginResultDto })
    register(@Body() body: RegisterDto) {
        return this.auth.register(body.email, body.password);
    }

    @Post("login")
    @HttpCode(200)
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    @ApiOkResponse({ type: LoginResultDto })
    async login(
        @Body() body: LoginDto,
        @Res({ passthrough: true }) reply: FastifyReply,
    ) {
        const result = await this.auth.login(body.email, body.password);
        reply.setCookie(SESSION_COOKIE, result.token, {
            httpOnly: true,
            sameSite: "lax",
            secure: getConfig().production,
            path: "/api",
            maxAge: SESSION_TTL_SECONDS,
        });
        return { email: result.email };
    }

    @Post("logout")
    @HttpCode(204)
    @ApiCookieAuth()
    async logout(
        @Req() request: FastifyRequest,
        @Res({ passthrough: true }) reply: FastifyReply,
    ) {
        await this.auth.logout(request.cookies[SESSION_COOKIE]);
        reply.clearCookie(SESSION_COOKIE, {
            path: "/api",
            httpOnly: true,
            sameSite: "lax",
        });
    }
}
