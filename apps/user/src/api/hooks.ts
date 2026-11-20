import {
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import type {
    Account,
    AuthResult,
    CreateOrderBody,
    LoginBody,
    Order,
    Plan,
    RegisterBody,
    RegisterCodeResult,
} from "@xboard/contracts";
import { request } from "./client";
import { useHeldPending } from "./held-pending";

export const accountQuery = queryOptions({
    queryKey: ["account"],
    queryFn: () => request<Account>("/account"),
});

export const plansQuery = queryOptions({
    queryKey: ["plans"],
    queryFn: () => request<Plan[]>("/plans"),
});

export function useAccount() {
    return useHeldPending(useQuery(accountQuery));
}

export function usePlans(enabled: boolean) {
    return useHeldPending(useQuery({ ...plansQuery, enabled }));
}

export function useLogin() {
    const queryClient = useQueryClient();
    return useMutation({
        meta: { silentError: true },
        mutationFn: (input: LoginBody) =>
            request<AuthResult>("/auth/login", "POST", input),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: accountQuery.queryKey,
            });
        },
    });
}

export function useRegister() {
    return useMutation({
        mutationFn: (input: RegisterBody) =>
            request<AuthResult>("/auth/register", "POST", input),
    });
}

export function useRegisterCode() {
    return useMutation({
        mutationFn: (input: { email: string; captchaToken?: string }) =>
            request<RegisterCodeResult>("/auth/register/code", "POST", input),
    });
}

export function useLogout() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => request<void>("/auth/logout", "POST"),
        onSuccess: () => queryClient.clear(),
    });
}

export type { Account, Plan };

export function useOrders() {
    return useHeldPending(
        useQuery({
            queryKey: ["orders"],
            queryFn: () => request<Order[]>("/orders"),
        }),
    );
}

/** One order; polls while it awaits payment so a gateway receipt shows up. */
export function useOrder(id: string) {
    return useHeldPending(
        useQuery({
            queryKey: ["orders", id],
            queryFn: () => request<Order>(`/orders/${id}`),
            refetchInterval: (query) =>
                query.state.data?.status === "pending" ? 5_000 : false,
        }),
    );
}

export function useCreateOrder() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateOrderBody) =>
            request<Order>("/orders", "POST", input),
        onSuccess: (order) => {
            // The checkout page opens on this order without a second fetch.
            client.setQueryData(["orders", order.id], order);
            // Not awaited: the button is released when the order exists.
            void client.invalidateQueries({
                queryKey: ["orders"],
                exact: true,
            });
        },
    });
}

export function useOrderAction() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: async ({
            id,
            action,
        }: {
            id: string;
            action: "pay" | "cancel";
        }) => request<Order>(`/orders/${id}/${action}`, "POST"),
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: ["orders"] });
            void client.invalidateQueries({ queryKey: ["account"] });
        },
    });
}
