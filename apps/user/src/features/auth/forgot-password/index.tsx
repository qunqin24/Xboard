import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { CircleCheck, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCommand } from "@/api/panel";
import { LoadingButton } from "@/components/loading-button";
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
            <Card className="w-full gap-group">
                <CardHeader>
                    <CardTitle>找回密码</CardTitle>
                    <CardDescription>
                        系统将向注册邮箱发送重置链接，30 分钟内有效。
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {send.isSuccess ? (
                        <Alert variant="success">
                            <CircleCheck />
                            <AlertDescription>
                                若该邮箱已注册，重置邮件已发送，请查收。
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
                                <LoadingButton
                                    icon={<Send />}
                                    className="w-full"
                                    loading={send.isPending}
                                >
                                    发送重置邮件
                                </LoadingButton>
                            </form>
                        </Form>
                    )}
                </CardContent>
                <CardFooter className="justify-center">
                    <Button asChild variant="link" className="h-auto p-0">
                        <Link to="/sign-in">返回登录</Link>
                    </Button>
                </CardFooter>
            </Card>
        </AuthLayout>
    );
}
