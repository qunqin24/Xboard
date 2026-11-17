import { type ColumnDef } from "@tanstack/react-table";
import { usePanel } from "@/api/panel";
import {
    DataTable,
    DataTableColumnHeader,
    inFilter,
} from "@/components/data-table";
import { Page } from "@/components/layout/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, formatMinor, formatTraffic } from "@/lib/format";
import { cn } from "@/lib/utils";

type LedgerItem = {
    id: string;
    amountMinor: number;
    createdAt: string;
    reason?: string | null;
};
type TrafficItem = {
    id: number;
    upload: string;
    download: string;
    createdAt: string;
    node: { name: string };
};

const ledgerColumns: ColumnDef<LedgerItem>[] = [
    {
        id: "reason",
        accessorFn: (item) => item.reason ?? "套餐支付",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="说明" />
        ),
        meta: { title: "说明" },
    },
    {
        accessorKey: "amountMinor",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="金额" />
        ),
        cell: ({ row }) => (
            <span
                className={cn(
                    "numeric",
                    row.original.amountMinor > 0 &&
                        "text-emerald-600 dark:text-emerald-400",
                )}
            >
                {row.original.amountMinor > 0 ? "+" : ""}
                {formatMinor(row.original.amountMinor)}
            </span>
        ),
        meta: {
            title: "金额",
            exportValue: (item) => (item.amountMinor / 100).toFixed(2),
        },
    },
    {
        accessorKey: "createdAt",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="时间" />
        ),
        cell: ({ row }) => (
            <span className="numeric text-muted-foreground">
                {formatDateTime(row.original.createdAt)}
            </span>
        ),
        meta: { title: "时间" },
    },
];

const trafficColumns: ColumnDef<TrafficItem>[] = [
    {
        id: "node",
        accessorFn: (item) => item.node.name,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="节点" />
        ),
        meta: { title: "节点" },
        filterFn: inFilter,
    },
    {
        id: "upload",
        accessorFn: (item) => Number(item.upload),
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="上传" />
        ),
        cell: ({ row }) => (
            <span className="numeric">
                {formatTraffic(row.original.upload)}
            </span>
        ),
        meta: { title: "上传", exportValue: (item) => item.upload },
    },
    {
        id: "download",
        accessorFn: (item) => Number(item.download),
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="下载" />
        ),
        cell: ({ row }) => (
            <span className="numeric">
                {formatTraffic(row.original.download)}
            </span>
        ),
        meta: { title: "下载", exportValue: (item) => item.download },
    },
    {
        accessorKey: "createdAt",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="上报时间" />
        ),
        cell: ({ row }) => (
            <span className="numeric text-muted-foreground">
                {formatDateTime(row.original.createdAt)}
            </span>
        ),
        meta: { title: "上报时间" },
    },
];

export function Records() {
    const ledger = usePanel<LedgerItem[]>("/account/ledger");
    const traffic = usePanel<TrafficItem[]>("/account/traffic");
    const nodes = [...new Set(traffic.data?.map((item) => item.node.name))];

    return (
        <Page
            title="使用记录"
            description="最近 100 条余额变动和节点流量上报。"
        >
            <Tabs defaultValue="ledger" className="space-y-2">
                <TabsList>
                    <TabsTrigger value="ledger">余额流水</TabsTrigger>
                    <TabsTrigger value="traffic">流量记录</TabsTrigger>
                </TabsList>
                <TabsContent value="ledger">
                    <DataTable
                        data={ledger.data}
                        isLoading={ledger.isPending}
                        columns={ledgerColumns}
                        getRowId={(item) => item.id}
                        searchPlaceholder="搜索说明…"
                        exportName="余额流水"
                        emptyText="还没有余额变动。"
                        initialSorting={[{ id: "createdAt", desc: true }]}
                    />
                </TabsContent>
                <TabsContent value="traffic">
                    <DataTable
                        data={traffic.data}
                        isLoading={traffic.isPending}
                        columns={trafficColumns}
                        getRowId={(item) => String(item.id)}
                        searchPlaceholder="搜索节点…"
                        exportName="流量记录"
                        emptyText="节点上报后会显示在这里。"
                        filters={[
                            {
                                columnId: "node",
                                title: "节点",
                                options: nodes.map((n) => ({
                                    label: n,
                                    value: n,
                                })),
                            },
                        ]}
                        initialSorting={[{ id: "createdAt", desc: true }]}
                    />
                </TabsContent>
            </Tabs>
        </Page>
    );
}
