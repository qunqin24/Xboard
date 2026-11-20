import { type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useCommand, usePanel } from "@/api/panel";
import { ErrorState } from "@/components/error-state";
import { Page } from "@/components/layout/page";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { CommissionSettings } from "./commission-settings";
import { LanguageSettings } from "./language-settings";
import { ApplicationKey, GroupCard } from "./operational-settings";
import { PaymentSettings } from "./payment-settings";
import { SettingsNav, type SectionMark } from "./settings-nav";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./settings-sections";
import {
    EmailRulesCard,
    LegalLinksCard,
    ReminderCard,
    RegistrationCard,
    SiteBasicsCard,
    TrialCard,
} from "./site-settings-fields";
import {
    FORM_SECTIONS,
    SECTION_FIELDS,
    siteSettingsSchema,
    toBody,
    toValues,
    type FormSection,
    type Values,
} from "./site-settings-form";
import { TelegramSettings } from "./telegram-settings";
import { VersionSettings } from "./version-settings";
import type { PlanRow, SiteSettings } from "./types";

const FORM_ID = "site-settings";

function sectionContent(section: SettingsSectionId, plans: PlanRow[]) {
    switch (section) {
        case "site":
            return (
                <>
                    <SiteBasicsCard />
                    <LanguageSettings />
                </>
            );
        case "registration":
            return (
                <>
                    <RegistrationCard />
                    <EmailRulesCard />
                    <TrialCard plans={plans} />
                    <LegalLinksCard />
                </>
            );
        case "mail":
            return (
                <>
                    <GroupCard group="mail" />
                    <ReminderCard />
                </>
            );
        case "notifications":
            return (
                <>
                    <TelegramSettings />
                    <GroupCard group="alerts" />
                </>
            );
        case "payments":
            return <PaymentSettings />;
        case "commission":
            return <CommissionSettings />;
        case "security":
            return (
                <>
                    <GroupCard group="captcha" />
                    <ApplicationKey />
                </>
            );
        case "backup":
            return <GroupCard group="backup" />;
        case "about":
            return <VersionSettings />;
    }
}

/**
 * Appears while the shared site form has unsaved changes. Site, registration
 * and reminder fields sit in different sections but save together.
 */
function SaveBar({
    dirtySections,
    pending,
    onDiscard,
}: {
    dirtySections: FormSection[];
    pending: boolean;
    onDiscard: () => void;
}) {
    if (dirtySections.length === 0) return null;
    const titles = dirtySections.map(
        (id) => SETTINGS_SECTIONS.find((section) => section.id === id)?.title,
    );
    return (
        <div
            role="region"
            aria-label="未保存的修改"
            className="sticky bottom-page z-10 flex flex-wrap items-center justify-between gap-group rounded-surface border bg-background p-3 shadow-lg"
        >
            <p className="text-sm">{`未保存的修改：${titles.join(" · ")}`}</p>
            <div className="flex gap-inline">
                <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={onDiscard}
                >
                    放弃修改
                </Button>
                <LoadingButton type="submit" form={FORM_ID} loading={pending}>
                    保存
                </LoadingButton>
            </div>
        </div>
    );
}

function SettingsForm({
    settings,
    plans,
}: {
    settings: SiteSettings;
    plans: PlanRow[];
}) {
    const save = useCommand();
    const navigate = useNavigate();
    const { section = "site" } = useSearch({
        from: "/_authenticated/admin/settings",
    });
    const form = useForm<Values>({
        resolver: zodResolver(siteSettingsSchema),
        defaultValues: toValues(settings),
    });
    const { errors, dirtyFields } = form.formState;
    const sectionHas = (
        fields: Record<string, unknown>,
        id: FormSection,
    ): boolean => SECTION_FIELDS[id].some((field) => field in fields);

    const marks: Partial<Record<SettingsSectionId, SectionMark>> = {};
    const dirtySections: FormSection[] = [];
    for (const id of FORM_SECTIONS) {
        if (sectionHas(errors, id)) marks[id] = "error";
        else if (sectionHas(dirtyFields, id)) marks[id] = "dirty";
        if (sectionHas(dirtyFields, id)) dirtySections.push(id);
    }
    const active = SETTINGS_SECTIONS.find((item) => item.id === section);

    const open = (id: SettingsSectionId) =>
        void navigate({
            to: "/admin/settings",
            search: { section: id },
            replace: true,
        });

    return (
        <Page title="系统设置">
            <Form {...form}>
                {/* The site form spans several sections, so its fields sit
                    outside this element and submit through the form attribute. */}
                <form
                    id={FORM_ID}
                    onSubmit={form.handleSubmit(
                        (values) => {
                            const body = toBody(values);
                            save.mutate(
                                {
                                    path: "/admin/settings/site",
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
                        // One save covers every section: show the section
                        // that holds the first invalid field.
                        (invalid) => {
                            const first = FORM_SECTIONS.find((id) =>
                                sectionHas(invalid, id),
                            );
                            if (first) open(first);
                        },
                    )}
                />
                <div className="flex flex-col gap-page lg:flex-row lg:items-start">
                    <aside className="lg:sticky lg:top-20 lg:w-48 lg:shrink-0">
                        <SettingsNav active={section} marks={marks} />
                    </aside>
                    <div className="flex min-w-0 flex-1 flex-col gap-page lg:max-w-3xl">
                        {active ? (
                            <SectionHeading
                                title={active.title}
                                description={active.description}
                            />
                        ) : null}
                        {sectionContent(section, plans)}
                        <SaveBar
                            dirtySections={dirtySections}
                            pending={save.isPending}
                            onDiscard={() => form.reset()}
                        />
                    </div>
                </div>
            </Form>
        </Page>
    );
}

function SectionHeading({
    title,
    description,
}: {
    title: string;
    description: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1">
            <h3 className="text-lg font-medium">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    );
}

export function AdminSettings() {
    const settings = usePanel<SiteSettings>("/admin/settings/site");
    const plans = usePanel<PlanRow[]>("/admin/plans");
    const error = settings.error ?? plans.error;
    if (settings.data && plans.data)
        return <SettingsForm settings={settings.data} plans={plans.data} />;
    return (
        <Page title="系统设置">
            {error ? (
                <ErrorState
                    error={error}
                    onRetry={() =>
                        Promise.all([settings.refetch(), plans.refetch()])
                    }
                />
            ) : (
                <Skeleton className="h-64 max-w-2xl" />
            )}
        </Page>
    );
}
