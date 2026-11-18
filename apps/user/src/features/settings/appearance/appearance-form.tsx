import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fonts } from "@/config/fonts";
import { toast } from "sonner";
import { useFont } from "@/context/font-provider";
import { useTheme } from "@/context/theme-provider";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const appearanceFormSchema = z.object({
    theme: z.enum(["light", "dark"]),
    font: z.enum(fonts),
});

type AppearanceFormValues = z.infer<typeof appearanceFormSchema>;

/**
 * Miniature page drawn with theme tokens. `scope` is the theme class the
 * preview is rendered under, so it shows that theme whatever the app uses.
 */
function ThemePreview({ scope }: { scope: "light" | "dark" }) {
    return (
        <div className={scope}>
            <div className="flex flex-col gap-field rounded-control bg-muted p-2">
                <div className="flex flex-col gap-field rounded-inner bg-card p-2 shadow-xs">
                    <div className="h-2 w-20 rounded-full bg-muted-foreground/30" />
                    <div className="h-2 w-24 rounded-full bg-muted-foreground/30" />
                </div>
                {[0, 1].map((row) => (
                    <div
                        key={row}
                        className="flex items-center gap-field rounded-inner bg-card p-2 shadow-xs"
                    >
                        <div className="size-4 rounded-full bg-muted-foreground/30" />
                        <div className="h-2 w-24 rounded-full bg-muted-foreground/30" />
                    </div>
                ))}
            </div>
        </div>
    );
}

const THEMES = [
    { value: "light", label: "浅色" },
    { value: "dark", label: "深色" },
] as const;

export function AppearanceForm() {
    const { font, setFont } = useFont();
    const { theme, setTheme } = useTheme();

    // This can come from your database or API.
    const defaultValues: Partial<AppearanceFormValues> = {
        theme: theme as "light" | "dark",
        font,
    };

    const form = useForm<AppearanceFormValues>({
        resolver: zodResolver(appearanceFormSchema),
        defaultValues,
    });

    function onSubmit(data: AppearanceFormValues) {
        if (data.font != font) setFont(data.font);
        if (data.theme != theme) setTheme(data.theme);

        toast.success("外观已更新");
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-group"
            >
                <FormField
                    control={form.control}
                    name="font"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>字体</FormLabel>
                            <Select
                                value={field.value}
                                onValueChange={field.onChange}
                            >
                                <FormControl>
                                    <SelectTrigger className="w-48 capitalize">
                                        <SelectValue />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {fonts.map((name) => (
                                        <SelectItem
                                            key={name}
                                            value={name}
                                            className="capitalize"
                                        >
                                            {name === "system"
                                                ? "系统字体"
                                                : name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="theme"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>主题</FormLabel>
                            <FormMessage />
                            <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="grid max-w-md grid-cols-2 gap-group"
                            >
                                {THEMES.map((item) => (
                                    <FormItem key={item.value}>
                                        <FormLabel className="flex-col items-stretch gap-field [&:has([data-state=checked])>div]:border-primary">
                                            <FormControl>
                                                <RadioGroupItem
                                                    value={item.value}
                                                    className="sr-only"
                                                />
                                            </FormControl>
                                            <div className="rounded-surface border-2 border-muted p-1 hover:border-accent">
                                                <ThemePreview
                                                    scope={item.value}
                                                />
                                            </div>
                                            <span className="block w-full text-center font-normal">
                                                {item.label}
                                            </span>
                                        </FormLabel>
                                    </FormItem>
                                ))}
                            </RadioGroup>
                        </FormItem>
                    )}
                />

                <Button type="submit">保存</Button>
            </form>
        </Form>
    );
}
