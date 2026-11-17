import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCommand, usePanel } from "@/api/panel";
import { Page } from "@/components/layout/page";
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
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
                className="space-y-6"
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
                                显示在登录页和侧边栏。
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="registrationOpen"
                    render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <FormLabel>开放注册</FormLabel>
                                <FormDescription>
                                    关闭后登录页隐藏注册入口，注册接口返回“暂未开放注册”。已有账户不受影响。
                                </FormDescription>
                            </div>
                            <FormControl>
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="supportNote"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>客服说明</FormLabel>
                            <FormControl>
                                <Textarea rows={4} {...field} />
                            </FormControl>
                            <FormDescription>
                                显示在用户提交工单的窗口里，例如处理时间、联系方式。
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button
                    type="submit"
                    disabled={save.isPending || !form.formState.isDirty}
                >
                    保存设置
                </Button>
            </form>
        </Form>
    );
}

export function AdminSettings() {
    const settings = usePanel<SiteSettings>("/admin/settings");
    return (
        <Page
            title="系统设置"
            description="站点信息和注册策略。修改会写入审计日志。"
        >
            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle>站点</CardTitle>
                    <CardDescription>
                        用户在登录页和用户中心看到的信息。
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {settings.data ? (
                        <SettingsForm settings={settings.data} />
                    ) : (
                        <Skeleton className="h-64" />
                    )}
                </CardContent>
            </Card>
        </Page>
    );
}
