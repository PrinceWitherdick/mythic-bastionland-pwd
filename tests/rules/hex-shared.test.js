import { describe, expect, it } from "vitest";
import {
	MAX_PARTY_NOTE,
	MAX_TOLD,
	MAX_TOLD_NOTE,
	emptyShared,
	forgetBarrierMet,
	forgetPartyNote,
	forgetShared,
	forgetTold,
	normaliseShared,
	recordBarrierMet,
	recordTold,
	setPartyNote,
	sharedAt,
	toldState
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

describe("toldState", () => {
	it("says whether the players' last telling still reads as the GM's note does", () => {
		expect(toldState("", null)).toBe("none");
		expect(toldState("  A well.  ", null)).toBe("unsaid");
		expect(toldState("A well. ", "A well.")).toBe("current");
		expect(toldState("A dry well.", "A well.")).toBe("stale");
		expect(toldState("   ", "A well.")).toBe("kept");
		// A note longer than a telling holds is told cut short, and still counts as told.
		const long = "x".repeat(MAX_TOLD_NOTE + 50);
		expect(toldState(long, "x".repeat(MAX_TOLD_NOTE))).toBe("current");
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

describe("forgetTold", () => {
	it("forgets one telling, the hex going with its last", () => {
		const one = recordTold(emptyShared(), hex(1, 1), { id: "a", note: "One." });
		const two = recordTold(one, hex(1, 1), { id: "b", note: "Two." });
		expect(sharedAt(forgetTold(two, hex(1, 1), "a"), hex(1, 1)).told.map((told) => told.id)).toEqual(["b"]);
		expect(forgetTold(one, hex(1, 1), "a")).toEqual(emptyShared());
		const noted = setPartyNote(one, hex(1, 1), { text: "Ours" });
		expect(sharedAt(forgetTold(noted, hex(1, 1), "a"), hex(1, 1))).toMatchObject({ told: [], party: { text: "Ours" } });
	});

	it("leaves the store alone for a telling it hasn't got", () => {
		const one = recordTold(emptyShared(), hex(1, 1), { id: "a", note: "One." });
		expect(forgetTold(one, hex(1, 1), "z")).toBe(one);
		expect(forgetTold(one, hex(2, 2), "a")).toBe(one);
	});
});

describe("forgetBarrierMet", () => {
	const north = "1,1|1,0";
	const east = "1,1|2,1";

	it("forgets one Barrier met, the hex going with its last", () => {
		const one = recordBarrierMet(emptyShared(), hex(1, 1), { edge: north, byName: "Ada" });
		const two = recordBarrierMet(one, hex(1, 1), { edge: east, byName: "Bo" });
		expect(sharedAt(forgetBarrierMet(two, hex(1, 1), north), hex(1, 1)).met.map((met) => met.edge)).toEqual([east]);
		expect(forgetBarrierMet(one, hex(1, 1), north)).toEqual(emptyShared());
		const told = recordTold(one, hex(1, 1), { id: "a", note: "One." });
		expect(sharedAt(forgetBarrierMet(told, hex(1, 1), north), hex(1, 1))).toEqual({ told: [expect.objectContaining({ id: "a" })] });
	});

	it("leaves the store alone for a Barrier not met there", () => {
		const one = recordBarrierMet(emptyShared(), hex(1, 1), { edge: north });
		expect(forgetBarrierMet(one, hex(1, 1), east)).toBe(one);
		expect(forgetBarrierMet(one, hex(2, 2), north)).toBe(one);
	});
});

describe("forgetShared", () => {
	it("forgets the whole hex, or nothing", () => {
		const shared = setPartyNote(recordTold(emptyShared(), hex(1, 1), { note: "One." }), hex(1, 1), { text: "Two" });
		expect(forgetShared(shared, hex(1, 1))).toEqual(emptyShared());
		expect(forgetShared(shared, hex(2, 2))).toBe(shared);
	});
});
