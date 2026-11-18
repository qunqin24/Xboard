import { ApiError } from "@/api/client";
import { toast } from "sonner";

/** Message to show for a failed request; API errors already carry Chinese text. */
export function serverErrorMessage(error: unknown): string {
    if (error instanceof ApiError) return error.message;
    if (error instanceof TypeError) return "无法连接服务器，请检查网络后重试。";
    if (error instanceof Error && error.message) return error.message;
    return "操作失败，请稍后重试。";
}

export function handleServerError(error: unknown) {
    if (import.meta.env.DEV) console.error(error);
    // A failure the user has to act on stays until it is closed.
    toast.error(serverErrorMessage(error), {
        duration: Infinity,
        closeButton: true,
    });
}
