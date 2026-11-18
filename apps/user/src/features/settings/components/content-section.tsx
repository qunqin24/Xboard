import { InfoTip } from "@/components/info-tip";
import { Separator } from "@/components/ui/separator";

type ContentSectionProps = {
    title: string;
    desc?: string;
    /** Rules and background, folded behind a question-mark button. */
    help?: React.ReactNode;
    children: React.JSX.Element;
};

export function ContentSection({
    title,
    desc,
    help,
    children,
}: ContentSectionProps) {
    return (
        <div className="flex flex-1 flex-col">
            <div className="flex flex-none flex-col gap-1">
                <div className="flex items-center gap-1">
                    <h3 className="text-lg font-medium">{title}</h3>
                    {help ? <InfoTip>{help}</InfoTip> : null}
                </div>
                {desc ? (
                    <p className="text-sm text-muted-foreground">{desc}</p>
                ) : null}
            </div>
            <Separator className="my-group flex-none" />
            {/* 4px of room for focus rings, offset so content lines up with the title. */}
            <div className="-mx-1 h-full overflow-y-auto scroll-smooth px-1 pb-1">
                <div className="lg:max-w-xl">{children}</div>
            </div>
        </div>
    );
}
