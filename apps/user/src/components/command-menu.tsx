import React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
    ArrowRight,
    ChevronRight,
    Laptop,
    Moon,
    Package,
    Server,
    Sun,
    User,
} from "lucide-react";
import { useAccount } from "@/api/hooks";
import { usePanel } from "@/api/panel";
import { useSearch } from "@/context/search-provider";
import { useTheme } from "@/context/theme-provider";
import { useWorkspace } from "@/hooks/use-workspace";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import type { NodeRow, PlanRow, UserRow } from "@/features/admin/types";
import { adminNav, userNav } from "./layout/data/sidebar-data";
import { ScrollArea } from "./ui/scroll-area";

export function CommandMenu() {
    const navigate = useNavigate();
    const { setTheme } = useTheme();
    const { open, setOpen } = useSearch();
    const { workspace } = useWorkspace();
    const account = useAccount();
    const isAdmin = account.data?.role === "admin";
    // Records are searchable from the admin console only, fetched when opened.
    const records = open && isAdmin && workspace === "admin";
    const users = usePanel<UserRow[]>("/admin/users", { enabled: records });
    const plans = usePanel<PlanRow[]>("/admin/plans", { enabled: records });
    const nodes = usePanel<NodeRow[]>("/admin/nodes", { enabled: records });
    const groups =
        workspace === "admin"
            ? [...adminNav, ...userNav.slice(0, 1)]
            : isAdmin
              ? [...userNav, ...adminNav]
              : userNav;

    const runCommand = React.useCallback(
        (command: () => unknown) => {
            setOpen(false);
            command();
        },
        [setOpen],
    );

    return (
        <CommandDialog modal open={open} onOpenChange={setOpen}>
            <CommandInput placeholder="搜索页面、操作或记录…" />
            <CommandList>
                <ScrollArea type="hover" className="h-72 pe-1">
                    <CommandEmpty>没有找到结果。</CommandEmpty>
                    {groups.map((group) => (
                        <CommandGroup key={group.title} heading={group.title}>
                            {group.items.map((navItem, i) => {
                                if (navItem.url)
                                    return (
                                        <CommandItem
                                            key={`${navItem.url}-${i}`}
                                            value={`${group.title} ${navItem.title}`}
                                            onSelect={() => {
                                                runCommand(() =>
                                                    navigate({
                                                        to: navItem.url,
                                                    }),
                                                );
                                            }}
                                        >
                                            <div className="flex size-4 items-center justify-center">
                                                <ArrowRight className="size-2 text-muted-foreground/80" />
                                            </div>
                                            {navItem.title}
                                        </CommandItem>
                                    );
                                return navItem.items?.map((subItem, i) => (
                                    <CommandItem
                                        key={`${navItem.title}-${subItem.url}-${i}`}
                                        value={`${navItem.title} ${subItem.title}`}
                                        onSelect={() => {
                                            runCommand(() =>
                                                navigate({ to: subItem.url }),
                                            );
                                        }}
                                    >
                                        <div className="flex size-4 items-center justify-center">
                                            <ArrowRight className="size-2 text-muted-foreground/80" />
                                        </div>
                                        {navItem.title} <ChevronRight />{" "}
                                        {subItem.title}
                                    </CommandItem>
                                ));
                            })}
                        </CommandGroup>
                    ))}
                    {records && users.data?.length ? (
                        <CommandGroup heading="用户">
                            {users.data.map((user) => (
                                <CommandItem
                                    key={`user-${user.id}`}
                                    value={`用户 ${user.email} ${user.id}`}
                                    onSelect={() =>
                                        runCommand(() =>
                                            navigate({
                                                to: "/admin/users",
                                                search: { user: user.id },
                                            }),
                                        )
                                    }
                                >
                                    <User />
                                    <span className="truncate">
                                        {user.email}
                                    </span>
                                    <span className="numeric ms-auto text-xs text-muted-foreground">
                                        #{user.id}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ) : null}
                    {records && plans.data?.length ? (
                        <CommandGroup heading="套餐">
                            {plans.data.map((plan) => (
                                <CommandItem
                                    key={`plan-${plan.id}`}
                                    value={`套餐 ${plan.name} ${plan.id}`}
                                    onSelect={() =>
                                        runCommand(() =>
                                            navigate({
                                                to: "/admin/plans",
                                                search: { edit: plan.id },
                                            }),
                                        )
                                    }
                                >
                                    <Package />
                                    {plan.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ) : null}
                    {records && nodes.data?.length ? (
                        <CommandGroup heading="节点">
                            {nodes.data.map((node) => (
                                <CommandItem
                                    key={`node-${node.id}`}
                                    value={`节点 ${node.name} ${node.host} ${node.id}`}
                                    onSelect={() =>
                                        runCommand(() =>
                                            navigate({
                                                to: "/admin/nodes",
                                                search: { edit: node.id },
                                            }),
                                        )
                                    }
                                >
                                    <Server />
                                    {node.name}
                                    <span className="numeric ms-auto text-xs text-muted-foreground">
                                        {node.host}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ) : null}
                    <CommandSeparator />
                    <CommandGroup heading="主题">
                        <CommandItem
                            onSelect={() => runCommand(() => setTheme("light"))}
                        >
                            <Sun /> <span>浅色</span>
                        </CommandItem>
                        <CommandItem
                            onSelect={() => runCommand(() => setTheme("dark"))}
                        >
                            <Moon className="scale-90" />
                            <span>深色</span>
                        </CommandItem>
                        <CommandItem
                            onSelect={() =>
                                runCommand(() => setTheme("system"))
                            }
                        >
                            <Laptop />
                            <span>跟随系统</span>
                        </CommandItem>
                    </CommandGroup>
                </ScrollArea>
            </CommandList>
        </CommandDialog>
    );
}
