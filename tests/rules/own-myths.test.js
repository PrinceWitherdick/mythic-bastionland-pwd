import { describe, expect, it } from "vitest";
import { castKey } from "../../module/actions/myth-cast.js";
import { emptyMythNotes, mythNoteFor, mythRoll, withMythNote } from "../../module/rules/myth-notes.js";
import {
	emptyOwnMyth,
	isBlankOwnMyth,
	isOwnMyth,
	mythWithOwn,
	normaliseOwnMyth,
	ownMythChanged,
	ownMythEntry,
	ownMythKey,
	tableWritten
} from "../../module/rules/own-myths.js";
import { REALM_FLAG, emptyRealm, validateRealm } from "../../module/rules/realm.js";
import { editFeature, placeFeature } from "../../module/rules/realm-edits.js";
import { realmDocuments, realmFromDocuments, realmTextures } from "../../module/rules/realm-documents.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";
import { rollMythsAgain } from "../../module/rules/realm-myths.js";
import { completedMythId } from "../../module/rules/season-log.js";
import { soloRealm } from "../../module/rules/solo.js";
import { createRandom } from "../../module/rules/random.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });
const fallbacks = { table: "The table", column: (number) => `Column ${number}` };

/** A Myth written for these tests alone. */
const written = () => normaliseOwnMyth({
	verse: ["A lantern under the water,", "a bell no hand has rung."],
	omens: ["Fish swim upstream.", "", "The ferry comes back empty.", "Bells at low tide.", "See opposite: who rows out.", "The bell is rung."],
	img: "worlds/test/myths/lantern.webp",
	table: { name: "Who Rows Out", columns: ["Rower", "Cargo"], rows: [["A widow", "Salt"]] },
	castNote: "Nobody on the shore will say who keeps the bell."
});

function realmWithMyth(myth) {
	const realm = emptyRealm(g, "own-myths");
	realm.terrain.fill(8);
	realm.myths = [{ id: "m1", hex: hex(6, 6), number: 1, d6: 2, d12: 3, omen: 2, revealed: false, ...myth }];
	return realm;
}

describe("a Myth the Referee writes", () => {
	it("keeps two lines of verse, six Omens and a six-row table of two columns, however it arrives", () => {
		const myth = normaliseOwnMyth({ verse: { 0: " Line " }, omens: { 2: "Third", 7: "Eighth" }, table: { rows: { 5: { 1: "Last" } } }, img: 4 });
		expect(myth.verse).toEqual(["Line", ""]);
		expect(myth.omens).toEqual(["", "", "Third", "", "", ""]);
		expect(myth.table.rows).toHaveLength(6);
		expect(myth.table.rows[5]).toEqual(["", "Last"]);
		expect(myth.img).toBe("");
		expect(normaliseOwnMyth("nonsense")).toEqual(emptyOwnMyth());
	});

	it("is blank until anything is written or a picture chosen", () => {
		expect(isBlankOwnMyth(emptyOwnMyth())).toBe(true);
		expect(isBlankOwnMyth(normaliseOwnMyth({ omens: ["One"] }))).toBe(false);
		expect(isBlankOwnMyth(normaliseOwnMyth({ img: "a.webp" }))).toBe(false);
		expect(isBlankOwnMyth(normaliseOwnMyth({ table: { columns: ["", "Cargo"] } }))).toBe(false);
		expect(tableWritten(emptyOwnMyth())).toBe(false);
	});

	it("tells when something kept has changed", () => {
		expect(ownMythChanged(written(), written())).toBe(false);
		expect(ownMythChanged(written(), normaliseOwnMyth({ ...written(), castNote: "Changed" }))).toBe(true);
	});

	it("reads as the book's Myths read from the index, blanks left out", () => {
		const entry = ownMythEntry("The Drowned Bell", written(), fallbacks);
		expect(entry).toMatchObject({ own: true, name: "The Drowned Bell", path: "worlds/test/myths/lantern.webp", cast: [], prompts: null });
		expect(entry.verse).toEqual(["A lantern under the water,", "a bell no hand has rung."]);
		expect(entry.omens).toHaveLength(6);
		expect(entry.omens[1]).toBeNull();
		expect(entry.table).toEqual({
			name: "Who Rows Out",
			columns: ["Rower", "Cargo"],
			rows: [["A widow", "Salt"], ["", ""], ["", ""], ["", ""], ["", ""], ["", ""]]
		});
		expect(entry.castNote).toBe("Nobody on the shore will say who keeps the bell.");
	});

	it("names a table and its columns the Referee left unnamed, and has none where nothing of one is written", () => {
		const entry = ownMythEntry("Unnamed", normaliseOwnMyth({ table: { rows: [["x", "y"]] } }), fallbacks);
		expect(entry.table.name).toBe("The table");
		expect(entry.table.columns).toEqual(["Column 1", "Column 2"]);
		const bare = ownMythEntry("Bare", normaliseOwnMyth({ omens: ["One"] }), fallbacks);
		expect(bare).toMatchObject({ verse: null, path: null, table: null, castNote: null });
	});
});

describe("a written Myth among a Realm's six", () => {
	it("is told apart by its entry, not a roll", () => {
		expect(isOwnMyth({ own: "abc" })).toBe(true);
		expect(isOwnMyth({ own: "" })).toBe(false);
		expect(isOwnMyth({ d6: 1, d12: 1 })).toBe(false);
		expect(ownMythKey({ own: "abc" })).toBe("own:abc");
		expect(ownMythKey({ d6: 1, d12: 1 })).toBeNull();
		expect(mythWithOwn([{ number: 2, own: "abc" }, { number: 3, d6: 1, d12: 1 }], "abc")).toMatchObject({ number: 2 });
	});

	it("takes a Myth's place in its hex, under its number, with no roll", () => {
		const realm = placeFeature(realmWithMyth(), g, hex(6, 6), { kind: "myth", number: 1, own: "abc", omen: 0 });
		expect(realm.myths).toEqual([{ id: "m1", hex: hex(6, 6), number: 1, d6: null, d12: null, own: "abc", omen: 0, revealed: false }]);
		expect(validateRealm(realm, g).filter((problem) => problem.kind === "myth")).toEqual([]);
	});

	it("stays the written Myth when it's moved, revealed or has an Omen met", () => {
		const realm = realmWithMyth({ d6: null, d12: null, own: "abc" });
		expect(placeFeature(realm, g, hex(9, 9), { kind: "myth", number: 1 }).myths[0]).toMatchObject({ hex: hex(9, 9), own: "abc", d6: null });
		expect(editFeature(realm, g, hex(6, 6), { omen: 4 }).myths[0]).toMatchObject({ own: "abc", omen: 4 });
		expect(editFeature(realm, g, hex(6, 6), { revealed: true }).myths[0]).toMatchObject({ own: "abc", revealed: true });
	});

	it("becomes one of the book's again when rolled, or a die is typed in for it", () => {
		const realm = realmWithMyth({ d6: null, d12: null, own: "abc" });
		const rolled = placeFeature(realm, g, hex(6, 6), { kind: "myth", number: 1, d6: 4, d12: 9 }).myths[0];
		expect(rolled).toMatchObject({ d6: 4, d12: 9 });
		expect(rolled).not.toHaveProperty("own");
		const typed = editFeature(realm, g, hex(6, 6), { d6: 5 }).myths[0];
		expect(typed).toMatchObject({ d6: 5, d12: 1 });
		expect(typed).not.toHaveProperty("own");
		const [again] = rollMythsAgain(createRandom("own-myths"), realm.myths);
		expect(again).not.toHaveProperty("own");
		expect(again.d6).toBeGreaterThanOrEqual(1);
	});

	it("is a book Myth turned written when one is named for it", () => {
		const realm = realmWithMyth();
		expect(editFeature(realm, g, hex(6, 6), { own: "abc" }).myths[0]).toMatchObject({ own: "abc", d6: null, d12: null, omen: 2 });
	});

	it("is kept on its Tile and read back from it, and a Tile for the book's Myths carries nothing of it", () => {
		const realm = realmWithMyth({ d6: null, d12: null, own: "abc" });
		const tile = (from) => realmDocuments(from, g, realmTextures()).tiles.find(({ match }) => match === "id:m1").data;
		expect(tile(realm).flags[SYSTEM_ID][REALM_FLAG]).toMatchObject({ kind: "myth", own: "abc", d6: null, d12: null });
		expect(tile(realmWithMyth()).flags[SYSTEM_ID][REALM_FLAG]).not.toHaveProperty("own");
		const read = realmFromDocuments({ tiles: [{ _id: "m1", ...tile(realm) }] }, g).realm;
		expect(read.myths[0]).toMatchObject({ number: 1, own: "abc", d6: null, d12: null });
		expect(realmFromDocuments({ tiles: [{ _id: "m1", ...tile(realmWithMyth()) }] }, g).realm.myths[0]).not.toHaveProperty("own");
	});

	it("keeps its own notes, its own Season record and its own Cast, the book's keys unchanged", () => {
		const own = { number: 1, d6: null, d12: null, own: "abc" };
		const book = { number: 1, d6: 2, d12: 7 };
		expect(mythRoll(own)).toBe("own:abc");
		expect(mythRoll(book)).toBe("2-07");
		const notes = withMythNote(emptyMythNotes(), own, { note: "Who keeps the bell?" });
		expect(mythNoteFor(notes, own).note).toBe("Who keeps the bell?");
		expect(mythNoteFor(notes, book).note).toBe("");
		expect(completedMythId("scene", own)).toBe("scene.1.own:abc");
		expect(completedMythId("scene", book)).toBe("scene.1.2-7");
		expect(castKey({ id: "scene" }, own)).toBe("own:abc");
		expect(castKey({ id: "scene" }, book)).toBe("2-07");
	});

	it("is masked like any other in solo play until it's known", () => {
		const realm = realmWithMyth({ d6: null, d12: null, own: "abc", omen: 0 });
		expect(soloRealm(realm).myths[0]).not.toHaveProperty("own");
		const known = soloRealm({ ...realm, myths: [{ ...realm.myths[0], omen: 1 }] }).myths[0];
		expect(known.own).toBe("abc");
	});
});
