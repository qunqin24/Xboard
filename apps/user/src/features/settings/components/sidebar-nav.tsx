import { type JSX } from "react";
import { useLocation, Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type SidebarNavProps = React.HTMLAttributes<HTMLElement> & {
    items: {
        href: string;
        title: string;
        icon: JSX.Element;
    }[];
};

export function SidebarNav({ className, items, ...props }: SidebarNavProps) {
    const { pathname } = useLocation();

    return (
        <nav
            aria-label="设置导航"
            className={cn(
                "flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible",
                className,
            )}
            {...props}
        >
            {items.map((item) => {
                const active = pathname === item.href;
                return (
                    <Button
                        key={item.href}
                        asChild
                        variant="ghost"
                        className={cn(
                            "justify-start",
                            active && "bg-muted font-medium",
                        )}
                    >
                        <Link
                            to={item.href}
                            aria-current={active ? "page" : undefined}
                        >
                            {item.icon}
                            {item.title}
                        </Link>
                    </Button>
                );
            })}
        </nav>
    );
}
