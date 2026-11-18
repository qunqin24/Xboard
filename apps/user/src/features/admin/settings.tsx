import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCommand, usePanel } from "@/api/panel";
import { CheckRow } from "@/components/check-row";
import { ErrorState } from "@/components/error-state";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { SiteSettings } from "./types";

const schema = z.object({
    siteName: z
        .string()
        .trim()
        .min(1, "请输入站点名称")
        .max(40, "最多 40 个字"),
    registrationOpen: z.boolean(),
    supportNote: z.string().max(500, "最多 500 字"),
});

function SettingsForm({ settings }: { settings: SiteSettings }) {
    const save = useCommand();
    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: settings,
    });
    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit((body) =>
                    save.mutate(
                        { path: "/admin/settings", method: "PUT", body },
                        {
                            onSuccess: () => {
                                toast.success("设置已保存");
                                form.reset(body);
                            },
                        },
                    ),
                )}
            >
                <Card className="max-w-2xl">
                    <CardContent className="space-y-group">
                        <FormField
                            control={form.control}
                            name="siteName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>站点名称</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        显示于登录页和侧边栏。
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="registrationOpen"
                            render={({ field }) => (
                                <CheckRow
                                    label="开放注册"
                                    description="关闭后将隐藏注册入口，已有账户不受影响。"
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="supportNote"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>客服说明</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            rows={4}
                                            placeholder="例如：工作日 9:00–18:00 回复"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        显示在用户提交工单的页面中。
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                    <CardFooter className="justify-end border-t">
                        <Button
                            type="submit"
                            disabled={save.isPending || !form.formState.isDirty}
                        >
                            保存设置
                        </Button>
                    </CardFooter>
                </Card>
            </form>
        </Form>
    );
}

export function AdminSettings() {
    const settings = usePanel<SiteSettings>("/admin/settings");
    return (
        <Page title="系统设置">
            {settings.data ? (
                <SettingsForm settings={settings.data} />
            ) : settings.isError ? (
                <ErrorState
                    error={settings.error}
                    onRetry={() => void settings.refetch()}
                />
            ) : (
                <Skeleton className="h-64 max-w-2xl" />
            )}
        </Page>
    );
}
