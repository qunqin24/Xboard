import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowAction =
    | {
          label: string;
          icon?: React.ComponentType<{ size?: number }>;
          onSelect: () => void;
          destructive?: boolean;
          disabled?: boolean;
      }
    | "separator";

/** Upstream's "⋯" row menu, driven by a list of actions. */
export function RowActions({ actions }: { actions: RowAction[] }) {
    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
                    onClick={(event) => event.stopPropagation()}
                >
                    <DotsHorizontalIcon className="h-4 w-4" />
                    <span className="sr-only">更多操作</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-44"
                onClick={(event) => event.stopPropagation()}
            >
                {actions.map((action, index) =>
                    action === "separator" ? (
                        <DropdownMenuSeparator key={index} />
                    ) : (
                        <DropdownMenuItem
                            key={action.label}
                            disabled={action.disabled}
                            variant={
                                action.destructive ? "destructive" : "default"
                            }
                            onClick={action.onSelect}
                        >
                            {action.label}
                            {action.icon ? (
                                <DropdownMenuShortcut>
                                    <action.icon size={16} />
                                </DropdownMenuShortcut>
                            ) : null}
                        </DropdownMenuItem>
                    ),
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
