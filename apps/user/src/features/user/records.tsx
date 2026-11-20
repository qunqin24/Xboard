import { type ColumnDef } from "@tanstack/react-table";
import type { LedgerItem, TrafficItem } from "@xboard/contracts";
import {
    ArrowDown,
    ArrowDownLeft,
    ArrowUp,
    ArrowUpRight,
    Banknote,
    Clock,
    Server,
} from "lucide-react";
import { usePanel } from "@/api/panel";
import {
    DataTable,
    DataTableColumnHeader,
    inFilter,
} from "@/components/data-table";
import { Page } from "@/components/layout/page";
import { IconBlock } from "@/components/ui/icon-block";
import { IconText } from "@/components/icon-text";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, formatMinor, formatTraffic } from "@/lib/format";
import { cn } from "@/lib/utils";

const ledgerColumns: ColumnDef<LedgerItem>[] = [
    {
        id: "reason",
        accessorFn: (item) => item.reason ?? "套餐支付",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="说明" />
        ),
        cell: ({ row, getValue }) => {
            const income = row.original.amountMinor > 0;
            return (
                <div className="flex items-center gap-3">
                    <IconBlock size="sm" tone={income ? "brand" : "neutral"}>
                        {income ? <ArrowDownLeft /> : <ArrowUpRight />}
                    </IconBlock>
                    <span className="font-medium">{getValue<string>()}</span>
                </div>
            );
        },
        meta: { title: "说明" },
    },
    {
        accessorKey: "amountMinor",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="金额" />
        ),
        cell: ({ row }) => (
            <IconText
                icon={Banknote}
                className={cn(row.original.amountMinor > 0 && "text-success")}
            >
                {row.original.amountMinor > 0 ? "+" : ""}
                {formatMinor(row.original.amountMinor)}
            </IconText>
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
            <IconText icon={Clock} className="text-muted-foreground">
                {formatDateTime(row.original.createdAt)}
            </IconText>
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
        cell: ({ getValue }) => (
            <div className="flex items-center gap-3">
                <IconBlock size="sm">
                    <Server />
                </IconBlock>
                <span className="font-medium">{getValue<string>()}</span>
            </div>
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
            <IconText icon={ArrowUp}>
                {formatTraffic(row.original.upload)}
            </IconText>
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
            <IconText icon={ArrowDown}>
                {formatTraffic(row.original.download)}
            </IconText>
        ),
        meta: { title: "下载", exportValue: (item) => item.download },
    },
    {
        accessorKey: "createdAt",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="上报时间" />
        ),
        cell: ({ row }) => (
            <IconText icon={Clock} className="text-muted-foreground">
                {formatDateTime(row.original.createdAt)}
            </IconText>
        ),
        meta: { title: "上报时间" },
    },
];

export function Records() {
    const ledger = usePanel<LedgerItem[]>("/account/ledger");
    const traffic = usePanel<TrafficItem[]>("/account/traffic");
    const nodes = [...new Set(traffic.data?.map((item) => item.node.name))];

    return (
        <Page title="使用记录" description="显示最近 100 条记录">
            <Tabs defaultValue="ledger">
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
                        emptyText="暂无余额变动"
                        error={ledger.error}
                        onRetry={() => ledger.refetch()}
                        initialSorting={[{ id: "createdAt", desc: true }]}
                    />
                </TabsContent>
                <TabsContent value="traffic">
                    <DataTable
                        data={traffic.data}
                        isLoading={traffic.isPending}
                        columns={trafficColumns}
                        getRowId={(item) => String(item.id)}
                        searchPlaceholder={false}
                        exportName="流量记录"
                        emptyText="暂无流量记录"
                        error={traffic.error}
                        onRetry={() => traffic.refetch()}
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
