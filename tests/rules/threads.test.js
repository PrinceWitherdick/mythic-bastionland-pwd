import { describe, expect, it } from "vitest";
import { THREAD_KINDS, lastRoll, newThread, situationsOf, threadList, threadsAt, withRoll } from "../../module/rules/threads.js";

const spring = { age: 2, year: 2, season: "spring", day: 4, phase: "morning" };

describe("newThread", () => {
	it("keeps its kind, name, Knight and the Season it was left open in", () => {
		expect(newThread({ kind: "favour", name: "  The miller's favour ", knight: "k1", opened: spring, at: 5 })).toEqual({
			kind: "favour", name: "The miller's favour", knight: "k1", scene: "", hex: "", opened: { age: 2, year: 2, season: "spring" }, at: 5, rolls: []
		});
	});

	it("is tied to a hex only with the Realm the hex is in", () => {
		expect(newThread({ kind: "contact", name: "A drover", scene: "s1", hex: "5,9" })).toMatchObject({ scene: "s1", hex: "5,9" });
		expect(newThread({ kind: "contact", name: "A drover", hex: "5,9" })).toMatchObject({ scene: "", hex: "" });
		expect(newThread({ kind: "contact", name: "A drover", scene: "s1" })).toMatchObject({ scene: "", hex: "" });
	});

	it("is nothing without a name, or of a kind there isn't", () => {
		expect(newThread({ kind: "favour", name: "   " })).toBeNull();
		expect(newThread({ kind: "grudge", name: "The envoy" })).toBeNull();
		expect(newThread()).toBeNull();
	});

	it("has a kind for each of the book's: a favour, a contact, and an unresolved situation", () => {
		expect(THREAD_KINDS).toEqual(["favour", "contact", "situation"]);
	});
});

describe("threadList", () => {
	it("reads what's kept by id, the oldest first, leaving out what can't be read", () => {
		const kept = {
			b: { kind: "situation", name: "The smoke", at: 20 },
			a: { kind: "favour", name: "The miller", at: 10, rolls: [{ d6: 2, result: "worse" }, null] },
			c: { kind: "grudge", name: "No such kind" },
			d: { kind: "contact", name: "" },
			e: null
		};
		const list = threadList(kept);
		expect(list.map(({ id }) => id)).toEqual(["a", "b"]);
		expect(list[0].rolls).toEqual([{ d6: 2, result: "worse" }]);
		expect(list[1]).toMatchObject({ knight: "", scene: "", hex: "", opened: null, rolls: [] });
	});

	it("reads nothing where nothing is kept", () => {
		expect(threadList(null)).toEqual([]);
		expect(threadList({})).toEqual([]);
	});
});

describe("withRoll and lastRoll", () => {
	it("keeps each Unresolved Situations roll on the thread, with the Season it was rolled in", () => {
		const thread = newThread({ kind: "situation", name: "The smoke" });
		expect(lastRoll(thread)).toBeNull();
		const once = withRoll(thread, { d6: 2, result: "worse", when: spring });
		const twice = withRoll(once, { d6: 6, result: "better" });
		expect(thread.rolls).toEqual([]);
		expect(twice.rolls).toEqual([{ d6: 2, result: "worse", when: { age: 2, year: 2, season: "spring" } }, { d6: 6, result: "better", when: null }]);
		expect(lastRoll(twice)).toMatchObject({ result: "better" });
	});
});

describe("threadsAt and situationsOf", () => {
	const threads = threadList({
		a: { kind: "favour", name: "Here", scene: "s1", hex: "5,9", at: 1 },
		b: { kind: "situation", name: "Elsewhere", scene: "s1", hex: "6,9", at: 2 },
		c: { kind: "situation", name: "Another Realm's", scene: "s2", hex: "5,9", at: 3 },
		d: { kind: "contact", name: "Nowhere", at: 4 }
	});

	it("finds those tied to one hex of one Realm", () => {
		expect(threadsAt(threads, "s1", "5,9").map(({ id }) => id)).toEqual(["a"]);
		expect(threadsAt(threads, "s1", "1,1")).toEqual([]);
	});

	it("picks out the situations, which are what a Season's turn changes", () => {
		expect(situationsOf(threads).map(({ id }) => id)).toEqual(["b", "c"]);
	});
});
