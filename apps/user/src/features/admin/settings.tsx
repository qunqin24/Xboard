import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
    emailDomainSchema,
    normalizeDomain,
    settingsBody,
} from "@xboard/contracts";
import { useCommand, usePanel } from "@/api/panel";
import { CheckRow } from "@/components/check-row";
import { ErrorState } from "@/components/error-state";
import { InfoTip } from "@/components/info-tip";
import { Page } from "@/components/layout/page";
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
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { PlanRow, SiteSettings } from "./types";

const shape = settingsBody.shape;

/** Domains typed one per line (commas and spaces also separate them). */
function splitDomains(text: string): string[] {
    return text
        .split(/[\s,，、]+/)
        .map(normalizeDomain)
        .filter(Boolean);
}

const wholeNumber = (max: number, min = 0) =>
    z
        .string()
        .trim()
        .regex(/^\d{1,4}$/, "请输入整数")
        .refine((v) => Number(v) >= min, `不能小于 ${min}`)
        .refine((v) => Number(v) <= max, `不能大于 ${max}`);

const schema = z
    .object({
        siteName: shape.siteName,
        registrationOpen: z.boolean(),
        supportNote: shape.supportNote,
        inviteOnly: z.boolean(),
        emailCodeRequired: z.boolean(),
        emailDomainMode: shape.emailDomainMode,
        emailDomains: z.string().max(20_000, "内容过长"),
        gmailAliasCheck: z.boolean(),
        registerIpDailyLimit: wholeNumber(1000),
        trialPlan: z.string(),
        trialDays: wholeNumber(365, 1),
        termsUrl: shape.termsUrl,
        privacyUrl: shape.privacyUrl,
        expiryReminders: z.boolean(),
        trafficReminders: z.boolean(),
    })
    .superRefine((values, ctx) => {
        const domains = splitDomains(values.emailDomains);
        const invalid = domains.find(
            (domain) => !emailDomainSchema.safeParse(domain).success,
        );
        if (invalid)
            ctx.addIssue({
                code: "custom",
                path: ["emailDomains"],
                message: `“${invalid}”不是有效的域名`,
            });
        else if (values.emailDomainMode === "allow" && domains.length === 0)
            ctx.addIssue({
                code: "custom",
                path: ["emailDomains"],
                message: "请至少填写一个允许的域名",
            });
    });

type Values = z.infer<typeof schema>;

function toValues(settings: SiteSettings): Values {
    return {
        ...settings,
        emailDomains: settings.emailDomains.join("\n"),
        registerIpDailyLimit: String(settings.registerIpDailyLimit),
        trialPlan:
            settings.trialPlanId === null
                ? "none"
                : String(settings.trialPlanId),
        trialDays: String(settings.trialDays),
    };
}

function toBody(values: Values): SiteSettings {
    const { trialPlan, ...fields } = values;
    return {
        ...fields,
        siteName: values.siteName.trim(),
        emailDomains: [...new Set(splitDomains(values.emailDomains))],
        registerIpDailyLimit: Number(values.registerIpDailyLimit),
        trialPlanId: trialPlan === "none" ? null : Number(trialPlan),
        trialDays: Number(values.trialDays),
    };
}

const TABS = ["basic", "register", "newUser", "billing"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
    basic: "基本",
    register: "注册",
    newUser: "新用户",
    billing: "订阅提醒",
};
/** Which form fields each tab shows, to point a failed save at its tab. */
const TAB_FIELDS: Record<Tab, (keyof Values)[]> = {
    basic: ["siteName", "supportNote"],
    register: [
        "registrationOpen",
        "inviteOnly",
        "emailCodeRequired",
        "registerIpDailyLimit",
        "emailDomainMode",
        "emailDomains",
        "gmailAliasCheck",
    ],
    newUser: ["trialPlan", "trialDays", "termsUrl", "privacyUrl"],
    billing: ["expiryReminders", "trafficReminders"],
};

function SettingsForm({
    settings,
    plans,
}: {
    settings: SiteSettings;
    plans: PlanRow[];
}) {
    const save = useCommand();
    const form = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: toValues(settings),
    });
    const domainMode = useWatch({
        control: form.control,
        name: "emailDomainMode",
    });
    const trialPlan = useWatch({ control: form.control, name: "trialPlan" });

    const [tab, setTab] = useState<Tab>("basic");
    const errors = form.formState.errors;
    const hasError = (name: Tab) =>
        TAB_FIELDS[name].some((field) => field in errors);

    return (
        <Page
            title="系统设置"
            actions={
                <Button
                    type="submit"
                    form="site-settings"
                    disabled={save.isPending || !form.formState.isDirty}
                >
                    {save.isPending ? (
                        <Loader2 className="animate-spin" />
                    ) : null}
                    保存设置
                </Button>
            }
        >
            <Form {...form}>
                <form
                    id="site-settings"
                    onSubmit={form.handleSubmit(
                        (values) => {
                            const body = toBody(values);
                            save.mutate(
                                {
                                    path: "/admin/settings",
                                    method: "PUT",
                                    body,
                                },
                                {
                                    onSuccess: () => {
                                        toast.success("设置已保存");
                                        form.reset(toValues(body));
                                    },
                                },
                            );
                        },
                        // One save covers every tab: show the tab that
                        // holds the first invalid field.
                        (invalid) => {
                            const first = TABS.find((name) =>
                                TAB_FIELDS[name].some(
                                    (field) => field in invalid,
                                ),
                            );
                            if (first) setTab(first);
                        },
                    )}
                >
                    <Tabs
                        value={tab}
                        onValueChange={(value) => setTab(value as Tab)}
                        className="gap-page"
                    >
                        <TabsList>
                            {TABS.map((name) => (
                                <TabsTrigger
                                    key={name}
                                    value={name}
                                    className="px-4"
                                >
                                    {TAB_LABELS[name]}
                                    {hasError(name) ? (
                                        <span
                                            aria-label="有错误"
                                            className="size-2 rounded-full bg-destructive"
                                        />
                                    ) : null}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        <TabsContent
                            value="basic"
                            forceMount
                            className="max-w-2xl space-y-group data-[state=inactive]:hidden"
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
                                            显示于登录页和侧边栏。
                                        </FormDescription>
                                        <FormMessage />
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
                        </TabsContent>
                        <TabsContent
                            value="register"
                            forceMount
                            className="max-w-2xl space-y-group data-[state=inactive]:hidden"
                        >
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
                                name="inviteOnly"
                                render={({ field }) => (
                                    <CheckRow
                                        label="仅限邀请注册"
                                        description="新用户需填写已有用户的邀请码。"
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="emailCodeRequired"
                                render={({ field }) => (
                                    <CheckRow
                                        label="注册需邮箱验证码"
                                        description="需先配置邮件服务。通过验证码注册的账户视为邮箱已验证。"
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="registerIpDailyLimit"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex items-center gap-1">
                                            <FormLabel>
                                                单 IP 注册上限
                                            </FormLabel>
                                            <InfoTip>
                                                按注册时的 IP 统计最近 24
                                                小时内创建的账户数。IPv6 地址按
                                                /64 网段计算。
                                            </InfoTip>
                                        </div>
                                        <FormControl>
                                            <Input
                                                inputMode="numeric"
                                                className="numeric max-w-40"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            每 24 小时，0 表示不限。
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="emailDomainMode"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex items-center gap-1">
                                            <FormLabel>邮箱域名</FormLabel>
                                            <InfoTip>
                                                规则同时适用于子域名，例如
                                                example.com 也匹配
                                                mail.example.com。已有账户不受影响。
                                            </InfoTip>
                                        </div>
                                        <FormControl>
                                            <RadioGroup
                                                value={field.value}
                                                onValueChange={field.onChange}
                                                className="flex flex-wrap gap-group"
                                            >
                                                {(
                                                    [
                                                        ["off", "不限制"],
                                                        [
                                                            "allow",
                                                            "仅允许以下域名",
                                                        ],
                                                        [
                                                            "deny",
                                                            "禁止以下域名",
                                                        ],
                                                    ] as const
                                                ).map(([value, label]) => (
                                                    <FormItem
                                                        key={value}
                                                        className="flex items-center gap-inline"
                                                    >
                                                        <FormControl>
                                                            <RadioGroupItem
                                                                value={value}
                                                            />
                                                        </FormControl>
                                                        <FormLabel className="font-normal">
                                                            {label}
                                                        </FormLabel>
                                                    </FormItem>
                                                ))}
                                            </RadioGroup>
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            {domainMode === "off" ? null : (
                                <FormField
                                    control={form.control}
                                    name="emailDomains"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {domainMode === "allow"
                                                    ? "允许的域名"
                                                    : "禁止的域名"}
                                            </FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    rows={5}
                                                    placeholder={
                                                        domainMode === "allow"
                                                            ? "gmail.com\nqq.com"
                                                            : "mailinator.com\nguerrillamail.com"
                                                    }
                                                    className="numeric"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                每行一个域名。
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                            <FormField
                                control={form.control}
                                name="gmailAliasCheck"
                                render={({ field }) => (
                                    <CheckRow
                                        label="Gmail 别名视为同一邮箱"
                                        description="例如 a.b+1@gmail.com 与 ab@gmail.com 只能注册一个账户。"
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                )}
                            />
                        </TabsContent>
                        <TabsContent
                            value="newUser"
                            forceMount
                            className="max-w-2xl space-y-group data-[state=inactive]:hidden"
                        >
                            <div className="grid gap-group sm:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="trialPlan"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>试用套餐</FormLabel>
                                            <Select
                                                value={field.value}
                                                onValueChange={field.onChange}
                                            >
                                                <FormControl>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="none">
                                                        不赠送
                                                    </SelectItem>
                                                    {plans.map((plan) => (
                                                        <SelectItem
                                                            key={plan.id}
                                                            value={String(
                                                                plan.id,
                                                            )}
                                                        >
                                                            {plan.name}
                                                            {plan.published
                                                                ? ""
                                                                : "（未发布）"}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormDescription>
                                                注册后自动开通，不扣余额。
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="trialDays"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>试用天数</FormLabel>
                                            <FormControl>
                                                <Input
                                                    inputMode="numeric"
                                                    className="numeric"
                                                    disabled={
                                                        trialPlan === "none"
                                                    }
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                1–365 天
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <FormField
                                control={form.control}
                                name="termsUrl"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>服务条款链接</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="url"
                                                placeholder="https://example.com/terms"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="privacyUrl"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>隐私政策链接</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="url"
                                                placeholder="https://example.com/privacy"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            填写任一链接后，注册时需勾选同意。
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </TabsContent>
                        <TabsContent
                            value="billing"
                            forceMount
                            className="max-w-2xl space-y-group data-[state=inactive]:hidden"
                        >
                            <FormField
                                control={form.control}
                                name="expiryReminders"
                                render={({ field }) => (
                                    <CheckRow
                                        label="到期提醒"
                                        description="在套餐到期前 3 天和 1 天发送邮件。需已配置邮件服务。"
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="trafficReminders"
                                render={({ field }) => (
                                    <CheckRow
                                        label="流量提醒"
                                        description="在已用流量达到 80% 和 95% 时分别发送邮件。"
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                )}
                            />
                        </TabsContent>
                    </Tabs>
                </form>
            </Form>
        </Page>
    );
}

export function AdminSettings() {
    const settings = usePanel<SiteSettings>("/admin/settings");
    const plans = usePanel<PlanRow[]>("/admin/plans");
    const error = settings.error ?? plans.error;
    if (settings.data && plans.data)
        return <SettingsForm settings={settings.data} plans={plans.data} />;
    return (
        <Page title="系统设置">
            {error ? (
                <ErrorState
                    error={error}
                    onRetry={() => {
                        void settings.refetch();
                        void plans.refetch();
                    }}
                />
            ) : (
                <Skeleton className="h-64 max-w-2xl" />
            )}
        </Page>
    );
}
