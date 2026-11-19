import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ApiError, request } from "@/api/client";
import { AuthLayout } from "../auth-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/loading-button";
import { serverErrorMessage } from "@/lib/handle-server-error";

export const setupQuery = {
    queryKey: ["setup-required"],
    staleTime: 15_000,
    retry: false,
    queryFn: async () => {
        try {
            await request("/setup");
            return true;
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) return false;
            throw error;
        }
    },
};

export function Setup() {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<unknown>();
    const client = useQueryClient();
    const navigate = useNavigate();
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPending(true);
        setError(undefined);
        try {
            await request(
                "/setup",
                "POST",
                Object.fromEntries(new FormData(event.currentTarget)),
            );
            client.setQueryData(setupQuery.queryKey, false);
            await navigate({ to: "/sign-in", replace: true });
        } catch (failure) {
            setError(failure);
        } finally {
            setPending(false);
        }
    }
    return (
        <AuthLayout>
            <Card className="w-full gap-group">
                <CardHeader>
                    <CardTitle>创建管理员</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={submit} className="space-y-group">
                        {error ? (
                            <Alert variant="destructive">
                                <AlertDescription>
                                    {serverErrorMessage(error)}
                                </AlertDescription>
                            </Alert>
                        ) : null}
                        <div className="grid gap-field">
                            <Label htmlFor="setup-code">安装码</Label>
                            <Input
                                id="setup-code"
                                name="code"
                                type="password"
                                autoComplete="off"
                                aria-describedby="setup-code-help"
                                required
                            />
                            <p
                                id="setup-code-help"
                                className="text-sm text-muted-foreground"
                            >
                                从 API 日志复制 <code>setup.available</code>{" "}
                                的安装码。
                            </p>
                        </div>
                        <div className="grid gap-field">
                            <Label htmlFor="setup-email">邮箱</Label>
                            <Input
                                id="setup-email"
                                name="email"
                                type="email"
                                autoComplete="username"
                                maxLength={64}
                                required
                            />
                        </div>
                        <div className="grid gap-field">
                            <Label htmlFor="setup-password">密码</Label>
                            <Input
                                id="setup-password"
                                name="password"
                                type="password"
                                autoComplete="new-password"
                                minLength={12}
                                maxLength={128}
                                required
                            />
                        </div>
                        <LoadingButton
                            type="submit"
                            loading={pending}
                            className="w-full"
                        >
                            创建管理员
                        </LoadingButton>
                    </form>
                </CardContent>
            </Card>
        </AuthLayout>
    );
}
