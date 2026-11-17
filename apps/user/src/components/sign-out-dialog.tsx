import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useLogout } from "@/api/hooks";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface SignOutDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
    const navigate = useNavigate();
    const logout = useLogout();

    const handleSignOut = async () => {
        try {
            await logout.mutateAsync();
            onOpenChange(false);
            await navigate({ to: "/sign-in", replace: true });
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "退出失败，请重试。",
            );
        }
    };

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="退出登录"
            desc="退出后需要重新输入邮箱和密码才能访问账户。"
            confirmText="退出"
            destructive
            isLoading={logout.isPending}
            handleConfirm={() => void handleSignOut()}
            className="sm:max-w-sm"
        />
    );
}
