/**
 * The timing rule shared by every loading indicator: show nothing for the
 * first `delay` ms, so a fast response never flashes a spinner, and once shown
 * keep it for at least `minShow` ms, so it never blinks away.
 *
 * Kept free of React so the timing can be unit tested with fake timers;
 * `useDelayedFlag` wraps it.
 */
export const SHOW_DELAY = 300;
export const MIN_SHOW = 500;

export type DelayedFlag = {
    /** Tell the flag whether the work is in progress right now. */
    set: (loading: boolean) => void;
    dispose: () => void;
};

export function createDelayedFlag(
    onChange: (visible: boolean) => void,
    delay = SHOW_DELAY,
    minShow = MIN_SHOW,
): DelayedFlag {
    let visible = false;
    let shownAt = 0;
    let loading = false;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const change = (value: boolean) => {
        if (visible === value) return;
        visible = value;
        onChange(value);
    };

    return {
        set(next) {
            if (next === loading) return;
            loading = next;
            if (next) {
                // Back in progress while the minimum display time runs out:
                // stay visible instead of hiding and showing again.
                clearTimeout(hideTimer);
                hideTimer = undefined;
                if (!visible && showTimer === undefined)
                    showTimer = setTimeout(() => {
                        showTimer = undefined;
                        shownAt = Date.now();
                        change(true);
                    }, delay);
                return;
            }
            // Finished before the delay: it was never shown.
            clearTimeout(showTimer);
            showTimer = undefined;
            if (!visible) return;
            const wait = Math.max(0, shownAt + minShow - Date.now());
            hideTimer = setTimeout(() => {
                hideTimer = undefined;
                change(false);
            }, wait);
        },
        dispose() {
            clearTimeout(showTimer);
            clearTimeout(hideTimer);
        },
    };
}
