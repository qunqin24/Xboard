import { Link } from "@tanstack/react-router";
import { useAccount } from "@/api/hooks";
import { useWorkspace } from "@/hooks/use-workspace";
import useDialogState from "@/hooks/use-dialog-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutDialog } from "@/components/sign-out-dialog";

export function ProfileDropdown() {
    const [open, setOpen] = useDialogState();
    const account = useAccount();
    const { workspace } = useWorkspace();
    const email = account.data?.email ?? "";

    return (
        <>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className="relative h-8 w-8 rounded-full"
                        aria-label="账户菜单"
                    >
                        <Avatar className="h-8 w-8">
                            <AvatarFallback className="uppercase">
                                {email.slice(0, 2) || "?"}
                            </AvatarFallback>
                        </Avatar>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col gap-1">
                            <p className="truncate text-sm leading-none font-medium">
                                {email}
                            </p>
                            <p className="text-xs leading-none text-muted-foreground">
                                {account.data?.role === "admin"
                                    ? "管理员"
                                    : "用户"}
                            </p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                        <DropdownMenuItem asChild>
                            <Link to="/settings">账户设置</Link>
                        </DropdownMenuItem>
                        {account.data?.role === "admin" ? (
                            workspace === "admin" ? (
                                <DropdownMenuItem asChild>
                                    <Link to="/">返回用户中心</Link>
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem asChild>
                                    <Link to="/admin">进入管理后台</Link>
                                </DropdownMenuItem>
                            )
                        ) : null}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setOpen(true)}
                    >
                        退出登录
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <SignOutDialog open={!!open} onOpenChange={setOpen} />
        </>
    );
}
