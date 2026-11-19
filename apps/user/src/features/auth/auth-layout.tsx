import { LocaleControl } from "@/components/locale-control";
import { useSite } from "@/api/panel";
import { Logo } from "@/assets/logo";

export function AuthLayout({ children }: { children: React.ReactNode }) {
    const site = useSite();
    // The column gets an explicit width: Chinese text can wrap after any
    // character, so a content-sized grid column collapses to a sliver.
    return (
        <div className="container grid h-svh max-w-none items-center justify-center">
            <div className="mx-auto flex w-[min(28rem,calc(100vw-2rem))] flex-col justify-center gap-group py-8 sm:p-8">
                <div className="flex items-center justify-center gap-inline">
                    <Logo />
                    <h1 className="text-xl font-medium">
                        {site.data?.siteName ?? "Xboard"}
                    </h1>
                </div>
                {children}
                <div className="mx-auto">
                    <LocaleControl />
                </div>
            </div>
        </div>
    );
}
