import { describe, expect, it } from "vitest";
import { spinReducer, type SpinState } from "./spin-turn";

const idle: SpinState = { spinning: false, active: false };

describe("spinReducer", () => {
    it("keeps spinning until a turn ends after the work finished", () => {
        let state = spinReducer(idle, "start");
        expect(state.spinning).toBe(true);
        // The result is back before the first turn ended.
        state = spinReducer(state, "finish");
        expect(state.spinning).toBe(true);
        state = spinReducer(state, "turn-end");
        expect(state.spinning).toBe(false);
    });

    it("keeps turning while the work is running", () => {
        let state = spinReducer(idle, "start");
        state = spinReducer(state, "turn-end");
        expect(state.spinning).toBe(true);
    });

    it("does not spin under reduced motion", () => {
        const state = spinReducer(spinReducer(idle, "start"), "reduced-motion");
        expect(state.spinning).toBe(false);
    });
});
