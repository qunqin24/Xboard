import { createFileRoute } from "@tanstack/react-router";
import { Checkout } from "@/features/user/checkout";

export const Route = createFileRoute("/_authenticated/orders_/$id")({
    component: CheckoutRoute,
});

function CheckoutRoute() {
    const { id } = Route.useParams();
    return <Checkout key={id} id={id} />;
}
