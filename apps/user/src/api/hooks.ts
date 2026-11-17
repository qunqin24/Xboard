import {
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import {
    api,
    ApiError,
    requireData,
    type Account,
    type Plan,
} from "@xboard/api-client";

export const accountQuery = queryOptions({
    queryKey: ["account"],
    queryFn: async () => requireData(await api.GET("/api/account")),
});

export const plansQuery = queryOptions({
    queryKey: ["plans"],
    queryFn: async () => requireData(await api.GET("/api/plans")) as Plan[],
});

export function useAccount() {
    return useQuery(accountQuery);
}

export function usePlans(enabled: boolean) {
    return useQuery({ ...plansQuery, enabled });
}

export function useLogin() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: { email: string; password: string }) =>
            requireData(await api.POST("/api/auth/login", { body: input })),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: accountQuery.queryKey,
            });
        },
    });
}

export function useRegister() {
    return useMutation({
        mutationFn: async (input: { email: string; password: string }) =>
            requireData(await api.POST("/api/auth/register", { body: input })),
    });
}

export function useLogout() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const result = await api.POST("/api/auth/logout");
            if (!result.response.ok)
                throw new ApiError(
                    result.response.status,
                    "退出失败，请重试。",
                );
        },
        onSuccess: () => queryClient.clear(),
    });
}

export type { Account, Plan };

export function useOrders() {
    return useQuery({
        queryKey: ["orders"],
        queryFn: async () => requireData(await api.GET("/api/orders")),
    });
}

export function useCreateOrder() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: async (input: {
            planId: number;
            period: "monthly" | "quarterly" | "yearly";
            requestId: string;
        }) => requireData(await api.POST("/api/orders", { body: input })),
        onSuccess: () => client.invalidateQueries({ queryKey: ["orders"] }),
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
        }) =>
            requireData(
                await api.POST(
                    action === "pay"
                        ? "/api/orders/{id}/pay"
                        : "/api/orders/{id}/cancel",
                    { params: { path: { id } } },
                ),
            ),
        onSuccess: async () => {
            await Promise.all([
                client.invalidateQueries({ queryKey: ["orders"] }),
                client.invalidateQueries({ queryKey: ["account"] }),
            ]);
        },
    });
}
