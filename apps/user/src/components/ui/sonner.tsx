import { Toaster as Sonner, ToasterProps } from "sonner";
import { useTheme } from "@/context/theme-provider";

export function Toaster({ ...props }: ToasterProps) {
    const { theme = "system" } = useTheme();

    return (
        <Sonner
            theme={theme as ToasterProps["theme"]}
            position="top-center"
            duration={3000}
            className="toaster group [&_div[data-content]]:w-full"
            style={
                {
                    "--normal-bg": "var(--popover)",
                    "--normal-text": "var(--popover-foreground)",
                    "--normal-border": "var(--border)",
                    "--border-radius": "var(--radius-card)",
                } as React.CSSProperties
            }
            toastOptions={{
                // 40 px tall for a one-line result.
                style: { minHeight: "2.5rem", paddingBlock: "0.5rem" },
            }}
            {...props}
        />
    );
}
