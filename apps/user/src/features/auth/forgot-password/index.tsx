import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { Loader2, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCommand } from "@/api/panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
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
import { AuthLayout } from "../auth-layout";

const formSchema = z.object({
    email: z.string().trim().min(1, "请输入邮箱").email("邮箱格式不正确"),
});

export function ForgotPassword() {
    const send = useCommand();
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: { email: "" },
    });

    return (
        <AuthLayout>
            <Card className="max-w-sm gap-4">
                <CardHeader>
                    <CardTitle className="text-lg tracking-tight">
                        找回密码
                    </CardTitle>
                    <CardDescription>
                        输入注册邮箱，我们会发送一次性重置链接，30 分钟内有效。
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {send.isSuccess ? (
                        <Alert>
                            <AlertDescription>
                                如果该邮箱已注册，重置邮件已经发出，请查收。
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit((data) =>
                                    send.mutate({
                                        path: "/auth/forgot",
                                        body: data,
                                    }),
                                )}
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
                                                    autoComplete="email"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button
                                    className="mt-2"
                                    disabled={send.isPending}
                                >
                                    {send.isPending ? (
                                        <Loader2 className="animate-spin" />
                                    ) : (
                                        <Send />
                                    )}
                                    发送重置邮件
                                </Button>
                            </form>
                        </Form>
                    )}
                </CardContent>
                <CardFooter>
                    <p className="mx-auto text-sm text-muted-foreground">
                        想起来了？{" "}
                        <Link
                            to="/sign-in"
                            className="underline underline-offset-4 hover:text-primary"
                        >
                            返回登录
                        </Link>
                    </p>
                </CardFooter>
            </Card>
        </AuthLayout>
    );
}
