import { Loader2 } from "lucide-react";
import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";

/** Upstream's mutate-drawer: a right-hand sheet wrapping one form (by id). */
export function EditorSheet({
    open,
    onOpenChange,
    title,
    description,
    formId,
    submitLabel,
    pending,
    children,
    extra,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: ReactNode;
    formId: string;
    submitLabel: string;
    pending?: boolean;
    children: ReactNode;
    extra?: ReactNode;
}) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="flex flex-col gap-0 sm:max-w-md">
                <SheetHeader className="text-start">
                    <SheetTitle>{title}</SheetTitle>
                    {description ? (
                        <SheetDescription>{description}</SheetDescription>
                    ) : null}
                </SheetHeader>
                <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
                    {children}
                    {extra}
                </div>
                <SheetFooter className="gap-2 border-t">
                    <Button form={formId} type="submit" disabled={pending}>
                        {pending ? <Loader2 className="animate-spin" /> : null}
                        {submitLabel}
                    </Button>
                    <SheetClose asChild>
                        <Button variant="outline">取消</Button>
                    </SheetClose>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
