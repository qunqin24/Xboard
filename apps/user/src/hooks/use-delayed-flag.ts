import { useEffect, useRef, useState } from "react";
import {
    createDelayedFlag,
    MIN_SHOW,
    SHOW_DELAY,
    type DelayedFlag,
} from "@/lib/delayed-flag";

/**
 * `true` only when `loading` has lasted longer than `delay` ms, and then for at
 * least `minShow` ms. Use it for every spinner, skeleton and refresh state.
 */
export function useDelayedFlag(
    loading: boolean,
    delay = SHOW_DELAY,
    minShow = MIN_SHOW,
) {
    const [visible, setVisible] = useState(false);
    const flag = useRef<DelayedFlag | null>(null);
    useEffect(() => {
        const created = createDelayedFlag(setVisible, delay, minShow);
        flag.current = created;
        return () => {
            created.dispose();
            flag.current = null;
        };
    }, [delay, minShow]);
    useEffect(() => {
        flag.current?.set(loading);
    }, [loading, delay, minShow]);
    return visible;
}
