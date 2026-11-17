import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

type DatePickerProps = {
    selected: Date | undefined;
    onSelect: (date: Date | undefined) => void;
    placeholder?: string;
    /** Dates that cannot be picked; nothing is disabled by default. */
    disabled?: (date: Date) => boolean;
    className?: string;
};

export function DatePicker({
    selected,
    onSelect,
    placeholder = "选择日期",
    disabled,
    className,
}: DatePickerProps) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    data-empty={!selected}
                    className={cn(
                        "w-60 justify-start text-start font-normal data-[empty=true]:text-muted-foreground",
                        className,
                    )}
                >
                    {selected ? (
                        format(selected, "yyyy-MM-dd")
                    ) : (
                        <span>{placeholder}</span>
                    )}
                    <CalendarIcon className="ms-auto h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
                <Calendar
                    mode="single"
                    captionLayout="dropdown"
                    selected={selected}
                    onSelect={onSelect}
                    locale={zhCN}
                    defaultMonth={selected}
                    disabled={disabled}
                />
            </PopoverContent>
        </Popover>
    );
}
