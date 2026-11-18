import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { NewTicketDialog, TicketDesk } from "@/features/tickets/ticket-desk";

export function Tickets() {
    const [open, setOpen] = useState(false);
    return (
        <Page
            title="工单"
            fixed
            actions={
                <Button onClick={() => setOpen(true)}>
                    <MessageSquarePlus />
                    提交工单
                </Button>
            }
        >
            <TicketDesk />
            <NewTicketDialog
                open={open}
                onOpenChange={setOpen}
                onCreated={() => undefined}
            />
        </Page>
    );
}
