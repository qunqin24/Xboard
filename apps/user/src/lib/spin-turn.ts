/**
 * An icon that stands for its action (refresh, retry) spins while the work
 * runs, always finishes a whole turn, and stops at the end of a turn: a result
 * that comes back at once still gets one complete rotation.
 */
export type SpinEvent = "start" | "finish" | "turn-end" | "reduced-motion";

export type SpinState = { spinning: boolean; active: boolean };

export function spinReducer(state: SpinState, event: SpinEvent): SpinState {
    switch (event) {
        case "start":
            return { spinning: true, active: true };
        case "finish":
            return { ...state, active: false };
        case "turn-end":
            // Keep turning while the work is still running.
            return state.active ? state : { spinning: false, active: false };
        case "reduced-motion":
            // No animation, so no turn will ever end: stop right away.
            return { spinning: false, active: state.active };
    }
}
