import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { Info, Loader2, UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useRegister } from "@/api/hooks";
import { useSite } from "@/api/panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { AuthLayout } from "../auth-layout";

const formSchema = z
    .object({
        email: z
            .string()
            .trim()
            .min(1, "请输入邮箱")
            .max(64, "邮箱最多 64 个字符")
            .email("邮箱格式不正确"),
        password: z
            .string()
            .min(12, "密码至少 12 个字符")
            .max(128, "密码最多 128 个字符"),
        confirmPassword: z.string().min(1, "请再次输入密码"),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "两次输入的密码不一致",
        path: ["confirmPassword"],
    });

export function SignUp() {
    const navigate = useNavigate();
    const register = useRegister();
    const site = useSite();
    const closed = site.data?.registrationOpen === false;
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: { email: "", password: "", confirmPassword: "" },
    });

    const onSubmit = async ({
        email,
        password,
    }: z.infer<typeof formSchema>) => {
        await register.mutateAsync({ email, password });
        toast.success("账户已创建，请登录。");
        await navigate({ to: "/sign-in" });
    };

    return (
        <AuthLayout>
            <Card className="w-full gap-group">
                <CardHeader>
                    <CardTitle>创建账户</CardTitle>
                </CardHeader>
                {closed ? (
                    <CardContent>
                        <Alert variant="info">
                            <Info />
                            <AlertDescription>暂未开放注册。</AlertDescription>
                        </Alert>
                    </CardContent>
                ) : (
                    <CardContent>
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit((data) =>
                                    onSubmit(data).catch(() => undefined),
                                )}
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
                                                    autoComplete="email"
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
                                        <FormItem>
                                            <FormLabel>密码</FormLabel>
                                            <FormControl>
                                                <PasswordInput
                                                    autoComplete="new-password"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                12–128 个字符
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="confirmPassword"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>确认密码</FormLabel>
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
                                <Button
                                    className="w-full"
                                    disabled={register.isPending}
                                >
                                    {register.isPending ? (
                                        <Loader2 className="animate-spin" />
                                    ) : (
                                        <UserPlus />
                                    )}
                                    创建账户
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                )}
                <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
                    已有账户？
                    <Button asChild variant="link" className="h-auto p-0">
                        <Link to="/sign-in">登录</Link>
                    </Button>
                </CardFooter>
            </Card>
        </AuthLayout>
    );
}
