import type { Locale } from "@xboard/contracts";
import { useCommand, usePanel } from "@/api/panel";
import { LocaleSelect } from "@/components/locale-control";
import { Label } from "@/components/ui/label";
import { serverErrorMessage } from "@/lib/handle-server-error";
import { SettingsCard } from "./settings-card";

export function LanguageSettings() {
    const path = "/admin/settings/locale";
    const setting = usePanel<{ locale: Locale }>(path);
    const update = useCommand({ inline: true });
    return (
        <SettingsCard title="语言" description="选择后立即生效，无需保存。">
            <div className="grid justify-items-start gap-field">
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
            </div>
        </SettingsCard>
    );
}
