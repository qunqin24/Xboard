import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
    TEMPLATE_FORMATS,
    TEMPLATE_MAX,
    type SubscriptionTemplate,
    type TemplateFormat,
} from "@xboard/contracts";
import { ApiError, request } from "@/api/client";
import { usePanel } from "@/api/panel";
import { LoadingButton } from "@/components/loading-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { InfoTip } from "@/components/info-tip";
import { Page } from "@/components/layout/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { handleServerError } from "@/lib/handle-server-error";

const LABEL: Record<TemplateFormat, string> = {
    mihomo: "Mihomo",
    singbox: "sing-box",
    quantumultx: "Quantumult X",
    loon: "Loon",
    shadowrocket: "Shadowrocket",
};

/** What the panel adds to each format, shown next to the editor. */
const INJECTION: Record<TemplateFormat, string> = {
    mihomo: "YAML。面板把节点写入 proxies，并把全部节点名加入带有 include-all-proxies: true 的分组。用于 Clash Verge Rev、Clash Party、FlClash、Clash Meta 与 Stash（Stash 自动改用 .yaml 规则集）。",
    singbox:
        'JSON。面板把节点追加到 outbounds，并把分组 outbounds 中的 "{{nodes}}" 换成全部节点。用于 sing-box、Hiddify、Karing，需 sing-box 1.13 及以上。',
    quantumultx:
        "每行一条 filter_remote，一键导入时与节点订阅一起添加到 Quantumult X；可用内置策略 proxy、direct、reject。{{origin}} 换成面板地址，/api/rules/quantumultx/ai-*.list 是面板提供的补充 AI 域名。",
    loon: "Loon 配置文件。{{subscription}} 会换成本用户的 Loon 节点订阅地址；一键导入安装整份配置。",
    shadowrocket:
        "Shadowrocket 配置文件，只含规则与分组。节点来自单独导入的订阅：PROXY 为内置节点选择，policy-regex-filter=.* 让分组包含订阅中的节点。",
};

function TemplateEditor({ template }: { template: SubscriptionTemplate }) {
    const client = useQueryClient();
    const [content, setContent] = useState(template.content);
    const [errors, setErrors] = useState<string[]>([]);
    const [confirmReset, setConfirmReset] = useState(false);
    // A reset or another tab's save refetches the list: follow the server.
    useEffect(() => {
        setContent(template.content);
        setErrors([]);
    }, [template.content]);

    const command = useMutation({
        mutationFn: (method: "PUT" | "DELETE") =>
            request<SubscriptionTemplate>(
                `/admin/subscription-templates/${template.format}`,
                method,
                method === "PUT" ? { content } : undefined,
            ),
        // Validation errors are listed next to the editor instead of a toast.
        meta: { silentError: true },
        onSuccess: async (_saved, method) => {
            setErrors([]);
            toast.success(method === "PUT" ? "模板已保存" : "已恢复默认模板");
            await client.invalidateQueries({ queryKey: ["panel"] });
        },
        onError: (error) => {
            if (error instanceof ApiError && error.status === 400)
                setErrors(error.message.split("\n").filter(Boolean));
            else handleServerError(error);
        },
    });

    const dirty = content !== template.content;
    return (
        <div className="flex flex-col gap-group">
            <div className="flex flex-wrap items-center justify-between gap-inline">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    {template.customized && template.updatedAt
                        ? `已修改，更新于 ${formatDateTime(template.updatedAt)}`
                        : "使用默认模板"}
                    <InfoTip label="注入说明">
                        {INJECTION[template.format]}
                    </InfoTip>
                </div>
                <div className="flex gap-inline">
                    <Button
                        variant="outline"
                        disabled={!template.customized || command.isPending}
                        onClick={() => setConfirmReset(true)}
                    >
                        <RotateCcw />
                        恢复默认
                    </Button>
                    <LoadingButton
                        loading={command.isPending}
                        disabled={!dirty}
                        onClick={() => command.mutate("PUT")}
                    >
                        保存
                    </LoadingButton>
                </div>
            </div>
            {errors.length ? (
                <Alert variant="destructive">
                    <CircleAlert />
                    <AlertTitle>模板未保存</AlertTitle>
                    <AlertDescription>
                        <ul className="list-disc ps-4">
                            {errors.map((error) => (
                                <li key={error}>{error}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            ) : null}
            <div className="flex flex-col gap-field">
                <Label
                    htmlFor={`template-${template.format}`}
                    className="sr-only"
                >
                    {LABEL[template.format]} 模板
                </Label>
                <Textarea
                    id={`template-${template.format}`}
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    maxLength={TEMPLATE_MAX}
                    spellCheck={false}
                    // Config lines read better unwrapped; the editor scrolls.
                    wrap="off"
                    aria-invalid={errors.length > 0}
                    className="numeric h-96 field-sizing-fixed md:text-xs lg:h-128"
                />
            </div>
            <ConfirmDialog
                open={confirmReset}
                onOpenChange={setConfirmReset}
                title={`恢复 ${LABEL[template.format]} 的默认模板？`}
                desc="当前修改将被丢弃，订阅改用面板内置的规则与分组。"
                confirmText="恢复默认"
                destructive
                isLoading={command.isPending}
                handleConfirm={() =>
                    command.mutate("DELETE", {
                        onSettled: () => setConfirmReset(false),
                    })
                }
            />
        </div>
    );
}

export function AdminTemplates() {
    const templates = usePanel<SubscriptionTemplate[]>(
        "/admin/subscription-templates",
    );
    const [tab, setTab] = useState<TemplateFormat>("mihomo");
    return (
        <Page
            title="规则模板"
            description="订阅中的分流规则与代理分组"
            help="每种客户端格式一份模板，保存前校验。规则集均为远程引用（Mihomo 与 sing-box 共用 MetaCubeX/meta-rules-dat，Quantumult X、Loon、Shadowrocket 用 blackmatrix7/ios_rule_script），客户端会按来源自动更新。"
        >
            {templates.data ? (
                <Tabs
                    value={tab}
                    onValueChange={(value) => setTab(value as TemplateFormat)}
                    className="gap-group"
                >
                    <div className="overflow-x-auto">
                        <TabsList>
                            {TEMPLATE_FORMATS.map((format) => {
                                const customized = templates.data.find(
                                    (t) => t.format === format,
                                )?.customized;
                                return (
                                    <TabsTrigger
                                        key={format}
                                        value={format}
                                        className="px-3"
                                    >
                                        {LABEL[format]}
                                        {customized ? (
                                            <Badge variant="secondary">
                                                已修改
                                            </Badge>
                                        ) : null}
                                    </TabsTrigger>
                                );
                            })}
                        </TabsList>
                    </div>
                    {templates.data.map((template) => (
                        <TabsContent
                            key={template.format}
                            value={template.format}
                        >
                            <TemplateEditor template={template} />
                        </TabsContent>
                    ))}
                </Tabs>
            ) : templates.error ? (
                <ErrorState
                    error={templates.error}
                    onRetry={() => templates.refetch()}
                />
            ) : (
                <Skeleton className="h-96" />
            )}
        </Page>
    );
}
