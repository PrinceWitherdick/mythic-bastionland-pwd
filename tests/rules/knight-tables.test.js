import { describe, expect, it } from "vitest";
import {
	hasTable,
	knightEntryByType,
	knightRenewal,
	knightTableFill,
	knightVerse,
	knightVerseFill,
	clauseMidSentence,
	namePartsWithoutSeeBelow,
	pointsBelow,
	renewalDue,
	splitAtRenewal,
	tableItemId,
	tableRenewal,
	tableResults,
	withoutSeeBelow,
	withRolls
} from "../../module/rules/knight-tables.js";

// Names and text here are invented so no book text lives in the repository.

const table = {
	name: "What Is in the Sack?",
	columns: ["Found on", "Smells of"],
	rows: [1, 2, 3, 4, 5, 6].map((row) => [`Found ${row}`, `Smell ${row}`])
};

const stored = (rolls = [0, 0]) => ({ knight: "Sack", page: 40, ...table, rolls });

describe("pointsBelow and tableItemId", () => {
	it("finds the possession that points at the table", () => {
		expect(pointsBelow("Hooked lamp (d8) marked with a sigil (see below)")).toBe(true);
		expect(pointsBelow("Sack of odds (otherwise you find a trinket, as below)")).toBe(true);
		expect(pointsBelow("Grumbling mule (VIG 9, 3GD)")).toBe(false);
		expect(pointsBelow(null)).toBe(false);

		const items = [{ id: "a", name: "Hooked lamp (d8)" }, { id: "b", name: "Companion (see below)" }, { id: "c", name: "Later (see below)" }];
		expect(tableItemId(items)).toBe("b");
		expect(tableItemId(items.slice(0, 1))).toBeNull();
	});
});

describe("withoutSeeBelow", () => {
	it.each([
		["Lantern (see below)", "Lantern"],
		["Mule (see below) (VIG 9, 3GD)", "Mule (VIG 9, 3GD)"],
		["Grumbling mule (VIG 9, 3GD, see below)", "Grumbling mule (VIG 9, 3GD)"],
		["Pickles (see below, restock each new Season)", "Pickles (restock each new Season)"],
		["Tin wings (A1, can't swim, but see below)", "Tin wings (A1, can't swim)"],
		["Odd lamp (lit at dusk, see below. Never at noon)", "Odd lamp (lit at dusk. Never at noon)"],
		["Cracked jar (spills everywhere. See below for mending it)", "Cracked jar (spills everywhere)"],
		["Sack of odds (otherwise you find a trinket, as below)", "Sack of odds (otherwise you find a trinket)"],
		["Old club (d8, see below), cap (A1), helm (A1, see below)", "Old club (d8), cap (A1), helm (A1)"],
		["Hooked lamp (d8 hefty)", "Hooked lamp (d8 hefty)"]
	])("%s", (name, shown) => {
		expect(withoutSeeBelow(name)).toBe(shown);
	});
});

describe("namePartsWithoutSeeBelow", () => {
	it("leaves no comma after the head where the aside stood", () => {
		expect(namePartsWithoutSeeBelow({ nameHead: "Odd body", nameSep: "", nameRest: "(see below), hidden under a cloak (A1)" }))
			.toEqual({ nameHead: "Odd body", nameSep: "", nameRest: "hidden under a cloak (A1)" });
	});

	it("keeps a comma the book puts after the head itself", () => {
		expect(namePartsWithoutSeeBelow({ nameHead: "Sack of maps", nameSep: ",", nameRest: "a locked casket (see below)" }))
			.toEqual({ nameHead: "Sack of maps", nameSep: ",", nameRest: "a locked casket" });
	});

	it("drops the comma when nothing is left after the head", () => {
		expect(namePartsWithoutSeeBelow({ nameHead: "Lantern", nameSep: "", nameRest: "(see below)" }))
			.toEqual({ nameHead: "Lantern", nameSep: "", nameRest: "" });
		expect(namePartsWithoutSeeBelow({ nameHead: "Lantern", nameSep: ",", nameRest: "see below" }))
			.toEqual({ nameHead: "Lantern", nameSep: "", nameRest: "" });
	});
});

describe("knightEntryByType", () => {
	const index = { knights: [{ name: "The Lantern Knight", page: 28 }, { name: "The Sack Knight", page: 40 }, { name: null }] };

	it("finds a Knight by the name they're known by, whatever the case", () => {
		expect(knightEntryByType(index, "sack ")).toEqual({ name: "The Sack Knight", page: 40 });
		expect(knightEntryByType(index, "")).toBeNull();
		expect(knightEntryByType(index, "Glass")).toBeNull();
		expect(knightEntryByType(null, "Sack")).toBeNull();
	});
});

describe("knightTableFill", () => {
	it("copies the table in, unrolled, for a Knight who holds none", () => {
		const update = knightTableFill(table, { knightType: "Sack", bookTable: null }, 40);
		expect(update).toEqual({ "system.bookTable": { ...stored(), rows: table.rows } });
		// A copy, so the index isn't changed by what the Knight does with it.
		update["system.bookTable"].rows[0][0] = "Changed";
		expect(table.rows[0][0]).toBe("Found 1");
	});

	it("leaves a Knight's own table alone, rolls and all", () => {
		expect(knightTableFill(table, { knightType: "Sack", bookTable: stored([3, 0]) }, 40)).toEqual({});
	});

	it("swaps in the new table for a Knight chosen again", () => {
		const update = knightTableFill(table, { knightType: "Lantern", bookTable: stored([3, 5]) }, 28);
		expect(update["system.bookTable"]).toMatchObject({ knight: "Lantern", page: 28, rolls: [0, 0] });
	});

	it("does nothing without a table or a Knight", () => {
		expect(knightTableFill(null, { knightType: "Sack" }, 40)).toEqual({});
		expect(knightTableFill(table, { knightType: " " }, 40)).toEqual({});
	});
});

describe("knightVerseFill and knightVerse", () => {
	const verse = ["A line about lamps", "and one about wicks"];

	it("copies the verse in for a Knight who holds none, or another Knight's", () => {
		const update = knightVerseFill(verse, { knightType: " Lantern ", bookVerse: { knight: "", lines: [] } });
		expect(update).toEqual({ "system.bookVerse": { knight: "Lantern", lines: verse } });
		expect(update["system.bookVerse"].lines).not.toBe(verse);
		expect(knightVerseFill(verse, { knightType: "Lantern", bookVerse: { knight: "Sack", lines: ["x"] } })).toMatchObject({ "system.bookVerse": { knight: "Lantern" } });
	});

	it("leaves the Knight's own alone, and does nothing without a verse or a Knight", () => {
		expect(knightVerseFill(verse, { knightType: "Lantern", bookVerse: { knight: "Lantern", lines: ["x"] } })).toEqual({});
		expect(knightVerseFill(null, { knightType: "Lantern" })).toEqual({});
		expect(knightVerseFill([], { knightType: "Lantern" })).toEqual({});
		expect(knightVerseFill(verse, { knightType: "" })).toEqual({});
	});

	it("shows the verse only while they're known as the Knight it was taken for", () => {
		const bookVerse = { knight: "Lantern", lines: verse };
		expect(knightVerse({ knightType: "Lantern ", bookVerse })).toBe(verse);
		expect(knightVerse({ knightType: "Sack", bookVerse })).toBeNull();
		expect(knightVerse({ knightType: "Lantern", bookVerse, isSquire: true })).toBeNull();
		expect(knightVerse({ knightType: "Lantern", bookVerse: { knight: "Lantern", lines: [] } })).toBeNull();
	});
});

describe("withRolls and tableResults", () => {
	it("sets only the columns rolled", () => {
		expect(withRolls(stored([2, 4]), [1], [6])).toEqual([2, 6]);
		expect(withRolls(stored(), [0, 1], [1, 3])).toEqual([1, 3]);
		expect(withRolls({ ...stored(), rolls: [] }, [1], [5])).toEqual([0, 5]);
		expect(withRolls(stored([2, 4]), [0, 1], [0, 0])).toEqual([0, 0]);
	});

	it("reads what each column rolled gave", () => {
		expect(tableResults(stored([2, 6]))).toEqual([
			{ index: 0, column: "Found on", roll: 2, entry: "Found 2" },
			{ index: 1, column: "Smells of", roll: 6, entry: "Smell 6" }
		]);
		expect(tableResults(stored([0, 3]))).toEqual([{ index: 1, column: "Smells of", roll: 3, entry: "Smell 3" }]);
		expect(tableResults(stored())).toEqual([]);
		expect(tableResults(null)).toEqual([]);
	});

	it("tells a table from an empty one", () => {
		expect(hasTable(stored())).toBe(true);
		expect(hasTable({ knight: "", name: "", columns: [], rows: [], rolls: [] })).toBe(false);
		expect(hasTable(undefined)).toBe(false);
	});
});

describe("tableRenewal", () => {
	const item = (name, description = "") => ({ name, system: { description } });

	it("reads when the table comes round from the possession's own aside", () => {
		expect(tableRenewal(item("Jar of pickles (see below, restock each new Season)"))).toEqual({ cadence: "season", clause: "restock each new Season", source: "name" });
		expect(tableRenewal(item("Owl mask (a borrowed face by starlight, see below, rolling each night)"))).toMatchObject({ cadence: "night", clause: "rolling each night" });
		expect(tableRenewal(item("Bitter tea (you brew one cup each day, soothes CLA, see below)"))).toMatchObject({ cadence: "day", clause: "you brew one cup each day" });
		expect(tableRenewal(item("Odd seeds (a new bloom each time, see below. One handful each day. It fades by dusk)"))).toMatchObject({ cadence: "day", clause: "One handful each day" });
	});

	it("keeps a condition with the words after it", () => {
		expect(tableRenewal(item("Glass egg (see below, you know what hatches. If cracked, find a new egg at the start of the next Season)")))
			.toMatchObject({ cadence: "season", clause: "If cracked, find a new egg at the start of the next Season" });
	});

	it("looks only in the aside that points at the table", () => {
		expect(tableRenewal(item("Pepper (makes stale bread taste fresh, restock each new Season), clay whistle (see below)"))).toBeNull();
		expect(tableRenewal(item("Jar of pickles (see below)"))).toBeNull();
		expect(tableRenewal(item("Plain rope"))).toBeNull();
		expect(tableRenewal(null)).toBeNull();
	});

	it("looks in the notes when the aside was read into them", () => {
		const paragraph = "<p>Restock each new Season</p>";
		expect(tableRenewal(item("2 firepots (see below)", `<p>Thrown</p>${paragraph}`))).toEqual({ cadence: "season", clause: "Restock each new Season", source: "description", paragraph });
	});

	it("finds it through the Knight's table", () => {
		const knight = {
			type: "knight",
			system: { isSquire: false, bookTable: stored() },
			items: { contents: [{ id: "a", type: "gear", sort: 0, name: "Jar of pickles (see below, restock each new Season)" }] }
		};
		expect(knightRenewal(knight)).toMatchObject({ cadence: "season" });
		expect(knightRenewal({ ...knight, system: { isSquire: true, bookTable: stored() } })).toBeNull();
	});
});

describe("splitAtRenewal", () => {
	it("splits the shown gloss right after the words saying when", () => {
		expect(splitAtRenewal("(restock each new Season)", { cadence: "season" })).toEqual({ before: "(restock each new Season", after: ")" });
		expect(splitAtRenewal("(a new bloom each time. One handful each day. It fades by dusk)", { cadence: "day" }))
			.toEqual({ before: "(a new bloom each time. One handful each day", after: ". It fades by dusk)" });
		expect(splitAtRenewal("(nothing about time)", { cadence: "season" })).toBeNull();
	});

	it("says it mid-sentence", () => {
		expect(clauseMidSentence("Restock each new Season")).toBe("restock each new Season");
		expect(clauseMidSentence("If cracked, find a new egg")).toBe("if cracked, find a new egg");
		expect(clauseMidSentence("VIG each day")).toBe("VIG each day");
	});
});

describe("renewalDue", () => {
	const at = (season, day, phase, age = 1) => ({ age, season, day, phase });

	it("comes due in a later Season, a later Day, or another Night", () => {
		expect(renewalDue("season", at("spring", 3, "night"), at("spring", 9, "morning"))).toBe(false);
		expect(renewalDue("season", at("winter", 3, "night"), at("spring", 1, "morning", 2))).toBe(true);
		expect(renewalDue("day", at("spring", 3, "night"), at("spring", 3, "night"))).toBe(false);
		expect(renewalDue("day", at("spring", 3, "night"), at("spring", 4, "morning"))).toBe(true);
		expect(renewalDue("night", at("spring", 3, "morning"), at("spring", 3, "afternoon"))).toBe(false);
		expect(renewalDue("night", at("spring", 3, "morning"), at("spring", 3, "night"))).toBe(true);
		expect(renewalDue("night", at("spring", 3, "night"), at("spring", 3, "night"))).toBe(false);
		expect(renewalDue("night", at("spring", 3, "night"), at("spring", 4, "night"))).toBe(true);
	});

	it("comes due in the next year's Spring, of the same Age or not", () => {
		expect(renewalDue("season", at("winter", 1, "morning"), { ...at("spring", 1, "morning"), year: 2 })).toBe(true);
		expect(renewalDue("season", at("spring", 5, "night"), { ...at("spring", 1, "morning"), year: 2 })).toBe(true);
		expect(renewalDue("season", at("winter", 1, "morning"), at("spring", 1, "morning"))).toBe(false);
	});

	it("isn't due with no record of the last roll, or with the Age set back", () => {
		expect(renewalDue("season", null, at("winter", 1, "morning"))).toBe(false);
		expect(renewalDue("season", at("winter", 1, "morning", 2), at("spring", 1, "morning"))).toBe(false);
	});
});
