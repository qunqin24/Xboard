import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ApiError } from "@xboard/api-client";
import { Loader2, LogIn } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useLogin } from "@/api/hooks";
import { useSite } from "@/api/panel";
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
});

export function SignIn() {
    const { redirect } = useSearch({ from: "/(auth)/sign-in" });
    const navigate = useNavigate();
    const login = useLogin();
    const site = useSite();
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: { email: "", password: "" },
    });

    const onSubmit = async (data: z.infer<typeof formSchema>) => {
        try {
            await login.mutateAsync(data);
            await navigate({ to: safeRedirect(redirect), replace: true });
        } catch (error) {
            // A wrong password is a form error, not a toast.
            if (error instanceof ApiError && error.status === 401)
                form.setError("password", {
                    message: "邮箱或密码不正确，或账户不可用。",
                });
            else handleServerError(error);
        }
    };

    return (
        <AuthLayout>
            <Card className="max-w-sm gap-4">
                <CardHeader>
                    <CardTitle className="text-lg tracking-tight">
                        登录
                    </CardTitle>
                    <CardDescription>
                        输入邮箱和密码登录账户。
                        {site.data?.registrationOpen !== false ? (
                            <>
                                还没有账户？{" "}
                                <Link
                                    to="/sign-up"
                                    className="text-nowrap underline underline-offset-4 hover:text-primary"
                                >
                                    注册
                                </Link>
                            </>
                        ) : null}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form
                            onSubmit={form.handleSubmit(onSubmit)}
                            className="grid gap-3"
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
                                    <FormItem className="relative">
                                        <FormLabel>密码</FormLabel>
                                        <FormControl>
                                            <PasswordInput
                                                placeholder="********"
                                                autoComplete="current-password"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                        <Link
                                            to="/forgot-password"
                                            className="absolute inset-e-0 -top-0.5 text-sm font-medium text-muted-foreground hover:opacity-75"
                                        >
                                            忘记密码？
                                        </Link>
                                    </FormItem>
                                )}
                            />
                            <Button className="mt-2" disabled={login.isPending}>
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
            </Card>
        </AuthLayout>
    );
}
