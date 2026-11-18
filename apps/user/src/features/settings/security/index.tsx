import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCommand } from "@/api/panel";
import { queryClient } from "@/query-client";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { LoginDevices } from "./devices";
import { TwoFactorSettings } from "./two-factor";

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
    const [pending, setPending] = useState<z.infer<typeof schema> | null>(null);
    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: { oldPassword: "", password: "", confirmPassword: "" },
    });

    return (
        <ContentSection title="安全">
            <div className="flex flex-col gap-page">
                <TwoFactorSettings />
                <LoginDevices />
                <section
                    className="flex flex-col gap-group"
                    aria-labelledby="change-password-heading"
                >
                    <h4 id="change-password-heading" className="font-semibold">
                        修改密码
                    </h4>
                    <Form {...form}>
                        <form
                            className="space-y-group"
                            onSubmit={form.handleSubmit((values) =>
                                setPending(values),
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
                                            长度为 12–128 个字符
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
                                {change.isPending ? (
                                    <Loader2 className="animate-spin" />
                                ) : null}
                                修改密码
                            </Button>
                        </form>
                    </Form>
                    <ConfirmDialog
                        open={pending !== null}
                        onOpenChange={(open) => !open && setPending(null)}
                        title="修改密码"
                        desc="修改后，所有设备将退出登录，需使用新密码重新登录。"
                        confirmText="确认修改"
                        destructive
                        isLoading={change.isPending}
                        handleConfirm={() => {
                            if (!pending) return;
                            const { oldPassword, password } = pending;
                            change.mutate(
                                {
                                    path: "/account/password",
                                    body: { oldPassword, password },
                                },
                                {
                                    onSuccess: () => {
                                        setPending(null);
                                        queryClient.clear();
                                        toast.success(
                                            "密码已修改，请重新登录。",
                                        );
                                        void navigate({ to: "/sign-in" });
                                    },
                                    onError: () => setPending(null),
                                },
                            );
                        }}
                    />
                </section>
            </div>
        </ContentSection>
    );
}
