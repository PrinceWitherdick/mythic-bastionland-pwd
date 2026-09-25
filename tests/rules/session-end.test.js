import { describe, expect, it } from "vitest";
import { appendRecap, normalizeSessionEnd, offeredStep, passageStep, TIME_STEPS, TIME_STEP_KEYS, timeStep, turnsSeasonOrAge } from "../../module/rules/session-end.js";

describe("TIME_STEPS", () => {
	it("offers the book's four answers, in its order (p17)", () => {
		expect(TIME_STEP_KEYS).toEqual(["none", "weeks", "months", "years"]);
	});

	it("names the turn each one makes: Months the Season, Years the Age", () => {
		expect(TIME_STEPS.map(({ turn }) => turn)).toEqual([null, "weeks", "season", "age"]);
	});

	it("knows a step by its key, and nothing else", () => {
		expect(timeStep("months")).toMatchObject({ key: "months", turn: "season" });
		expect(timeStep("decades")).toBeNull();
		expect(timeStep(undefined)).toBeNull();
	});
});

describe("turnsSeasonOrAge", () => {
	it("is the Months and Years steps, the two that leave a situation behind (p17)", () => {
		expect(TIME_STEP_KEYS.filter(turnsSeasonOrAge)).toEqual(["months", "years"]);
	});

	it("is no step at all before one is settled on", () => {
		expect(turnsSeasonOrAge(null)).toBe(false);
	});
});

describe("passageStep", () => {
	it("turns the Season now on a 1, where the calendar calls for a Season", () => {
		expect(passageStep("now", "season")).toEqual({ step: "months", promised: null });
	});

	it("begins the new Age now on a 1 where Winter is ending, since an Age begins in Spring", () => {
		expect(passageStep("now", "age")).toEqual({ step: "years", promised: null });
	});

	it("leaves the turn to the end of the next session on a 2-3, and passes no time now", () => {
		expect(passageStep("afterNextSession", "season")).toEqual({ step: "none", promised: "season" });
		expect(passageStep("afterNextSession", "age")).toEqual({ step: "none", promised: "age" });
	});

	it("carries the Season on, promising nothing, on a 4-6", () => {
		expect(passageStep("continues", "season")).toEqual({ step: "none", promised: null });
	});
});

describe("offeredStep", () => {
	it("offers nothing where nothing points at a turn: the book has the group discuss it", () => {
		expect(offeredStep()).toEqual({ step: null, reason: null });
	});

	it("offers the turn a roll promised last session", () => {
		expect(offeredStep({ promised: "age" })).toEqual({ step: "years", reason: "promised" });
	});

	it("offers the turn a Chronicle's plan puts at this session's end", () => {
		expect(offeredStep({ due: "season" })).toEqual({ step: "months", reason: "planned" });
	});

	it("puts a promise before a plan, since the promise was made at the table", () => {
		expect(offeredStep({ promised: "season", due: "age" })).toEqual({ step: "months", reason: "promised" });
	});
});

describe("normalizeSessionEnd", () => {
	it("starts a world with nothing promised", () => {
		expect(normalizeSessionEnd(undefined)).toEqual({ promised: null });
	});

	it("keeps only a turn it knows", () => {
		expect(normalizeSessionEnd({ promised: "season" })).toEqual({ promised: "season" });
		expect(normalizeSessionEnd({ promised: "weeks" })).toEqual({ promised: null });
	});
});

describe("appendRecap", () => {
	it("writes the first session's recap under its heading", () => {
		expect(appendRecap("", "Session 1", "They rode north.")).toBe("Session 1\nThey rode north.");
	});

	it("leaves a blank line between sessions, after whatever was written before", () => {
		expect(appendRecap("Session 1\nThey rode north.", "Session 2", "The ford was held."))
			.toBe("Session 1\nThey rode north.\n\nSession 2\nThe ford was held.");
	});

	it("leaves the notes alone where nothing was written about the session", () => {
		expect(appendRecap("Session 1\nThey rode north.", "Session 2", "   ")).toBe("Session 1\nThey rode north.");
		expect(appendRecap(undefined, "Session 1", "")).toBe("");
	});
});
