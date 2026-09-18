import { describe, expect, it } from "vitest";
import { MYTH_NOTES_VERSION, emptyMythNotes, mythNoteFor, mythRoll, normaliseMythNotes, withMythNote } from "../../module/rules/myth-notes.js";

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

	it("leaves the notes it was given alone", () => {
		const start = withMythNote(emptyMythNotes(), wyvern, { note: "Nest" });
		const copy = structuredClone(start);
		withMythNote(start, wyvern, { note: "Moved" });
		expect(start).toEqual(copy);
	});
});
