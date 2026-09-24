import { describe, expect, it } from "vitest";
import {
	DEFAULT_SCOPE,
	PLANNED_SCOPE,
	SCOPES,
	endedSession,
	normalizeScope,
	plannedTurn,
	sessionsLeft,
	sessionsSpent,
	turnDue
} from "../../module/rules/scope.js";
import { SEASONS } from "../../module/rules/time.js";

const plan = (extra = {}) => ({ ...DEFAULT_SCOPE, ...extra });

describe("SCOPES", () => {
	it("holds the three the book gives, in its order (p6)", () => {
		expect(SCOPES).toEqual(["adventure", "chronicle", "saga"]);
	});

	it("plans ahead only for the one with a known number of sessions", () => {
		expect(SCOPES).toContain(PLANNED_SCOPE);
		expect(PLANNED_SCOPE).toBe("chronicle");
	});
});

describe("DEFAULT_SCOPE", () => {
	it("settles on no Scope until a group chooses one", () => {
		expect(DEFAULT_SCOPE.scope).toBe("");
	});

	it("holds the book's own example of a Chronicle ready: six sessions, a turn at the end of each", () => {
		expect(DEFAULT_SCOPE).toMatchObject({ sessions: 6, session: 1, turnEvery: 1 });
	});
});

describe("normalizeScope", () => {
	it("keeps a Scope the book gives", () => {
		expect(normalizeScope({ scope: "saga" }).scope).toBe("saga");
	});

	it("takes nothing for a Scope it doesn't know", () => {
		expect(normalizeScope({ scope: "epic" }).scope).toBe("");
		expect(normalizeScope(null).scope).toBe("");
	});

	it("reads counts written as text, as a number field hands them over", () => {
		expect(normalizeScope({ sessions: "12", session: "3" })).toMatchObject({ sessions: 12, session: 3 });
	});

	it("sets a count that isn't a whole one of 1 or more back to where a game begins", () => {
		expect(normalizeScope({ sessions: 0, session: -2, turnEvery: 1.5 })).toMatchObject({ sessions: 6, session: 1, turnEvery: 1 });
	});
});

describe("turnDue", () => {
	it("puts a turn at the end of each session where the plan says every session", () => {
		expect([1, 2, 3].every((session) => turnDue(plan({ session })))).toBe(true);
	});

	it("spaces them out where a longer Chronicle asks for it", () => {
		expect([1, 2, 3, 4].map((session) => turnDue(plan({ session, turnEvery: 2 })))).toEqual([false, true, false, true]);
	});
});

describe("plannedTurn", () => {
	it("turns the Age at the end of Winter, since a new Age begins in Spring (p17)", () => {
		expect(plannedTurn("winter")).toBe("age");
		expect(plannedTurn(SEASONS[SEASONS.length - 1])).toBe("age");
	});

	it("turns the Season in any other", () => {
		expect(SEASONS.filter((season) => plannedTurn(season) === "season")).toEqual(["spring", "harvest"]);
	});
});

describe("sessionsLeft", () => {
	it("counts what is still to come after the one being played", () => {
		expect(sessionsLeft(plan({ sessions: 6, session: 1 }))).toBe(5);
		expect(sessionsLeft(plan({ sessions: 6, session: 6 }))).toBe(0);
	});

	it("never falls below none, however far a Chronicle runs past its plan", () => {
		expect(sessionsLeft(plan({ sessions: 6, session: 9 }))).toBe(0);
		expect(sessionsSpent(plan({ sessions: 6, session: 9 }))).toBe(true);
		expect(sessionsSpent(plan({ sessions: 6, session: 6 }))).toBe(false);
	});
});

describe("endedSession", () => {
	it("counts the session played, so the next one begins", () => {
		expect(endedSession(plan({ session: 3 })).session).toBe(4);
	});

	it("leaves the rest of the plan as it was, and lets a Chronicle run on past it", () => {
		expect(endedSession(plan({ sessions: 6, session: 6, turnEvery: 2 }))).toEqual({ scope: "", sessions: 6, session: 7, turnEvery: 2 });
	});
});
