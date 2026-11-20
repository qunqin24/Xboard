import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./settings-sections";

export type SectionMark = "error" | "dirty";

/**
 * Section list: a column on desktop, a row that scrolls sideways on phones.
 * Each entry links to `?section=<id>` so a section can be bookmarked.
 */
export function SettingsNav({
    active,
    marks,
}: {
    active: SettingsSectionId;
    marks: Partial<Record<SettingsSectionId, SectionMark>>;
}) {
    const activeRef = useRef<HTMLAnchorElement>(null);
    useEffect(() => {
        activeRef.current?.scrollIntoView({
            block: "nearest",
            inline: "nearest",
        });
    }, [active]);
    return (
        <nav
            aria-label="设置分区"
            className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
        >
            {SETTINGS_SECTIONS.map(({ id, title, icon: Icon }) => {
                const mark = marks[id];
                return (
                    <Button
                        key={id}
                        asChild
                        variant="ghost"
                        className={cn(
                            "shrink-0 justify-start",
                            id === active && "bg-muted font-medium",
                        )}
                    >
                        <Link
                            ref={id === active ? activeRef : undefined}
                            to="/admin/settings"
                            search={{ section: id }}
                            replace
                            aria-current={id === active ? "page" : undefined}
                        >
                            <Icon />
                            {title}
                            {mark ? (
                                <span
                                    role="img"
                                    aria-label={
                                        mark === "error"
                                            ? "有错误"
                                            : "有未保存的修改"
                                    }
                                    className={cn(
                                        "size-2 rounded-full",
                                        mark === "error"
                                            ? "bg-destructive"
                                            : "bg-primary",
                                    )}
                                />
                            ) : null}
                        </Link>
                    </Button>
                );
            })}
        </nav>
    );
}
