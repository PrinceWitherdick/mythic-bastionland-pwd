import { describe, expect, it } from "vitest";
import {
	MAX_PARTY_NOTE,
	MAX_TOLD,
	MAX_TOLD_NOTE,
	emptyShared,
	forgetPartyNote,
	forgetShared,
	forgetTold,
	normaliseShared,
	recordTold,
	setPartyNote,
	sharedAt
} from "../../module/rules/hex-shared.js";

const hex = (col, row) => ({ col, row });
const when = { age: 1, season: "spring", day: 3, phase: "morning" };

describe("normaliseShared", () => {
	it("gives an empty store for anything that isn't one", () => {
		for (const raw of [undefined, null, "", 7, [], {}, { hexes: [] }, { hexes: "no" }]) {
			expect(normaliseShared(raw)).toEqual(emptyShared());
		}
	});

	it("keeps only hex keys with something in them", () => {
		const shared = normaliseShared({
			hexes: {
				"3,4": { told: [{ id: "a", note: " A ford. " }] },
				"5,6": { told: [{ note: "   " }], party: { text: "" } },
				nowhere: { told: [{ note: "lost" }] }
			}
		});
		expect(Object.keys(shared.hexes)).toEqual(["3,4"]);
		expect(shared.hexes["3,4"].told[0]).toMatchObject({ id: "a", note: "A ford.", when: null, at: 0, messageId: "" });
	});

	it("cuts overlong words and keeps the newest tellings", () => {
		const told = Array.from({ length: MAX_TOLD + 3 }, (_, i) => ({ id: `t${i}`, note: `note ${i}` }));
		const shared = normaliseShared({ hexes: { "1,1": { told, party: { text: "x".repeat(MAX_PARTY_NOTE + 50) } } } });
		expect(shared.hexes["1,1"].told).toHaveLength(MAX_TOLD);
		expect(shared.hexes["1,1"].told[0].id).toBe("t3");
		expect(shared.hexes["1,1"].party.text).toHaveLength(MAX_PARTY_NOTE);
	});
});

describe("recordTold", () => {
	it("adds a telling, and leaves the store alone for empty words", () => {
		const shared = recordTold(emptyShared(), hex(2, 2), { id: "a", note: "A ruined mill.", when, at: 5, messageId: "m1" });
		expect(sharedAt(shared, hex(2, 2)).told).toEqual([{ id: "a", note: "A ruined mill.", when, at: 5, messageId: "m1" }]);
		expect(recordTold(shared, hex(2, 2), { id: "b", note: "  " })).toBe(shared);
	});

	it("moves the last telling on, rather than adding the same words twice", () => {
		const later = { ...when, day: 4 };
		let shared = recordTold(emptyShared(), hex(2, 2), { id: "a", note: "A mill.", when, at: 5, messageId: "m1" });
		shared = recordTold(shared, hex(2, 2), { id: "b", note: "A mill.", when: later, at: 9, messageId: "m2" });
		expect(sharedAt(shared, hex(2, 2)).told).toEqual([{ id: "a", note: "A mill.", when: later, at: 9, messageId: "m2" }]);
	});

	it("drops the oldest past the cap, and cuts a long telling", () => {
		let shared = emptyShared();
		for (let i = 0; i < MAX_TOLD + 2; i++) shared = recordTold(shared, hex(1, 1), { id: `t${i}`, note: `note ${i}` });
		expect(sharedAt(shared, hex(1, 1)).told.map((t) => t.id)[0]).toBe("t2");
		shared = recordTold(shared, hex(1, 1), { id: "long", note: "y".repeat(MAX_TOLD_NOTE + 9) });
		expect(sharedAt(shared, hex(1, 1)).told.at(-1).note).toHaveLength(MAX_TOLD_NOTE);
	});
});

describe("forgetTold", () => {
	it("strikes one telling, and the hex once nothing is left", () => {
		let shared = recordTold(emptyShared(), hex(1, 1), { id: "a", note: "One." });
		shared = recordTold(shared, hex(1, 1), { id: "b", note: "Two." });
		const less = forgetTold(shared, hex(1, 1), "a");
		expect(sharedAt(less, hex(1, 1)).told.map((t) => t.id)).toEqual(["b"]);
		expect(sharedAt(forgetTold(less, hex(1, 1), "b"), hex(1, 1))).toBeNull();
		expect(forgetTold(shared, hex(1, 1), "nope")).toBe(shared);
		expect(forgetTold(shared, hex(9, 9), "a")).toBe(shared);
	});
});

describe("the Company's note", () => {
	const note = { text: " Camp by the stones. ", by: "u1", byName: "Ada", when, at: 3 };

	it("is written, trimmed and kept beside what was told", () => {
		let shared = recordTold(emptyShared(), hex(1, 1), { id: "a", note: "One." });
		shared = setPartyNote(shared, hex(1, 1), note);
		expect(sharedAt(shared, hex(1, 1))).toEqual({
			told: [expect.objectContaining({ id: "a" })],
			party: { text: "Camp by the stones.", by: "u1", byName: "Ada", when, at: 3 }
		});
	});

	it("leaves the store alone when the words don't change", () => {
		const shared = setPartyNote(emptyShared(), hex(1, 1), note);
		expect(setPartyNote(shared, hex(1, 1), { ...note, by: "u2" })).toBe(shared);
		expect(setPartyNote(emptyShared(), hex(1, 1), { text: " " })).toEqual(emptyShared());
	});

	it("goes when rubbed out, taking an empty hex with it", () => {
		const shared = setPartyNote(emptyShared(), hex(1, 1), note);
		expect(sharedAt(setPartyNote(shared, hex(1, 1), { text: "" }), hex(1, 1))).toBeNull();
		expect(sharedAt(forgetPartyNote(shared, hex(1, 1)), hex(1, 1))).toBeNull();
		const told = recordTold(shared, hex(1, 1), { id: "a", note: "One." });
		expect(sharedAt(forgetPartyNote(told, hex(1, 1)), hex(1, 1))).toEqual({ told: [expect.objectContaining({ id: "a" })] });
		expect(forgetPartyNote(emptyShared(), hex(1, 1))).toEqual(emptyShared());
	});
});

describe("forgetShared", () => {
	it("forgets the whole hex, or nothing", () => {
		const shared = setPartyNote(recordTold(emptyShared(), hex(1, 1), { note: "One." }), hex(1, 1), { text: "Two" });
		expect(forgetShared(shared, hex(1, 1))).toEqual(emptyShared());
		expect(forgetShared(shared, hex(2, 2))).toBe(shared);
	});
});
