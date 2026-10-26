import { describe, expect, it } from "vitest";
import { MYTH_NOTES_VERSION, emptyMythNotes, mythNoteFor, mythRoll, mythScenesFor, normaliseMythNotes, withMythNote, withoutResolved } from "../../module/rules/myth-notes.js";
import { emptyOmenScenes, withOmenScene } from "../../module/rules/omen-scenes.js";

const wyvern = { number: 3, d6: 1, d12: 5 };
// The same number rolled afresh: a new Myth replacing the old (p27).
const replacement = { number: 3, d6: 4, d12: 9 };

describe("mythRoll", () => {
	it("reads a Myth's dice as its roll on the Myths table, or nothing for dice that aren't one", () => {
		expect(mythRoll(wyvern)).toBe("1-05");
		expect(mythRoll({ d6: 7, d12: 1 })).toBe("");
		expect(mythRoll({ d6: 1 })).toBe("");
	});
});

describe("normaliseMythNotes", () => {
	it("gives empty notes for anything that isn't them", () => {
		for (const raw of [undefined, null, "", 3, [], {}, { myths: [] }, { myths: "x" }]) {
			expect(normaliseMythNotes(raw)).toEqual(emptyMythNotes());
		}
	});

	it("keeps only Myth numbers the Realm can have, and notes that say something", () => {
		const notes = normaliseMythNotes({
			version: 99,
			myths: {
				3: { roll: "1-05", note: "  Nest in the crags.  ", resolved: false },
				7: { roll: "1-05", note: "No seventh Myth" },
				"03": { roll: "1-05", note: "Not a number as written" },
				4: { roll: "2-01", note: "", resolved: false },
				5: { roll: "2-02", note: "", resolved: true }
			}
		});
		expect(notes).toEqual({
			version: MYTH_NOTES_VERSION,
			myths: {
				3: { roll: "1-05", note: "Nest in the crags.", resolved: false },
				5: { roll: "2-02", note: "", resolved: true }
			}
		});
	});
});

describe("mythNoteFor", () => {
	it("gives what's written about the Myth, and nothing for a Myth that replaced it", () => {
		const notes = withMythNote(emptyMythNotes(), wyvern, { note: "Nest in the crags.", resolved: true });
		expect(mythNoteFor(notes, wyvern)).toEqual({ note: "Nest in the crags.", resolved: true });
		expect(mythNoteFor(notes, replacement)).toEqual({ note: "", resolved: false });
		expect(mythNoteFor(null, wyvern)).toEqual({ note: "", resolved: false });
	});
});

describe("withMythNote", () => {
	it("writes a note and marks a Myth resolved, one change at a time", () => {
		const written = withMythNote(emptyMythNotes(), wyvern, { note: "Nest in the crags." });
		const resolved = withMythNote(written, wyvern, { resolved: true });
		expect(resolved.myths[3]).toEqual({ roll: "1-05", note: "Nest in the crags.", resolved: true });
	});

	it("changes nothing when nothing would change", () => {
		const written = withMythNote(emptyMythNotes(), wyvern, { note: "Nest" });
		expect(withMythNote(written, wyvern, { note: " Nest " })).toBe(written);
		const empty = emptyMythNotes();
		expect(withMythNote(empty, wyvern, { note: "", resolved: false })).toBe(empty);
	});

	it("forgets a Myth once nothing is written and it isn't resolved", () => {
		const written = withMythNote(emptyMythNotes(), wyvern, { note: "Nest" });
		expect(withMythNote(written, wyvern, { note: "" }).myths).toEqual({});
	});

	it("starts a Myth that replaced another afresh, writing over the old one's note", () => {
		const old = withMythNote(emptyMythNotes(), wyvern, { note: "Nest", resolved: true });
		const fresh = withMythNote(old, replacement, { note: "A new terror." });
		expect(fresh.myths[3]).toEqual({ roll: "4-09", note: "A new terror.", resolved: false });
		// Clearing a replacement's blank note clears the old one's leftovers too.
		expect(withMythNote(old, replacement, { note: "" }).myths).toEqual({});
	});

	it("keeps the Scenes linked to a Myth's Omens, even with nothing written, and forgets them with the last one", () => {
		const linked = withMythNote(emptyMythNotes(), wyvern, { scenes: withOmenScene(emptyOmenScenes(), 2, "s1") });
		expect(linked.myths[3]).toEqual({ roll: "1-05", note: "", resolved: false, scenes: { 2: ["s1"] } });
		expect(mythScenesFor(linked, wyvern)[1]).toEqual(["s1"]);
		// Writing a note keeps them, and the same Scenes again change nothing.
		const noted = withMythNote(linked, wyvern, { note: "Nest" });
		expect(noted.myths[3].scenes).toEqual({ 2: ["s1"] });
		expect(withMythNote(noted, wyvern, { scenes: mythScenesFor(noted, wyvern) })).toBe(noted);
		expect(withMythNote(linked, wyvern, { scenes: emptyOmenScenes() }).myths).toEqual({});
	});

	it("gives a Myth that replaced another none of the old one's Scenes", () => {
		const linked = withMythNote(emptyMythNotes(), wyvern, { scenes: withOmenScene(emptyOmenScenes(), 1, "s1") });
		expect(mythScenesFor(linked, replacement)).toEqual(emptyOmenScenes());
		expect(withMythNote(linked, replacement, { note: "A new terror." }).myths[3].scenes).toBeUndefined();
	});

	it("reads back kept Scenes, and drops what isn't a list of ids", () => {
		const notes = normaliseMythNotes({ myths: { 3: { roll: "1-05", scenes: { 1: ["s1", 7], 9: ["s2"] } }, 4: { roll: "2-01", scenes: "x" } } });
		expect(notes.myths).toEqual({ 3: { roll: "1-05", note: "", resolved: false, scenes: { 1: ["s1"] } } });
	});

	it("leaves the notes it was given alone", () => {
		const start = withMythNote(emptyMythNotes(), wyvern, { note: "Nest" });
		const copy = structuredClone(start);
		withMythNote(start, wyvern, { note: "Moved" });
		expect(start).toEqual(copy);
	});
});

describe("withoutResolved", () => {
	const myths = [
		{ number: 1, d6: 1, d12: 1 },
		{ number: 2, d6: 2, d12: 5 }
	];

	it("leaves out a resolved Myth, and keeps the same Realm when none is", () => {
		const realm = { myths, holdings: [] };
		expect(withoutResolved(realm, emptyMythNotes())).toBe(realm);
		const notes = withMythNote(emptyMythNotes(), myths[1], { resolved: true });
		expect(withoutResolved(realm, notes).myths.map((myth) => myth.number)).toEqual([1]);
	});

	it("doesn't count a note kept for the Myth that was replaced", () => {
		const notes = withMythNote(emptyMythNotes(), myths[1], { resolved: true });
		const replaced = { myths: [myths[0], { number: 2, d6: 3, d12: 4 }] };
		expect(withoutResolved(replaced, notes)).toBe(replaced);
	});
});
