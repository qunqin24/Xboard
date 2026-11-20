import { type ReactNode } from "react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

/** A titled group of related settings inside a section. */
export function SettingsCard({
    title,
    description,
    children,
}: {
    title: string;
    /** One line saying what the group controls and how it is saved. */
    description?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                {description ? (
                    <CardDescription>{description}</CardDescription>
                ) : null}
            </CardHeader>
            <CardContent className="space-y-group">{children}</CardContent>
        </Card>
    );
}
