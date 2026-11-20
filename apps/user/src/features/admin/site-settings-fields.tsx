import { useFormContext, useWatch } from "react-hook-form";
import { CheckRow } from "@/components/check-row";
import { InfoTip } from "@/components/info-tip";
import {
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
import { Textarea } from "@/components/ui/textarea";
import { SettingsCard } from "./settings-card";
import type { Values } from "./site-settings-form";
import type { PlanRow } from "./types";

/** Cards below read and write the shared site form through context. */

export function SiteBasicsCard() {
    const form = useFormContext<Values>();
    return (
        <SettingsCard title="基本信息">
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
        </SettingsCard>
    );
}

export function RegistrationCard() {
    const form = useFormContext<Values>();
    return (
        <SettingsCard title="注册方式">
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
                            <FormLabel>单 IP 注册上限</FormLabel>
                            <InfoTip>
                                按注册时的 IP 统计最近 24
                                小时内创建的账户数。IPv6 地址按 /64 网段计算。
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
        </SettingsCard>
    );
}

export function EmailRulesCard() {
    const form = useFormContext<Values>();
    const domainMode = useWatch({
        control: form.control,
        name: "emailDomainMode",
    });
    return (
        <SettingsCard title="邮箱限制">
            <FormField
                control={form.control}
                name="emailDomainMode"
                render={({ field }) => (
                    <FormItem>
                        <div className="flex items-center gap-1">
                            <FormLabel>邮箱域名</FormLabel>
                            <InfoTip>
                                规则同时适用于子域名，例如 example.com 也匹配
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
                                        ["allow", "仅允许以下域名"],
                                        ["deny", "禁止以下域名"],
                                    ] as const
                                ).map(([value, label]) => (
                                    <FormItem
                                        key={value}
                                        className="flex items-center gap-inline"
                                    >
                                        <FormControl>
                                            <RadioGroupItem value={value} />
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
                            <FormDescription>每行一个域名。</FormDescription>
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
        </SettingsCard>
    );
}

export function LegalLinksCard() {
    const form = useFormContext<Values>();
    return (
        <SettingsCard
            title="条款与隐私"
            description="填写任一链接后，注册时需勾选同意。"
        >
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
                        <FormMessage />
                    </FormItem>
                )}
            />
        </SettingsCard>
    );
}

export function TrialCard({ plans }: { plans: PlanRow[] }) {
    const form = useFormContext<Values>();
    const trialPlan = useWatch({ control: form.control, name: "trialPlan" });
    return (
        <SettingsCard title="新用户试用">
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
                                    <SelectItem value="none">不赠送</SelectItem>
                                    {plans.map((plan) => (
                                        <SelectItem
                                            key={plan.id}
                                            value={String(plan.id)}
                                        >
                                            {plan.name}
                                            {plan.published ? "" : "（未发布）"}
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
                                    disabled={trialPlan === "none"}
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>1–365 天</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
        </SettingsCard>
    );
}

export function ReminderCard() {
    const form = useFormContext<Values>();
    return (
        <SettingsCard
            title="用户提醒邮件"
            description="需先配置上方的发信服务。"
        >
            <FormField
                control={form.control}
                name="expiryReminders"
                render={({ field }) => (
                    <CheckRow
                        label="到期提醒"
                        description="在套餐到期前 3 天和 1 天发送邮件。"
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
        </SettingsCard>
    );
}
