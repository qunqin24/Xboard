import { useEffect, useReducer } from "react";
import { spinReducer } from "@/lib/spin-turn";

/**
 * Spin state for an icon that stands for its action. Put `className` on the
 * icon and `onAnimationIteration` on it too; it stops at the end of a turn.
 * Under reduced motion it never spins.
 */
export function useSpinTurn(active: boolean) {
    const [state, dispatch] = useReducer(spinReducer, {
        spinning: false,
        active: false,
    });
    useEffect(() => {
        if (active) {
            dispatch("start");
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
                dispatch("reduced-motion");
        } else dispatch("finish");
    }, [active]);
    return {
        spinning: state.spinning,
        className: state.spinning ? "spin-turn" : undefined,
        onAnimationIteration: () => dispatch("turn-end"),
    };
}
