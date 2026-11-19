import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Info, UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Site } from "@xboard/contracts";
import { useRegister, useRegisterCode } from "@/api/hooks";
import { useSite } from "@/api/panel";
import { LoadingButton } from "@/components/loading-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { PasswordInput } from "@/components/password-input";
import { AuthLayout } from "../auth-layout";
import { useCaptcha } from "../captcha";

const route = getRouteApi("/(auth)/sign-up");

function buildSchema(site: Site) {
    const termsShown = site.termsUrl !== "" || site.privacyUrl !== "";
    return z
        .object({
            email: z
                .string()
                .trim()
                .min(1, "请输入邮箱")
                .max(64, "邮箱最多 64 个字符")
                .email("邮箱格式不正确"),
            emailCode: site.emailCodeRequired
                ? z
                      .string()
                      .trim()
                      .regex(/^\d{6}$/, "请输入 6 位数字验证码")
                : z.string(),
            password: z
                .string()
                .min(12, "密码至少 12 个字符")
                .max(128, "密码最多 128 个字符"),
            confirmPassword: z.string().min(1, "请再次输入密码"),
            inviteCode: site.inviteOnly
                ? z.string().trim().min(1, "请输入邀请码")
                : z.string().trim(),
            acceptTerms: termsShown
                ? z.literal(true, { error: "请阅读并同意后继续" })
                : z.boolean(),
        })
        .refine((data) => data.password === data.confirmPassword, {
            message: "两次输入的密码不一致",
            path: ["confirmPassword"],
        });
}

type Values = z.infer<ReturnType<typeof buildSchema>>;

/** "获取验证码", then a countdown until another code may be requested. */
function CodeButton({ onSend }: { onSend: () => Promise<number | null> }) {
    const [left, setLeft] = useState(0);
    const [sending, setSending] = useState(false);
    useEffect(() => {
        if (left <= 0) return;
        const timer = setTimeout(() => setLeft(left - 1), 1000);
        return () => clearTimeout(timer);
    }, [left]);
    return (
        <LoadingButton
            type="button"
            variant="outline"
            className="shrink-0"
            loading={sending}
            disabled={left > 0}
            onClick={async () => {
                setSending(true);
                try {
                    const wait = await onSend();
                    if (wait !== null) setLeft(wait);
                } finally {
                    setSending(false);
                }
            }}
        >
            {left > 0 ? `${left} 秒后重发` : "获取验证码"}
        </LoadingButton>
    );
}

function TermsLabel({ site }: { site: Site }) {
    const links = [
        site.termsUrl ? { href: site.termsUrl, text: "服务条款" } : null,
        site.privacyUrl ? { href: site.privacyUrl, text: "隐私政策" } : null,
    ].filter((link) => link !== null);
    return (
        <>
            我已阅读并同意
            {links.map((link, index) => (
                <span key={link.href}>
                    {index > 0 ? "和" : null}
                    <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline-offset-4 hover:underline"
                    >
                        《{link.text}》
                    </a>
                </span>
            ))}
        </>
    );
}

function SignUpForm({ site, invite }: { site: Site; invite?: string }) {
    const navigate = useNavigate();
    const register = useRegister();
    const sendCode = useRegisterCode();
    const captcha = useCaptcha("register");
    const codeCaptcha = useCaptcha("register_code", site.emailCodeRequired);
    const termsShown = site.termsUrl !== "" || site.privacyUrl !== "";
    const schema = useMemo(() => buildSchema(site), [site]);
    const form = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: {
            email: "",
            emailCode: "",
            password: "",
            confirmPassword: "",
            inviteCode: invite ?? "",
            acceptTerms: false,
        },
    });

    const requestCode = async (): Promise<number | null> => {
        if (!(await form.trigger("email"))) return null;
        const challenge = codeCaptcha.take();
        if (!challenge) return null;
        try {
            const result = await sendCode.mutateAsync({
                email: form.getValues("email").trim(),
                ...challenge,
            });
            toast.success("验证码已发送，10 分钟内有效");
            return result.retryAfterSeconds;
        } catch {
            return null;
        }
    };

    const onSubmit = async (values: Values) => {
        const challenge = captcha.take();
        if (!challenge) return;
        await register.mutateAsync({
            ...challenge,
            email: values.email,
            password: values.password,
            ...(site.emailCodeRequired && { emailCode: values.emailCode }),
            ...(values.inviteCode && { inviteCode: values.inviteCode }),
            ...(termsShown && { acceptTerms: values.acceptTerms === true }),
        });
        toast.success("账户已创建，请登录。");
        await navigate({ to: "/sign-in" });
    };

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit((data) =>
                    onSubmit(data).catch(() => undefined),
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
                {codeCaptcha.content}
                {site.emailCodeRequired ? (
                    <FormField
                        control={form.control}
                        name="emailCode"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>邮箱验证码</FormLabel>
                                <div className="flex gap-inline">
                                    <FormControl>
                                        <Input
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={6}
                                            placeholder="000000"
                                            className="numeric"
                                            {...field}
                                        />
                                    </FormControl>
                                    <CodeButton onSend={requestCode} />
                                </div>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                ) : null}
                <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>密码</FormLabel>
                            <FormControl>
                                <PasswordInput
                                    autoComplete="new-password"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>12–128 个字符</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>确认密码</FormLabel>
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
                <FormField
                    control={form.control}
                    name="inviteCode"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>邀请码</FormLabel>
                            <FormControl>
                                <Input
                                    autoComplete="off"
                                    autoCapitalize="characters"
                                    maxLength={16}
                                    className="numeric uppercase"
                                    {...field}
                                />
                            </FormControl>
                            {site.inviteOnly ? null : (
                                <FormDescription>选填</FormDescription>
                            )}
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {termsShown ? (
                    <FormField
                        control={form.control}
                        name="acceptTerms"
                        render={({ field }) => (
                            <FormItem>
                                <div className="flex items-start gap-inline">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value === true}
                                            onCheckedChange={(value) =>
                                                field.onChange(value === true)
                                            }
                                        />
                                    </FormControl>
                                    <FormLabel className="leading-4 font-normal">
                                        <span>
                                            <TermsLabel site={site} />
                                        </span>
                                    </FormLabel>
                                </div>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                ) : null}
                {captcha.content}
                <LoadingButton
                    icon={<UserPlus />}
                    className="w-full"
                    loading={register.isPending}
                >
                    创建账户
                </LoadingButton>
            </form>
        </Form>
    );
}

export function SignUp() {
    const site = useSite();
    const { invite } = route.useSearch();
    return (
        <AuthLayout>
            <Card className="w-full gap-group">
                <CardHeader>
                    <CardTitle>创建账户</CardTitle>
                </CardHeader>
                <CardContent>
                    {!site.data ? (
                        <div className="space-y-group">
                            <Skeleton className="h-16" />
                            <Skeleton className="h-16" />
                            <Skeleton className="h-16" />
                        </div>
                    ) : !site.data.registrationOpen ? (
                        <Alert variant="info">
                            <Info />
                            <AlertDescription>暂未开放注册。</AlertDescription>
                        </Alert>
                    ) : (
                        <SignUpForm site={site.data} invite={invite} />
                    )}
                </CardContent>
                <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
                    已有账户？
                    <Button asChild variant="link" className="h-auto p-0">
                        <Link to="/sign-in">登录</Link>
                    </Button>
                </CardFooter>
            </Card>
        </AuthLayout>
    );
}
