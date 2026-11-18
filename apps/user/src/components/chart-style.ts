// Shared recharts styling, so every chart reads the same tokens.

export const chartAxis = {
    stroke: "var(--muted-foreground)",
    fontSize: 12,
    tickLine: false,
    axisLine: false,
} as const;

export const chartTooltip = {
    contentStyle: {
        background: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-control)",
        color: "var(--popover-foreground)",
        fontSize: 12,
    },
    labelStyle: { color: "var(--muted-foreground)" },
    cursor: { stroke: "var(--border)", fill: "var(--muted)" },
};

export const chartMargin = { top: 4, right: 8, bottom: 0, left: 0 };
