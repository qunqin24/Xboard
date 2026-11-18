import { z } from "zod";

// Default zod messages (e.g. "expected string") in Chinese, for API and UI alike.
z.config(z.locales.zhCN());

export * from "./common";
export * from "./auth";
export * from "./plans";
export * from "./account";
export * from "./orders";
export * from "./support";
export * from "./site";
export * from "./admin";
export * from "./nodes";
export * from "./templates";
export * from "./operations";
export * from "./promotions";
export * from "./security";
export * from "./endpoints";
export { buildOpenApi } from "./openapi";
