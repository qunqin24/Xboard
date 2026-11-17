import { Page } from "@/components/layout/page";
import { TicketDesk } from "@/features/tickets/ticket-desk";

export function AdminTickets() {
    return (
        <Page
            title="工单"
            description="回复用户的问题；关闭后用户仍可以重新打开。"
            fixed
        >
            <TicketDesk staff />
        </Page>
    );
}
