import { useCommand, usePanel } from "../api/panel";
import { Checkbox, Feedback, Field, Form, TextArea } from "../components/forms";
import { useToast } from "../components/overlays";
import {
    Card,
    CardHeader,
    PageHeader,
    Skeleton,
} from "../components/primitives";
import type { SiteSettings } from "./types";

export function SettingsPage() {
    const settings = usePanel<SiteSettings>("/admin/settings");
    const save = useCommand();
    const toast = useToast();

    return (
        <div className="space-y-6">
            <PageHeader
                title="系统设置"
                description="站点信息和注册策略。修改会写入审计日志。"
            />
            <div className="max-w-2xl">
                {settings.isPending ? (
                    <Skeleton className="h-80" />
                ) : settings.isError ? (
                    <Feedback error={settings.error} />
                ) : (
                    <Card>
                        <CardHeader
                            title="站点"
                            description="用户在登录页和用户中心看到的信息。"
                        />
                        <div className="mt-5">
                            <Form
                                key={JSON.stringify(settings.data)}
                                busy={save.isPending}
                                label="保存设置"
                                submit={(form) =>
                                    save.mutate(
                                        {
                                            path: "/admin/settings",
                                            method: "PUT",
                                            body: {
                                                siteName: String(
                                                    form.get("siteName"),
                                                ).trim(),
                                                registrationOpen:
                                                    form.has(
                                                        "registrationOpen",
                                                    ),
                                                supportNote: String(
                                                    form.get("supportNote") ??
                                                        "",
                                                ),
                                            },
                                        },
                                        {
                                            onSuccess: () =>
                                                toast.success("设置已保存"),
                                        },
                                    )
                                }
                            >
                                <Field
                                    label="站点名称"
                                    name="siteName"
                                    defaultValue={settings.data.siteName}
                                    minLength={1}
                                    maxLength={40}
                                    required
                                />
                                <Checkbox
                                    name="registrationOpen"
                                    defaultChecked={
                                        settings.data.registrationOpen
                                    }
                                    label="开放注册"
                                    description="关闭后登录页隐藏注册入口，注册接口返回“暂未开放注册”。已有账户不受影响。"
                                />
                                <TextArea
                                    label="客服说明"
                                    name="supportNote"
                                    rows={4}
                                    maxLength={500}
                                    required={false}
                                    defaultValue={settings.data.supportNote}
                                />
                                <p className="-mt-2 text-xs text-ink-subtle">
                                    显示在用户的工单区，例如处理时间、联系方式。最多
                                    500 字。
                                </p>
                            </Form>
                            <Feedback error={save.error} />
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
}
