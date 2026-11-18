import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ApiError } from "@/api/client";
import { Loader2, LogIn } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import { twoFactorCodeSchema } from "@xboard/contracts";
import { useLogin } from "@/api/hooks";
import { useSite } from "@/api/panel";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
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
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { handleServerError } from "@/lib/handle-server-error";
import { AuthLayout } from "../auth-layout";
import { safeRedirect } from "../redirect";

const formSchema = z.object({
    email: z
        .string()
        .trim()
        .min(1, "请输入邮箱")
        .max(64, "邮箱最多 64 个字符")
        .email("邮箱格式不正确"),
    password: z.string().min(1, "请输入密码").max(256, "密码最多 256 个字符"),
    twoFactorCode: z.string().optional(),
});

export function SignIn() {
    const { redirect } = useSearch({ from: "/(auth)/sign-in" });
    const navigate = useNavigate();
    const login = useLogin();
    const [needsFactor, setNeedsFactor] = useState(false);
    const site = useSite();
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: { email: "", password: "", twoFactorCode: "" },
    });

    const onSubmit = async (data: z.infer<typeof formSchema>) => {
        const { twoFactorCode, ...credentials } = data;
        const proof = needsFactor
            ? twoFactorCodeSchema.safeParse(twoFactorCode)
            : null;
        if (proof && !proof.success) {
            form.setError("twoFactorCode", {
                message: "请输入 6 位动态验证码或恢复码。",
            });
            return;
        }
        try {
            await login.mutateAsync({
                ...credentials,
                ...(proof?.success && { twoFactorCode: proof.data }),
            });
            await navigate({ to: safeRedirect(redirect), replace: true });
        } catch (error) {
            // A wrong password is a form error, not a toast.
            if (
                error instanceof ApiError &&
                (error.code === "two_factor_required" ||
                    error.code === "two_factor_invalid")
            ) {
                setNeedsFactor(true);
                if (error.code === "two_factor_invalid")
                    form.setError("twoFactorCode", { message: error.message });
            } else if (error instanceof ApiError && error.status === 401)
                form.setError("password", {
                    message: "邮箱或密码不正确，或账户不可用。",
                });
            else handleServerError(error);
        }
    };

    return (
        <AuthLayout>
            <Card className="w-full gap-group">
                <CardHeader>
                    <CardTitle>登录</CardTitle>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form
                            onSubmit={form.handleSubmit(onSubmit)}
                            className="space-y-group"
                        >
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>邮箱</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="name@example.com"
                                                autoComplete="username"
                                                inputMode="email"
                                                {...field}
                                                onChange={(event) => {
                                                    field.onChange(event);
                                                    setNeedsFactor(false);
                                                    form.resetField(
                                                        "twoFactorCode",
                                                    );
                                                }}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex items-center justify-between gap-inline">
                                            <FormLabel>密码</FormLabel>
                                            <Link
                                                to="/forgot-password"
                                                className="text-sm text-muted-foreground hover:text-foreground"
                                            >
                                                忘记密码？
                                            </Link>
                                        </div>
                                        <FormControl>
                                            <PasswordInput
                                                autoComplete="current-password"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {needsFactor && (
                                <FormField
                                    control={form.control}
                                    name="twoFactorCode"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                动态验证码或恢复码
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    autoComplete="one-time-code"
                                                    autoFocus
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                            <Button
                                className="w-full"
                                disabled={login.isPending}
                            >
                                {login.isPending ? (
                                    <Loader2 className="animate-spin" />
                                ) : (
                                    <LogIn />
                                )}
                                登录
                            </Button>
                        </form>
                    </Form>
                </CardContent>
                {site.data?.registrationOpen !== false ? (
                    <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
                        没有账户？
                        <Button asChild variant="link" className="h-auto p-0">
                            <Link to="/sign-up">注册</Link>
                        </Button>
                    </CardFooter>
                ) : null}
            </Card>
        </AuthLayout>
    );
}
