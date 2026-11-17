import { CheckCircle2, MailWarning } from "lucide-react";
import { useAccount } from "@/api/hooks";
import { useCommand } from "@/api/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMinor } from "@/lib/format";
import { ContentSection } from "../components/content-section";

export function SettingsAccount() {
    const account = useAccount();
    const verify = useCommand();
    const data = account.data;

    return (
        <ContentSection title="账户" desc="登录邮箱和账户基本信息。">
            <div className="space-y-6">
                <Card>
                    <CardContent className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm text-muted-foreground">
                                    登录邮箱
                                </p>
                                <p className="font-medium">{data?.email}</p>
                            </div>
                            {data?.emailVerified ? (
                                <Badge variant="secondary">
                                    <CheckCircle2 /> 已验证
                                </Badge>
                            ) : (
                                <Badge
                                    variant="outline"
                                    className="text-amber-600 dark:text-amber-400"
                                >
                                    <MailWarning /> 未验证
                                </Badge>
                            )}
                        </div>
                        {data && !data.emailVerified ? (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm">
                                <span className="text-muted-foreground">
                                    验证后可以用邮箱找回密码。
                                </span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                        verify.isPending || verify.isSuccess
                                    }
                                    onClick={() =>
                                        verify.mutate({
                                            path: "/account/verify-email",
                                        })
                                    }
                                >
                                    {verify.isSuccess
                                        ? "已发送，30 分钟内有效"
                                        : "发送验证邮件"}
                                </Button>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <dt className="text-muted-foreground">账户类型</dt>
                        <dd className="mt-1">
                            {data?.role === "admin" ? "管理员" : "普通用户"}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">余额</dt>
                        <dd className="numeric mt-1">
                            {data ? formatMinor(data.balanceMinor) : "—"}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">当前套餐</dt>
                        <dd className="mt-1">{data?.plan?.name ?? "未开通"}</dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">到期</dt>
                        <dd className="numeric mt-1">
                            {data?.plan
                                ? formatDate(data.expiredAt ?? null)
                                : "—"}
                        </dd>
                    </div>
                </dl>
            </div>
        </ContentSection>
    );
}
