import { CircleAlert } from "lucide-react";
import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/loading-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { serverErrorMessage } from "@/lib/handle-server-error";
import { cn } from "@/lib/utils";
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
    error,
    submitDisabled,
    children,
    extra,
    wide,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: ReactNode;
    formId: string;
    submitLabel: string;
    pending?: boolean;
    /** A failed save, shown above the buttons where the user is looking. */
    error?: unknown;
    submitDisabled?: boolean;
    children: ReactNode;
    extra?: ReactNode;
    /** A wider sheet for long forms with side-by-side fields. */
    wide?: boolean;
}) {
    return (
        <Sheet
            open={open}
            onOpenChange={(value) => {
                if (value || !pending) onOpenChange(value);
            }}
        >
            <SheetContent
                {...(!description && { "aria-describedby": undefined })}
                className={cn(
                    "flex flex-col gap-0",
                    wide ? "w-full sm:max-w-lg" : "sm:max-w-md",
                )}
            >
                <SheetHeader className="text-start">
                    <SheetTitle>{title}</SheetTitle>
                    {description ? (
                        <SheetDescription>{description}</SheetDescription>
                    ) : null}
                </SheetHeader>
                <div className="flex-1 space-y-group overflow-y-auto px-card pb-card">
                    {children}
                    {extra}
                </div>
                {error && !pending ? (
                    <Alert
                        variant="destructive"
                        className="mx-card mb-card w-auto"
                    >
                        <CircleAlert />
                        <AlertDescription>
                            保存失败：{serverErrorMessage(error)}
                        </AlertDescription>
                    </Alert>
                ) : null}
                <SheetFooter className="flex-col-reverse gap-inline border-t sm:flex-row sm:justify-end">
                    <SheetClose asChild>
                        <Button variant="outline" disabled={pending}>
                            取消
                        </Button>
                    </SheetClose>
                    <LoadingButton
                        form={formId}
                        type="submit"
                        loading={pending}
                        disabled={submitDisabled}
                    >
                        {submitLabel}
                    </LoadingButton>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
