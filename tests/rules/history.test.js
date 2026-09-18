import { describe, expect, it } from "vitest";
import { emptyHistory, recordChange, stepHistory } from "../../module/rules/history.js";

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
