import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while the first page after sign-in waits for the account: the sidebar
 * and page header drawn as shapes in their real positions and sizes.
 */
export function ShellSkeleton() {
    return (
        <div
            className="flex min-h-svh w-full gap-page p-page"
            aria-busy="true"
            aria-label="正在加载"
        >
            <div className="hidden w-64 shrink-0 flex-col gap-group md:flex">
                <Skeleton className="h-10" />
                {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-8" />
                ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-page">
                <Skeleton className="h-9" />
                <Skeleton className="h-8 w-48" />
                <div className="grid gap-page lg:grid-cols-3">
                    <Skeleton shape="card" className="h-72 lg:col-span-2" />
                    <Skeleton shape="card" className="h-72" />
                </div>
            </div>
        </div>
    );
}
