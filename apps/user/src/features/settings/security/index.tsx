import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCommand } from "@/api/panel";
import { queryClient } from "@/query-client";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/password-input";
import { ContentSection } from "../components/content-section";

const schema = z
    .object({
        oldPassword: z.string().min(1, "请输入当前密码"),
        password: z
            .string()
            .min(12, "新密码至少 12 个字符")
            .max(128, "新密码最多 128 个字符"),
        confirmPassword: z.string().min(1, "请再次输入新密码"),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "两次输入的新密码不一致",
        path: ["confirmPassword"],
    });

export function SettingsSecurity() {
    const navigate = useNavigate();
    const change = useCommand();
    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: { oldPassword: "", password: "", confirmPassword: "" },
    });

    return (
        <ContentSection
            title="安全"
            desc="修改密码后，所有设备上的登录都会失效，需要重新登录。"
        >
            <Form {...form}>
                <form
                    className="space-y-6"
                    onSubmit={form.handleSubmit(({ oldPassword, password }) =>
                        change.mutate(
                            {
                                path: "/account/password",
                                body: { oldPassword, password },
                            },
                            {
                                onSuccess: () => {
                                    queryClient.clear();
                                    toast.success("密码已修改，请重新登录。");
                                    void navigate({ to: "/sign-in" });
                                },
                            },
                        ),
                    )}
                >
                    <FormField
                        control={form.control}
                        name="oldPassword"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>当前密码</FormLabel>
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
                                <FormDescription>
                                    12 至 128 个字符。
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
                                <FormLabel>确认新密码</FormLabel>
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
                    <Button type="submit" disabled={change.isPending}>
                        修改密码
                    </Button>
                </form>
            </Form>
        </ContentSection>
    );
}
