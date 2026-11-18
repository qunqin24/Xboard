import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { CircleCheck, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCommand } from "@/api/panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/password-input";
import { AuthLayout } from "../auth-layout";

const resetSchema = z.object({
    password: z
        .string()
        .min(12, "密码至少 12 个字符")
        .max(128, "密码最多 128 个字符"),
});

/**
 * Landing page for email links: `/recover#verify:<token>` and `/recover#reset:<token>`.
 * Tokens travel in the fragment so they never reach server logs; the fragment
 * is removed from the address bar as soon as it has been read.
 */
export function Recover() {
    const [fragment] = useState(() => location.hash.slice(1));
    useEffect(() => {
        history.replaceState(null, "", location.pathname);
    }, []);
    const [purpose, token] = fragment.split(":");
    const action = useCommand();
    const [done, setDone] = useState("");
    const form = useForm<z.infer<typeof resetSchema>>({
        resolver: zodResolver(resetSchema),
        defaultValues: { password: "" },
    });

    const verifying = purpose === "verify" && token;
    const resetting = purpose === "reset" && token;

    return (
        <AuthLayout>
            <Card className="w-full gap-group">
                <CardHeader>
                    <CardTitle>
                        {done
                            ? verifying
                                ? "邮箱已验证"
                                : "密码已重置"
                            : verifying
                              ? "验证邮箱"
                              : resetting
                                ? "设置新密码"
                                : "链接无效"}
                    </CardTitle>
                    {done || verifying ? null : (
                        <CardDescription>
                            {resetting
                                ? "重置后，所有设备将退出登录。"
                                : "链接无效或已使用。"}
                        </CardDescription>
                    )}
                </CardHeader>
                <CardContent className="grid gap-group">
                    {done ? (
                        <>
                            <Alert variant="success">
                                <CircleCheck />
                                <AlertDescription>{done}</AlertDescription>
                            </Alert>
                            <Button asChild>
                                <Link to="/sign-in">前往登录</Link>
                            </Button>
                        </>
                    ) : verifying ? (
                        <Button
                            disabled={action.isPending}
                            onClick={() =>
                                action.mutate(
                                    { path: "/auth/verify", body: { token } },
                                    {
                                        onSuccess: () =>
                                            setDone("邮箱已验证，可前往登录。"),
                                    },
                                )
                            }
                        >
                            {action.isPending ? (
                                <Loader2 className="animate-spin" />
                            ) : null}
                            确认验证
                        </Button>
                    ) : resetting ? (
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(({ password }) =>
                                    action.mutate(
                                        {
                                            path: "/auth/reset",
                                            body: { token, password },
                                        },
                                        {
                                            onSuccess: () =>
                                                setDone(
                                                    "密码已重置，请使用新密码登录。",
                                                ),
                                        },
                                    ),
                                )}
                                className="space-y-group"
                            >
                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>新密码</FormLabel>
                                            <FormControl>
                                                <PasswordInput
                                                    autoComplete="new-password"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button disabled={action.isPending}>
                                    {action.isPending ? (
                                        <Loader2 className="animate-spin" />
                                    ) : null}
                                    重置密码
                                </Button>
                            </form>
                        </Form>
                    ) : purpose === "reset" ? (
                        <Button asChild variant="outline">
                            <Link to="/forgot-password">重新申请重置</Link>
                        </Button>
                    ) : (
                        <Button asChild variant="outline">
                            <Link to="/sign-in">前往登录</Link>
                        </Button>
                    )}
                </CardContent>
            </Card>
        </AuthLayout>
    );
}
