import type { z } from "zod";
import { badRequest } from "./errors";

/**
 * Parse request input with a zod schema; failures become a 400 listing every
 * problem, e.g. "password：密码至少 12 个字符".
 *
 *     const input = parse(loginBody, req.body);
 */
export function parse<T extends z.ZodType>(
    schema: T,
    value: unknown,
): z.output<T> {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    const messages = result.error.issues.map((issue) =>
        issue.path.length
            ? `${issue.path.join(".")}：${issue.message}`
            : issue.message,
    );
    throw badRequest([...new Set(messages)].join("；"));
}
