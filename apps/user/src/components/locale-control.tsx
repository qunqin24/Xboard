import { useState } from "react";
import { localeSchema, type Locale } from "@xboard/contracts";
import { request } from "@/api/client";
import { currentLocale, storeLocale } from "@/i18n";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { serverErrorMessage } from "@/lib/handle-server-error";

export function LocaleSelect({
    id,
    value,
    onChange,
    disabled,
}: {
    id: string;
    value: Locale;
    onChange: (locale: Locale) => void;
    disabled?: boolean;
}) {
    return (
        <select
            id={id}
            className="h-9 rounded-control border bg-background px-field"
            value={value}
            disabled={disabled}
            onChange={(event) =>
                onChange(localeSchema.parse(event.target.value))
            }
        >
            <option value="zh-CN" lang="zh-CN">
                简体中文
            </option>
            <option value="en-US" lang="en-US">
                English
            </option>
        </select>
    );
}
export function LocaleControl({ account = false }: { account?: boolean }) {
    const [saving, setSaving] = useState(false);
    return (
        <div className="flex flex-wrap items-center gap-inline">
            <Label htmlFor="account-locale">
                {currentLocale() === "en-US" ? "Language" : "语言"}
            </Label>
            <LocaleSelect
                id="account-locale"
                value={currentLocale()}
                disabled={saving}
                onChange={async (locale) => {
                    setSaving(true);
                    try {
                        if (account)
                            await request("/account/locale", "PUT", { locale });
                        storeLocale(locale);
                        window.location.reload();
                    } catch (error) {
                        toast.error(serverErrorMessage(error));
                        setSaving(false);
                    }
                }}
            />
        </div>
    );
}
