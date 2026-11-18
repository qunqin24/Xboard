import { SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearch } from "@/context/search-provider";
import { Button } from "./ui/button";

export function Search({
    className = "",
    placeholder = "搜索…",
    ...props
}: React.ComponentProps<"button"> & { placeholder?: string }) {
    const { setOpen } = useSearch();
    return (
        <Button
            {...props}
            variant="outline"
            className={cn(
                "group relative h-8 w-full flex-1 justify-start bg-muted/25 text-sm font-normal text-muted-foreground shadow-none hover:bg-accent sm:w-40 sm:pe-12 md:flex-none lg:w-52 xl:w-64",
                className,
            )}
            aria-keyshortcuts="Meta+K Control+K"
            onClick={() => setOpen(true)}
        >
            <SearchIcon
                aria-hidden="true"
                className="absolute inset-s-2 top-1/2 -translate-y-1/2"
                size={16}
            />
            <span className="ms-5">{placeholder}</span>
            <kbd className="pointer-events-none absolute inset-e-1 top-1/2 hidden h-6 -translate-y-1/2 items-center gap-1 rounded-inner border bg-muted px-1 font-mono text-xs font-medium opacity-100 select-none group-hover:bg-accent sm:flex">
                <span className="text-xs">⌘</span>K
            </kbd>
        </Button>
    );
}
