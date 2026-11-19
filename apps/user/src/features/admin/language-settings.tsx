import type { Locale } from "@xboard/contracts";
import { useCommand, usePanel } from "@/api/panel";
import { LocaleSelect } from "@/components/locale-control";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverErrorMessage } from "@/lib/handle-server-error";

export function LanguageSettings() {
    const path = "/admin/settings/locale";
    const setting = usePanel<{ locale: Locale }>(path);
    const update = useCommand({ inline: true });
    return (
        <Card className="max-w-3xl">
            <CardHeader>
                <CardTitle>语言</CardTitle>
            </CardHeader>
            <CardContent className="grid justify-items-start gap-field">
                <Label htmlFor="site-locale">访客默认语言</Label>
                {setting.data ? (
                    <LocaleSelect
                        id="site-locale"
                        value={setting.data.locale}
                        disabled={update.isPending}
                        onChange={(locale) =>
                            update.mutate({
                                path,
                                method: "PUT",
                                body: { locale },
                            })
                        }
                    />
                ) : null}
                {update.error || setting.error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {serverErrorMessage(update.error ?? setting.error)}
                    </p>
                ) : null}
            </CardContent>
        </Card>
    );
}
