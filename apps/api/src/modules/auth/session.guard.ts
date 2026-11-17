import {
    CanActivate,
    ExecutionContext,
    Injectable,
    createParamDecorator,
} from "@nestjs/common";
import type { User } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { AuthService, SESSION_COOKIE } from "./auth.service";

type AuthenticatedRequest = FastifyRequest & { currentUser: User };

@Injectable()
export class SessionGuard implements CanActivate {
    constructor(private readonly auth: AuthService) {}

    async canActivate(context: ExecutionContext) {
        const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
        request.currentUser = await this.auth.authenticate(
            request.cookies[SESSION_COOKIE],
        );
        return true;
    }
}

export const CurrentUser = createParamDecorator(
    (_data: unknown, context: ExecutionContext): User => {
        return context.switchToHttp().getRequest<AuthenticatedRequest>()
            .currentUser;
    },
);
