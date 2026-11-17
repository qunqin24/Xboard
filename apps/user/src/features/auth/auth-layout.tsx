import { useSite } from "@/api/panel";
import { Logo } from "@/assets/logo";

export function AuthLayout({ children }: { children: React.ReactNode }) {
    const site = useSite();
    return (
        <div className="container grid h-svh max-w-none items-center justify-center">
            <div className="mx-auto flex w-full flex-col justify-center space-y-2 py-8 sm:p-8">
                <div className="mb-4 flex items-center justify-center">
                    <Logo className="me-2" />
                    <h1 className="text-xl font-medium">
                        {site.data?.siteName ?? "Xboard"}
                    </h1>
                </div>
                {children}
            </div>
        </div>
    );
}
