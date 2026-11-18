import { useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "./ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
import { Textarea } from "./ui/textarea";

export function SecretDialog({
    title,
    description,
    value,
    onClose,
}: {
    title: string;
    description: string;
    value: string | null;
    onClose: () => void;
}) {
    const [copied, setCopied] = useState(false);
    return (
        <Dialog open={value !== null}>
            <DialogContent
                showCloseButton={false}
                onEscapeKeyDown={(event) => event.preventDefault()}
                onInteractOutside={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <Textarea
                    readOnly
                    aria-label={title}
                    value={value ?? ""}
                    rows={value?.split("\n").length ?? 1}
                    className="numeric break-all"
                    onFocus={(event) => event.target.select()}
                />
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(
                                    value ?? "",
                                );
                                setCopied(true);
                            } catch {
                                toast.error("无法访问剪贴板，请手动复制。");
                            }
                        }}
                    >
                        <Copy /> {copied ? "已复制" : "复制"}
                    </Button>
                    <Button
                        onClick={() => {
                            setCopied(false);
                            onClose();
                        }}
                    >
                        我已保存
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
