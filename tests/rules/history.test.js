import { describe, expect, it } from "vitest";
import { carryForward, emptyHistory, recordChange, stepChange, stepHistory } from "../../module/rules/history.js";

const realm = (name) => ({ name });

describe("recordChange", () => {
	it("remembers the Realm before each change, newest last, and forgets what could be redone", () => {
		let history = recordChange(emptyHistory(), realm("a"));
		history = { ...history, redo: [realm("x")] };
		history = recordChange(history, realm("b"));
		expect(history).toEqual({ undo: [realm("a"), realm("b")], redo: [] });
	});

	it("keeps only the newest changes past the limit", () => {
		let history = emptyHistory();
		for (const name of ["a", "b", "c"]) history = recordChange(history, realm(name), 2);
		expect(history.undo).toEqual([realm("b"), realm("c")]);
	});
});

describe("stepHistory", () => {
	it("has nothing to undo or redo at first", () => {
		expect(stepHistory(emptyHistory(), "undo", realm("now"))).toBeNull();
		expect(stepHistory(emptyHistory(), "redo", realm("now"))).toBeNull();
	});

	it("undoes to the Realm before the last change, and redoes back to now", () => {
		const history = recordChange(recordChange(emptyHistory(), realm("a")), realm("b"));
		const undone = stepHistory(history, "undo", realm("c"));
		expect(undone.target).toEqual(realm("b"));
		expect(undone.history).toEqual({ undo: [realm("a")], redo: [realm("c")] });

		const redone = stepHistory(undone.history, "redo", realm("b"));
		expect(redone.target).toEqual(realm("c"));
		expect(redone.history).toEqual({ undo: [realm("a"), realm("b")], redo: [] });
	});

	it("leaves the history it was given alone", () => {
		const history = recordChange(emptyHistory(), realm("a"));
		stepHistory(history, "undo", realm("b"));
		expect(history).toEqual({ undo: [realm("a")], redo: [] });
	});
});

describe("stepChange", () => {
	const change = (name) => ({ before: realm(`${name}-before`), after: realm(`${name}-after`) });

	it("has nothing to undo or redo at first", () => {
		expect(stepChange(emptyHistory(), "undo")).toBeNull();
		expect(stepChange(emptyHistory(), "redo")).toBeNull();
	});

	it("moves the same change from one list to the other and back", () => {
		const history = recordChange(recordChange(emptyHistory(), change("a")), change("b"));
		const undone = stepChange(history, "undo");
		expect(undone.change).toEqual(change("b"));
		expect(undone.history).toEqual({ undo: [change("a")], redo: [change("b")] });

		const redone = stepChange(undone.history, "redo");
		expect(redone.change).toEqual(change("b"));
		expect(redone.history).toEqual({ undo: [change("a"), change("b")], redo: [] });
	});
});

describe("carryForward", () => {
	const lists = { myths: (myth) => myth.id, barriers: (barrier) => barrier.edge };
	const myth = (id, fields = {}) => ({ id, number: 1, hex: { col: 1, row: 1 }, omen: 0, revealed: false, ...fields });

	it("keeps a Myth found and an Omen met since, when an unrelated paint is undone", () => {
		const before = { terrain: [1], myths: [myth("m1")], barriers: [{ edge: "e1", revealed: false }] };
		const after = { terrain: [2], myths: [myth("m1")], barriers: [{ edge: "e1", revealed: false }] };
		const now = { terrain: [2], myths: [myth("m1", { omen: 2, revealed: true })], barriers: [{ edge: "e1", revealed: true }] };
		expect(carryForward(before, after, now, lists)).toEqual({
			terrain: [1],
			myths: [myth("m1", { omen: 2, revealed: true })],
			barriers: [{ edge: "e1", revealed: true }]
		});
	});

	it("still takes back what the change itself set", () => {
		const before = { myths: [myth("m1")] };
		const after = { myths: [myth("m1", { revealed: true })] };
		const now = { myths: [myth("m1", { revealed: true, omen: 1 })] };
		expect(carryForward(before, after, now, lists).myths).toEqual([myth("m1", { revealed: false, omen: 1 })]);
	});

	it("puts the change back on Redo, keeping what came since", () => {
		const before = { myths: [myth("m1")] };
		const after = { myths: [myth("m1", { hex: { col: 2, row: 2 } })] };
		const now = { myths: [myth("m1", { omen: 3 })] };
		expect(carryForward(after, before, now, lists).myths).toEqual([myth("m1", { hex: { col: 2, row: 2 }, omen: 3 })]);
	});

	it("takes away what the change made, and keeps what came since it", () => {
		const before = { myths: [] };
		const after = { myths: [myth("made")] };
		const now = { myths: [myth("made"), myth("since")] };
		expect(carryForward(before, after, now, lists).myths).toEqual([myth("since")]);
	});

	it("brings back what the change took away", () => {
		const before = { myths: [myth("gone", { omen: 4 })] };
		const after = { myths: [] };
		const now = { myths: [] };
		expect(carryForward(before, after, now, lists).myths).toEqual([myth("gone", { omen: 4 })]);
	});

	it("leaves gone what the change didn't make or take away, but went since", () => {
		// Laid before the change, there on both sides of it, then rolled over by the dice.
		const before = { terrain: [0], myths: [myth("kept"), myth("rolledOver")] };
		const after = { terrain: [1], myths: [myth("kept"), myth("rolledOver")] };
		const now = { terrain: [1], myths: [myth("kept"), myth("rolled")] };
		expect(carryForward(before, after, now, lists).myths).toEqual([myth("kept"), myth("rolled")]);
		// Moved by the change and gone since, it stays gone too.
		const moved = { myths: [myth("kept"), myth("rolledOver", { hex: { col: 4, row: 4 } })] };
		expect(carryForward(before, moved, { myths: [myth("kept")] }, lists).myths).toEqual([myth("kept")]);
	});

	it("leaves the snapshots it was given alone", () => {
		const before = { myths: [myth("m1")] };
		const after = { myths: [myth("m1")] };
		const now = { myths: [myth("m1", { revealed: true })] };
		carryForward(before, after, now, lists);
		expect(before.myths[0].revealed).toBe(false);
	});
});
