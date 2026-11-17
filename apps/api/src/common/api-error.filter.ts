import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    Logger,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { Prisma } from "@prisma/client";

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
    private readonly logger = new Logger(ApiErrorFilter.name);

    catch(error: unknown, host: ArgumentsHost) {
        const reply = host.switchToHttp().getResponse<FastifyReply>();
        const databaseCode =
            error instanceof Prisma.PrismaClientKnownRequestError
                ? error.code
                : null;
        const status =
            error instanceof HttpException
                ? error.getStatus()
                : databaseCode === "P2025"
                  ? 404
                  : ["P2002", "P2003"].includes(databaseCode ?? "")
                    ? 409
                    : 500;
        const response =
            error instanceof HttpException ? error.getResponse() : null;
        const message =
            typeof response === "string"
                ? response
                : response &&
                    typeof response === "object" &&
                    "message" in response
                  ? response.message
                  : status === 404
                    ? "记录不存在。"
                    : status === 409
                      ? "记录已存在或关联数据不正确。"
                      : "服务暂时不可用，请稍后重试。";
        if (status >= 500) this.logger.error(error);
        reply.code(status).send({ error: { status, message } });
    }
}
