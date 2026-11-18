import { CheckCircle2, Loader2, MailWarning } from "lucide-react";
import { useAccount } from "@/api/hooks";
import { useCommand } from "@/api/panel";
import { ErrorState } from "@/components/error-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatMinor } from "@/lib/format";
import { ContentSection } from "../components/content-section";

export function SettingsAccount() {
    const account = useAccount();
    const verify = useCommand();
    const data = account.data;

    return (
        <ContentSection title="账户">
            {account.isError ? (
                <ErrorState
                    error={account.error}
                    onRetry={() => void account.refetch()}
                />
            ) : (
                <div className="space-y-group">
                    <dl className="grid grid-cols-2 gap-group text-sm">
                        <div className="col-span-2 space-y-1">
                            <dt className="text-muted-foreground">登录邮箱</dt>
                            <dd className="flex flex-wrap items-center gap-inline font-medium">
                                {data ? (
                                    <>
                                        {data.email}
                                        {data.emailVerified ? (
                                            <Badge variant="success">
                                                <CheckCircle2 />
                                                已验证
                                            </Badge>
                                        ) : (
                                            <Badge variant="warning">
                                                <MailWarning />
                                                未验证
                                            </Badge>
                                        )}
                                    </>
                                ) : (
                                    <Skeleton className="h-5 w-48" />
                                )}
                            </dd>
                        </div>
                        <div className="space-y-1">
                            <dt className="text-muted-foreground">账户类型</dt>
                            <dd>
                                {data?.role === "admin" ? "管理员" : "普通用户"}
                            </dd>
                        </div>
                        <div className="space-y-1">
                            <dt className="text-muted-foreground">余额</dt>
                            <dd className="numeric">
                                {data ? formatMinor(data.balanceMinor) : "—"}
                            </dd>
                        </div>
                        <div className="space-y-1">
                            <dt className="text-muted-foreground">当前套餐</dt>
                            <dd>{data?.plan?.name ?? "未开通"}</dd>
                        </div>
                        <div className="space-y-1">
                            <dt className="text-muted-foreground">到期时间</dt>
                            <dd className="numeric">
                                {data?.plan
                                    ? formatDate(data.expiredAt ?? null)
                                    : "—"}
                            </dd>
                        </div>
                    </dl>
                    {data && !data.emailVerified ? (
                        <Alert variant="warning">
                            <MailWarning />
                            <AlertDescription className="space-y-field">
                                <div className="flex flex-wrap items-center justify-between gap-group">
                                    <span>验证邮箱后可通过邮箱找回密码。</span>
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
                                        {verify.isPending ? (
                                            <Loader2 className="animate-spin" />
                                        ) : null}
                                        发送验证邮件
                                    </Button>
                                </div>
                                {verify.isSuccess ? (
                                    <p>验证邮件已发送，30 分钟内有效</p>
                                ) : null}
                            </AlertDescription>
                        </Alert>
                    ) : null}
                </div>
            )}
        </ContentSection>
    );
}
