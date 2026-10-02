import { describe, expect, it } from "vitest";
import { BOOK_PROMPT_PAGE, SPREAD_SIDES, bookNames, chosenPrompts, pagePrompts, promptSpark, spreadPrompts } from "../../module/rules/book-flip.js";
import { SPARK_PAGES } from "../../module/rules/spark-tables.js";
import { emptyLore, latestWilderness, loreAt, recordSpark } from "../../module/rules/hex-lore.js";

/** Made-up prompts in the book's shape, since none of its text ships. */
const KNIGHT = [
	{ label: "Person", value: "Weary pedlar" },
	{ label: "Name", value: "Odo" },
	{ label: "Beast", value: "Lame heron" }
];
const MYTH = [
	{ label: "Dwelling", value: "Reed hut" },
	{ label: "Hazard", value: "Sinking bank" }
];

describe("pagePrompts", () => {
	it("keys each prompt by its side and place, carrying the page it's printed on", () => {
		expect(pagePrompts(KNIGHT, "knight", 30)).toEqual([
			{ key: "knight:0", side: "knight", page: 30, label: "Person", value: "Weary pedlar" },
			{ key: "knight:1", side: "knight", page: 30, label: "Name", value: "Odo" },
			{ key: "knight:2", side: "knight", page: 30, label: "Beast", value: "Lame heron" }
		]);
	});

	it("leaves out anything unreadable, and reads nothing from a page never read", () => {
		const read = [{ label: " Object ", value: " Rope " }, { label: "Theme" }, null, { value: "Loose" }];
		expect(pagePrompts(read, "myth", 31)).toEqual([{ key: "myth:0", side: "myth", page: 31, label: "Object", value: "Rope" }]);
		expect(pagePrompts(null, "knight", 30)).toEqual([]);
	});
});

describe("spreadPrompts", () => {
	it("finds the Knight's page and the Myth's facing it from the d6 and d12, as the book's spreads run", () => {
		const pages = spreadPrompts({ d6: 1, d12: 2 }, { knight: KNIGHT, myth: MYTH });
		expect(Object.keys(pages)).toEqual([...SPREAD_SIDES]);
		expect(pages.knight.page).toBe(30);
		expect(pages.myth.page).toBe(31);
		expect(pages.knight.prompts.map((prompt) => prompt.value)).toEqual(["Weary pedlar", "Odo", "Lame heron"]);
		expect(pages.myth.prompts.map((prompt) => prompt.page)).toEqual([31, 31]);
	});

	it("reaches the last spread of the book", () => {
		const pages = spreadPrompts({ d6: 6, d12: 12 }, {});
		expect(pages.knight.page).toBe(170);
		expect(pages.myth.page).toBe(171);
		expect(pages.myth.prompts).toEqual([]);
	});
});

describe("chosenPrompts", () => {
	const pages = spreadPrompts({ d6: 1, d12: 2 }, { knight: KNIGHT, myth: MYTH });

	it("gives the prompts chosen in the order the book prints them, whatever order they were clicked in", () => {
		expect(chosenPrompts(pages, ["myth:1", "knight:2", "knight:0"]).map((prompt) => prompt.key)).toEqual(["knight:0", "knight:2", "myth:1"]);
	});

	it("ignores keys from another spread, and gives nothing with nothing chosen", () => {
		expect(chosenPrompts(pages, ["knight:9"])).toEqual([]);
		expect(chosenPrompts(pages, new Set())).toEqual([]);
		expect(chosenPrompts(null, ["knight:0"])).toEqual([]);
	});
});

describe("promptSpark", () => {
	const [person] = pagePrompts(KNIGHT, "knight", 30);
	const when = { age: 1, season: "spring", day: 1, phase: "morning" };
	const spark = promptSpark(person, { d6: 1, d12: 2 }, { id: "p1", table: "Person (p30)", when });

	it("is kept by a hex like a Spark Table roll, with the spread's dice as its rolls", () => {
		expect(spark).toEqual({ id: "p1", page: BOOK_PROMPT_PAGE, table: "Person (p30)", rolls: [1, 2], entries: ["Weary pedlar"], prompt: "Weary pedlar", when });
		const hex = { col: 2, row: 3 };
		const lore = recordSpark(emptyLore(), hex, spark);
		expect(loreAt(lore, hex).sparks).toEqual([spark]);
	});

	it("is filed apart from the Spark Tables' pages, so a hex's wilderness still reads from its Nature rolls alone", () => {
		expect(SPARK_PAGES.map(({ key }) => key)).not.toContain(BOOK_PROMPT_PAGE);
		expect(latestWilderness({ note: "", sparks: [spark] })).toEqual([]);
	});
});

describe("bookNames", () => {
	it("gathers each Seer's Name prompt once, whatever its case, in the order read", () => {
		const seers = [
			{ page: 28, prompts: KNIGHT },
			{ page: 30, prompts: [{ label: "Person", value: "Old miller" }, { label: "name", value: "Wenna" }] },
			{ page: 32, prompts: [{ label: "Name", value: "ODO" }] },
			{ page: 34, prompts: null },
			{ page: 36 }
		];
		expect(bookNames(seers)).toEqual(["Odo", "Wenna"]);
	});

	it("gives none for an index without Seers", () => {
		expect(bookNames(undefined)).toEqual([]);
		expect(bookNames([])).toEqual([]);
	});
});
