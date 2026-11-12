import { describe, expect, it } from "vitest";
import { STARTS, knightItems, knightUpdate, seerAutoFill, seerBook, seerForKnight, seerInfo, takenKnights } from "../../module/rules/creation.js";
import { isOwnMyth } from "../../module/rules/book-art.js";
import { findByRef, isOwnRecord, ownIdOf, ownRef, refOf } from "../../module/rules/knight-refs.js";
import { ownMythKey } from "../../module/rules/own-myths.js";
import { knightEntryByType, knightTableFill } from "../../module/rules/knight-tables.js";
import { withSentences } from "../../module/rules/knight-table-sentences.js";
import {
	bookToOwnKnight,
	clearOfTheBook,
	holderRenames,
	emptyOwnKnight,
	isBlankOwnKnight,
	knightNameClash,
	linesOf,
	normaliseOwnKnight,
	ownKnightChanged,
	ownKnightEntry,
	ownSeerEntry,
	scoreOf,
	seerNameClash,
	withJoinsKept,
	withOwnKnights
} from "../../module/rules/own-knights.js";
import { seerActor } from "../../module/rules/seer-npcs.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// Every Knight and Seer here is invented, so no book text lives in the repository.

const fallbacks = { table: "Their Table", column: (number) => `Column ${number}` };
const kitNames = { dagger: "Dagger", torches: "Torches", rope: "Rope", rations: "Rations", camping: "Camping gear" };
const kitWeaponNames = { shockwave: "Shockwave" };

const written = normaliseOwnKnight({
	knight: {
		verse: "Under the bridge\nthe river keeps count",
		img: "worlds/test/knights/ferry.webp",
		property: ["Boat hook (d8 long), oilskin (A1)", "Little bell (see below)"],
		ability: { name: "Cross Over", text: "Once per day you may walk on water.", list: "" },
		passion: { name: "Toll", text: "Restore SPI when you are paid for a crossing." },
		worksLike: "106",
		table: {
			name: "Bell",
			columns: { 0: "Metal", 1: "Sound" },
			rows: { 0: { 0: "Tin", 1: "Clank" }, 5: { 0: "Gold", 1: "Peal" } },
			sentences: { 0: "Your bell is {entry}.", 1: "" }
		}
	},
	seer: {
		name: "The Reed Seer",
		img: "worlds/test/seers/reed.webp",
		stats: { vig: "7", cla: 12, spi: "15", guard: "4" },
		lines: "A1 (wet cloak)\nStaff (d6)\nHums to the fish."
	}
});

describe("normaliseOwnKnight", () => {
	it("reads a form's text boxes and numbered fields", () => {
		expect(written.knight.verse).toEqual(["Under the bridge", "the river keeps count"]);
		expect(written.knight.ability.list).toEqual([]);
		expect(written.knight.worksLike).toBe(106);
		expect(written.knight.table.rows).toHaveLength(6);
		expect(written.knight.table.rows[5]).toEqual(["Gold", "Peal"]);
		expect(written.knight.table.rows[2]).toEqual(["", ""]);
		expect(written.knight.table.sentences).toEqual(["Your bell is {entry}.", ""]);
		expect(written.seer.stats).toEqual({ vig: 7, cla: 12, spi: 15, guard: 4 });
		expect(written.seer.lines).toHaveLength(3);
	});

	it("survives anything at all", () => {
		for (const raw of [null, undefined, 3, "x", [], { knight: 4, seer: "y" }]) {
			expect(normaliseOwnKnight(raw)).toEqual(emptyOwnKnight());
		}
	});

	it("knows a blank Knight from a written one", () => {
		expect(isBlankOwnKnight(emptyOwnKnight())).toBe(true);
		expect(isBlankOwnKnight(written)).toBe(false);
		expect(ownKnightChanged(written, normaliseOwnKnight(written))).toBe(false);
	});

	it("keeps a worksLike page only when it's a page", () => {
		expect(normaliseOwnKnight({ knight: { worksLike: "" } }).knight.worksLike).toBeNull();
		expect(normaliseOwnKnight({ knight: { worksLike: 0 } }).knight.worksLike).toBeNull();
		expect(normaliseOwnKnight({ knight: { worksLike: "x" } }).knight.worksLike).toBeNull();
	});
});

describe("linesOf and scoreOf", () => {
	it("splits a text box into its written lines", () => {
		expect(linesOf("a\r\n\n  b  \n")).toEqual(["a", "b"]);
		expect(linesOf(["a", "", 3])).toEqual(["a"]);
		expect(linesOf(null)).toEqual([]);
	});

	it("reads scores", () => {
		expect([scoreOf("12"), scoreOf(0), scoreOf(""), scoreOf(null), scoreOf(-1), scoreOf("2.5")]).toEqual([12, 0, null, null, null, null]);
	});
});

describe("ownKnightEntry and ownSeerEntry", () => {
	const knight = ownKnightEntry("abc", "The Ferry Knight", written, fallbacks);
	const seer = ownSeerEntry("abc", written);

	it("shapes a written Knight as the index shapes the book's", () => {
		expect(knight).toMatchObject({
			own: "abc", roll: null, page: null, kitPage: 106, name: "The Ferry Knight",
			path: "worlds/test/knights/ferry.webp", token: "worlds/test/knights/ferry.webp",
			verse: ["Under the bridge", "the river keeps count"],
			ability: { name: "Cross Over", text: "Once per day you may walk on water." },
			passion: { name: "Toll", text: "Restore SPI when you are paid for a crossing." }
		});
		expect(knight.ability).not.toHaveProperty("list");
		expect(knight.table).toEqual({
			name: "Bell",
			columns: ["Metal", "Sound"],
			rows: [["Tin", "Clank"], ["", ""], ["", ""], ["", ""], ["", ""], ["Gold", "Peal"]],
			sentences: ["Your bell is {entry}.", ""]
		});
	});

	it("leaves out an unnamed Ability, an unwritten table and an unnamed Seer", () => {
		const bare = normaliseOwnKnight({ knight: { ability: { text: "No name" } } });
		const entry = ownKnightEntry("x", "The Bare Knight", bare, fallbacks);
		expect(entry.ability).toBeNull();
		expect(entry.table).toBeNull();
		expect(entry.verse).toBeNull();
		expect(ownSeerEntry("x", bare)).toBeNull();
	});

	it("names an unnamed table and its columns", () => {
		const entry = ownKnightEntry("x", "The Bare Knight", normaliseOwnKnight({ knight: { table: { rows: [["a", "b"]] } } }), fallbacks);
		expect(entry.table.name).toBe("Their Table");
		expect(entry.table.columns).toEqual(["Column 1", "Column 2"]);
		expect(entry.table).not.toHaveProperty("sentences");
	});

	it("shapes the Seer as the book's", () => {
		expect(seer).toEqual({
			own: "abc", roll: null, d6: null, d12: null, page: null, name: "The Reed Seer",
			path: "worlds/test/seers/reed.webp", stats: { vig: 7, cla: 12, spi: 15, guard: 4 },
			lines: ["A1 (wet cloak)", "Staff (d6)", "Hums to the fish."], prompts: null
		});
		expect(seerBook(seer)).toEqual({ vig: 7, cla: 12, spi: 15, guard: 4, armour: 1, structure: false });
	});

	it("makes Items as a book Knight's, with the kit of the Ability it works like", () => {
		const items = knightItems(knight, kitNames, kitWeaponNames);
		expect(items.find((item) => item.type === "ability").system.weapon).toBe("shockwave");
		expect(items.find((item) => item.name === "Shockwave")).toBeTruthy();
		expect(items.find((item) => item.name.startsWith("Boat hook")).type).toBe("weapon");
		expect(items.find((item) => item.type === "armour")).toBeTruthy();
	});

	it("makes a Seer NPC told by the written Knight's ref", () => {
		const actor = seerActor(seer, knight, { attackName: "Attack", knighted: () => "", folder: () => "" });
		expect(actor.flags[SYSTEM_ID].seer).toBe("own:abc");
		expect(actor.sort).toBe(0);
		expect(actor.system.armour).toBe(1);
	});
});

describe("refs", () => {
	it("tells a written Knight's ref from a roll", () => {
		expect(ownRef("abc")).toBe("own:abc");
		expect(ownIdOf("own:abc")).toBe("abc");
		expect([ownIdOf("1-01"), ownIdOf("own:"), ownIdOf(null)]).toEqual([null, null, null]);
		expect(refOf({ own: "abc", roll: null })).toBe("own:abc");
		expect(refOf({ roll: "1-01" })).toBe("1-01");
		expect(isOwnRecord({ own: "" })).toBe(false);
	});

	it("tells a written Myth by the same test and the same ref", () => {
		expect(isOwnMyth).toBe(isOwnRecord);
		expect(ownMythKey({ own: "abc" })).toBe(ownRef("abc"));
	});

	it("finds by ref in a list of both", () => {
		const list = [{ roll: "1-01" }, { own: "abc", roll: null }];
		expect(findByRef(list, "own:abc")).toBe(list[1]);
		expect(findByRef(list, "1-01")).toBe(list[0]);
		expect(findByRef(list, null)).toBeNull();
	});
});

describe("with the book's Knights", () => {
	const book = {
		version: 17,
		knights: [{ roll: "1-01", page: 28, name: "The Lantern Knight" }],
		seers: [{ roll: "1-01", page: 28, name: "The Glass Seer", stats: { vig: 8, cla: 13, spi: 16, guard: 3 }, lines: ["Sees far."] }]
	};
	const knight = ownKnightEntry("abc", "The Ferry Knight", written, fallbacks);
	const seer = ownSeerEntry("abc", written);
	const index = withOwnKnights(book, { knights: [knight], seers: [seer] });

	it("puts the written ones after the book's, and stands without an import", () => {
		expect(index.version).toBe(17);
		expect(index.knights.map((entry) => entry.name)).toEqual(["The Lantern Knight", "The Ferry Knight"]);
		expect(withOwnKnights(null, { knights: [knight], seers: [seer] }).knights).toEqual([knight]);
	});

	it("finds a written Knight by name, and pairs them with their own Seer", () => {
		expect(knightEntryByType(index, "Ferry")).toBe(knight);
		expect(seerForKnight(index, { knightType: "Ferry" })).toBe(seer);
		expect(seerForKnight(index, { knightType: "Lantern" })).toBe(book.seers[0]);
	});

	it("never pairs a written Knight with another's Seer for want of a roll", () => {
		const other = ownKnightEntry("def", "The Moth Knight", emptyOwnKnight(), fallbacks);
		const both = withOwnKnights(null, { knights: [knight, other], seers: [seer] });
		expect(seerForKnight(both, { knightType: "Moth" })).toBeNull();
	});

	it("fills a sheet from a written Knight", () => {
		const update = seerAutoFill(index, { knightType: "Ferry", seer: "", seerImg: "", seerInfo: "" });
		expect(update["system.seer"]).toBe("The Reed Seer");
		expect(update["system.seerBook"].guard).toBe(4);
		const table = knightTableFill(knight.table, { knightType: "Ferry" }, null)["system.bookTable"];
		expect(table.sentences).toEqual(["Your bell is {entry}.", ""]);
		expect(table.page).toBeNull();
	});

	it("tells a written table's results in its own sentences", () => {
		const stored = { page: null, sentences: ["Your bell is {entry}.", ""] };
		const lines = withSentences(stored, [{ index: 0, entry: "Tin" }, { index: 1, entry: "Clank" }], () => "not used");
		expect(lines[0].sentence.parts.map((part) => part.text).join("")).toBe("Your bell is tin.");
		expect(lines[1].sentence).toBeNull();
	});

	it("counts a written Knight as taken by their ref", () => {
		const taken = takenKnights([{ id: "a", name: "Sir Aled", knightType: "Ferry" }, { id: "b", name: "Dame Brin", knightType: "Lantern" }], index.knights);
		expect(taken).toEqual(new Map([["own:abc", "Sir Aled"], ["1-01", "Dame Brin"]]));
	});

	it("never lets a written Knight with a book Knight's name take their place", () => {
		const clash = ownKnightEntry("zzz", "The Lantern Knight", written, fallbacks);
		const clashing = withOwnKnights(book, { knights: [clash] });
		// Left out wherever the Knights are listed, so no chooser or picker has to remember to.
		expect(clashing.knights).toEqual(book.knights);
		expect(clearOfTheBook([clash, knight], book.knights)).toEqual([knight]);
		expect(clearOfTheBook([clash], [])).toEqual([clash]);
		expect(knightEntryByType(clashing, "Lantern")).toBe(book.knights[0]);
		expect(takenKnights([{ id: "a", name: "Sir Aled", knightType: "Lantern" }], clashing.knights)).toEqual(new Map([["1-01", "Sir Aled"]]));
	});

	it("finds names that clash", () => {
		expect(knightNameClash("lantern", index.knights)).toBe(book.knights[0]);
		expect(knightNameClash("The Ferry Knight", index.knights, "abc")).toBeNull();
		expect(knightNameClash("Ferry", index.knights, "other")).toBe(knight);
		expect(knightNameClash("", index.knights)).toBeNull();
		expect(seerNameClash("glass", index.seers)).toBe(book.seers[0]);
		expect(seerNameClash("The Reed Seer", index.seers, "abc")).toBeNull();
	});
});

describe("bookToOwnKnight", () => {
	// An invented Knight printed on a page that has a kit, so the copy borrows it.
	const bookKnight = {
		d6: 3, d12: 4, roll: "3-04", page: 106, name: "The Kite Knight",
		path: "mythic-bastionland-art/knights/3-04-kite-knight.webp",
		token: "mythic-bastionland-art/knight-tokens/3-04-kite-knight.webp",
		verse: ["High on the wind", "low on the ground"],
		property: ["Spiked boots (d6), padded coat (A1)", "Kite (see below)", "Twin hatchets (d6 each when wielded as a pair)"],
		ability: { name: "Drop", text: "You can leap from any height.", list: ["Land on your feet", "Land on a foe"] },
		passion: { name: "Updraft", text: "Restore SPI when you see the land from above." },
		table: { name: "Kite", columns: ["Shape", "Colour"], rows: [["Bird", "Red"], ["Fish", "Blue"], ["Star", "Green"], ["Box", "Black"], ["Moon", "White"], ["Eye", "Gold"]] }
	};
	const bookSeer = {
		d6: 3, d12: 4, roll: "3-04", page: 106, name: "The Wind Seer",
		path: "mythic-bastionland-art/seers/3-04-wind-seer.webp",
		stats: { vig: 9, cla: 14, spi: 12, guard: 5 },
		lines: ["A2 (feather cloak)", "Gust (d8 blast)", "Speaks only in whispers."]
	};
	const { name, data } = bookToOwnKnight(bookKnight, bookSeer, (column) => (column === 1 ? "Your kite is shaped like {a entry}." : { line: "Its colour: {entry}.", join: "{entry}." }));
	const knight = ownKnightEntry("abc", name, data, fallbacks);
	const seer = ownSeerEntry("abc", data);

	it("copies every part of the page", () => {
		expect(name).toBe("The Kite Knight");
		expect(data.knight.worksLike).toBe(106);
		expect(data.knight.token).toBe(bookKnight.token);
		expect(data.knight.table.sentences).toEqual(["Your kite is shaped like {a entry}.", "Its colour: {entry}."]);
		expect(data.knight.table.joins).toEqual(["", "{entry}."]);
		expect(data.seer.stats).toEqual(bookSeer.stats);
	});

	it("joins a column onto the one before as the book Knight's table does", () => {
		expect(knight.table.joins).toEqual(["", "{entry}."]);
		const stored = knightTableFill(knight.table, { knightType: "Kite" }, null)["system.bookTable"];
		expect(stored.joins).toEqual(["", "{entry}."]);
		const lines = withSentences(stored, [{ index: 0, entry: "Bird" }, { index: 1, entry: "Red" }], () => "not used");
		expect(lines).toHaveLength(1);
		// One sentence, with a bold entry from each column.
		expect(lines[0].sentence.parts.filter((part) => part.bold).map((part) => part.text)).toEqual(["bird", "red"]);
	});

	it("keeps a join only while its sentence is the one it was copied with", () => {
		const kept = withJoinsKept(data, normaliseOwnKnight({ ...data, knight: { ...data.knight, verse: ["Changed"] } }));
		expect(kept.knight.table.joins).toEqual(["", "{entry}."]);
		const rewritten = normaliseOwnKnight({ ...data, knight: { ...data.knight, table: { ...data.knight.table, sentences: ["Your kite is shaped like {a entry}.", "It is {entry}."], joins: [] } } });
		expect(withJoinsKept(data, rewritten).knight.table.joins).toEqual(["", ""]);
		// The form has no field for a join, so one sent without it is still kept.
		const fromForm = normaliseOwnKnight({ ...data, knight: { ...data.knight, table: { ...data.knight.table, joins: undefined } } });
		expect(withJoinsKept(data, fromForm).knight.table.joins).toEqual(["", "{entry}."]);
	});

	it("gives a Knight just as the book's would", () => {
		const start = STARTS[0];
		expect(knightItems(knight, kitNames, kitWeaponNames)).toEqual(knightItems(bookKnight, kitNames, kitWeaponNames));
		expect(knightUpdate({ start, knight, seer })).toEqual(knightUpdate({ start, knight: bookKnight, seer: bookSeer }));
		expect(seerInfo(seer)).toBe(seerInfo(bookSeer));
		expect(seerBook(seer)).toEqual(seerBook(bookSeer));
		expect(knightTableFill(knight.table, { knightType: "Kite" }, null)["system.bookTable"].rows)
			.toEqual(knightTableFill(bookKnight.table, { knightType: "Kite" }, 106)["system.bookTable"].rows);
		expect(knight.verse).toEqual(bookKnight.verse);
	});

	it("borrows no kit from a page without one, and copies a token only when it's its own", () => {
		const plain = bookToOwnKnight({ ...bookKnight, page: 29, token: bookKnight.path }, null).data;
		expect(plain.knight.worksLike).toBeNull();
		expect(plain.knight.token).toBe("");
		expect(plain.seer.name).toBe("");
	});
});

describe("holderRenames", () => {
	const knights = [
		{ id: "a", name: "Sir Aled", system: { knightType: "Ferry", seer: "The Reed Seer", bookTable: { knight: "Ferry" }, bookVerse: { knight: "Ferry" } } },
		{ id: "b", name: "Dame Brin", system: { knightType: "Lantern", seer: "The Reed Seer", bookTable: { knight: "Lantern" }, bookVerse: { knight: "" } } },
		{ id: "c", name: "Odd", system: { knightType: "Lantern", seer: "The Glass Seer", bookTable: { knight: "" }, bookVerse: { knight: "" } } }
	];

	it("renames the Knights who go by the old name, their table and verse with them", () => {
		expect(holderRenames(knights, { fromType: "The Ferry Knight", toType: "Barge" })).toEqual([
			{ id: "a", name: "Sir Aled", update: { "system.knightType": "Barge", "system.bookTable.knight": "Barge", "system.bookVerse.knight": "Barge" } }
		]);
	});

	it("renames whoever the Seer knighted", () => {
		expect(holderRenames(knights, { fromSeer: "reed", toSeer: "The Rush Seer" }).map(({ id, update }) => [id, update]))
			.toEqual([["a", { "system.seer": "The Rush Seer" }], ["b", { "system.seer": "The Rush Seer" }]]);
	});

	it("asks nothing where no name changed or none is given", () => {
		expect(holderRenames(knights, { fromType: "Ferry", toType: "Ferry" })).toEqual([]);
		expect(holderRenames(knights, {})).toEqual([]);
		expect(holderRenames(knights, { fromType: "Ferry", toType: "" })).toEqual([]);
	});
});
