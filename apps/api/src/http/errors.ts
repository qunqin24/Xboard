import type { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { errorFields } from "../logging";

/** Throw from any route or service; the error handler turns it into JSON. */
export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly code?: string,
    ) {
        super(message);
    }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = (message: string) => new HttpError(401, message);
export const forbidden = (message: string) => new HttpError(403, message);
export const notFound = (message = "记录不存在。") =>
    new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);

export function errorBody(status: number, message: string, code?: string) {
    return { error: { status, message, ...(code && { code }) } };
}

export const notFoundHandler: RequestHandler = (_req, res) => {
    res.status(404).json(errorBody(404, "接口不存在。"));
};

/** Every error leaves as `{ error: { status, message } }`; only 5xx are logged. */
export const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    _next,
) => {
    const { status, message } = describeHttpError(error);
    if (status >= 500) res.locals.requestError = errorFields(error);
    if (res.headersSent) {
        res.destroy();
        return;
    }
    res.status(status).json(
        errorBody(
            status,
            message,
            error instanceof HttpError ? error.code : undefined,
        ),
    );
};

export function describeHttpError(error: unknown): {
    status: number;
    message: string;
} {
    if (error instanceof HttpError)
        return { status: error.status, message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025")
            return { status: 404, message: "记录不存在。" };
        if (error.code === "P2002" || error.code === "P2003")
            return { status: 409, message: "记录已存在或关联数据不正确。" };
    }
    // body-parser marks its own errors with an HTTP status and a type.
    const parser = (error ?? {}) as { type?: string };
    if (parser.type === "entity.parse.failed")
        return { status: 400, message: "请求体不是有效的 JSON。" };
    if (parser.type === "entity.too.large")
        return { status: 413, message: "请求体过大。" };
    if (
        parser.type?.startsWith("encoding.") ||
        parser.type === "charset.unsupported"
    )
        return { status: 415, message: "不支持的请求编码。" };
    return { status: 500, message: "服务暂时不可用，请稍后重试。" };
}
