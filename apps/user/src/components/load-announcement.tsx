import { useEffect, useState } from "react";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";

/** Keep the live region mounted before the delayed loading message changes. */
export function LoadAnnouncement({
    loading,
    failed = false,
}: {
    loading: boolean;
    failed?: boolean;
}) {
    const waiting = useDelayedFlag(loading);
    const [message, setMessage] = useState("");
    useEffect(() => {
        if (waiting) setMessage("正在加载");
        else if (!loading)
            setMessage((previous) =>
                previous === "正在加载" ? (failed ? "" : "加载完成") : previous,
            );
    }, [waiting, loading, failed]);
    return (
        <span role="status" aria-live="polite" className="sr-only">
            {message}
        </span>
    );
}
