import { describe, expect, it } from "vitest";
import { emptyLore, loreAt, recordSpark } from "../../module/rules/hex-lore.js";
import {
	CIVILISATION_PAGE,
	PEOPLE_PAGE,
	dealSparkDice,
	heardOfMyth,
	holdingSparkSet,
	personLine,
	personSpark,
	personTraits,
	sparkDiceCount
} from "../../module/rules/people.js";

// Invented, so no book text lives in the repository.
const table = (name, first = "Left", second = "Right") => ({
	name,
	columns: [first, second],
	rows: Array.from({ length: 12 }, (_, row) => [`${name}-a${row + 1}`, `${name}-b${row + 1}`])
});
const page = (count) => ({ tables: Array.from({ length: count }, (_, index) => table(`T${index}`)) });

describe("the pages", () => {
	it("rolls people from the People page and Holdings from the Civilisation page", () => {
		expect(PEOPLE_PAGE).toBe("people");
		expect(CIVILISATION_PAGE).toBe("civilisation");
	});
});

describe("holdingSparkSet", () => {
	it("takes the page's first row and its last table, by place rather than by name", () => {
		expect(holdingSparkSet(page(9)).map(({ index, table: { name } }) => [index, name])).toEqual([[0, "T0"], [1, "T1"], [2, "T2"], [8, "T8"]]);
	});

	it("takes the first three of a page not read whole, and nothing from a page never read", () => {
		expect(holdingSparkSet(page(5)).map(({ index }) => index)).toEqual([0, 1, 2]);
		expect(holdingSparkSet(page(2)).map(({ index }) => index)).toEqual([0, 1]);
		expect(holdingSparkSet(null)).toEqual([]);
		expect(holdingSparkSet({ tables: [] })).toEqual([]);
	});
});

describe("dealSparkDice", () => {
	it("deals the dice out a column at a time, table after table", () => {
		const tables = [table("Look"), table("Voice")];
		expect(sparkDiceCount(tables)).toBe(4);
		const rolled = dealSparkDice(tables, [1, 12, 5, 6]);
		expect(rolled.map(({ prompt }) => prompt)).toEqual(["Look-a1 Look-b12", "Voice-a5 Voice-b6"]);
		expect(rolled[1].results).toEqual([
			{ column: "Left", roll: 5, entry: "Voice-a5" },
			{ column: "Right", roll: 6, entry: "Voice-b6" }
		]);
	});
});

describe("a person", () => {
	const rolled = dealSparkDice([table("Look"), table("Voice")], [2, 3, 4, 5]);
	const traits = personTraits(rolled);

	it("has a trait for each table, named by it, with its dice", () => {
		expect(traits.map(({ name, prompt, rolls }) => ({ name, prompt, rolls }))).toEqual([
			{ name: "Look", prompt: "Look-a2 Look-b3", rolls: [2, 3] },
			{ name: "Voice", prompt: "Voice-a4 Voice-b5", rolls: [4, 5] }
		]);
	});

	it("leaves out a table whose dice found nothing", () => {
		expect(personTraits(dealSparkDice([table("Look"), table("Voice")], [13, 13, 4, 5])).map(({ name }) => name)).toEqual(["Voice"]);
	});

	it("reads as one line, with the Myth they've heard of last", () => {
		expect(personLine(traits)).toBe("Look: Look-a2 Look-b3 · Voice: Voice-a4 Voice-b5");
		expect(personLine(traits, "Has heard of the Heron")).toBe("Look: Look-a2 Look-b3 · Voice: Voice-a4 Voice-b5 · Has heard of the Heron");
	});

	it("is kept in a hex as one entry among its rolls", () => {
		const when = { age: 1, season: "spring", day: 1, phase: "morning" };
		const spark = personSpark(traits, { id: "p1", table: "A person", heard: "Has heard of the Heron", when });
		expect(spark).toEqual({
			id: "p1",
			page: "people",
			table: "A person",
			rolls: [2, 3, 4, 5],
			entries: ["Look: Look-a2 Look-b3", "Voice: Voice-a4 Voice-b5", "Has heard of the Heron"],
			prompt: "Look: Look-a2 Look-b3 · Voice: Voice-a4 Voice-b5 · Has heard of the Heron",
			when
		});
		const hex = { col: 3, row: 4 };
		expect(loreAt(recordSpark(emptyLore(), hex, spark), hex).sparks).toEqual([spark]);
	});
});

describe("heardOfMyth", () => {
	it("finds the Realm's Myth by a die as big as the Realm has Myths", () => {
		const realm = { myths: [{ number: 1 }, { number: 4 }, { number: 6 }] };
		expect(heardOfMyth(realm, 2)).toEqual({ number: 4 });
		expect(heardOfMyth({ myths: [] }, 1)).toBeNull();
		expect(heardOfMyth(null, 1)).toBeNull();
	});
});
