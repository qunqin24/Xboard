import { Page } from "@/components/layout/page";
import { TicketDesk } from "@/features/tickets/ticket-desk";

export function AdminTickets() {
    return (
        <Page title="工单" help="工单关闭后，用户仍可重新打开。" fixed>
            <TicketDesk staff />
        </Page>
    );
}
