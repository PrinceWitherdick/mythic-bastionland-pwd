import { describe, expect, it } from "vitest";
import {
	HEX_LORE_VERSION,
	MAX_HEX_SPARKS,
	emptyLore,
	forgetSpark,
	loreAt,
	normaliseHexLore,
	recordSpark,
	setNote,
	wildernessSparkSet
} from "../../module/rules/hex-lore.js";

const hex = (col, row) => ({ col, row });

// Invented, so no book text lives in the repository.
const spark = (id, table = "Ground") => ({
	id,
	page: "nature",
	table,
	rolls: [4, 9],
	entries: ["Sunken", "Thicket"],
	prompt: "Sunken Thicket",
	when: { age: 1, season: "spring", day: 3, phase: "morning" }
});

describe("normaliseHexLore", () => {
	it("gives an empty store for anything that isn't one", () => {
		for (const raw of [undefined, null, "", 7, [], {}, { hexes: [] }, { hexes: "no" }]) {
			expect(normaliseHexLore(raw)).toEqual(emptyLore());
		}
	});

	it("keeps only keys that name a hex", () => {
		const lore = normaliseHexLore({ hexes: { "3,4": { note: "here" }, "up a bit": { note: "there" }, "": { note: "nowhere" } } });
		expect(Object.keys(lore.hexes)).toEqual(["3,4"]);
	});

	it("drops a record that says nothing, and stamps the version", () => {
		const lore = normaliseHexLore({ version: 99, hexes: { "1,1": { note: "   ", sparks: [] }, "2,2": { note: "caves" } } });
		expect(lore).toEqual({ version: HEX_LORE_VERSION, hexes: { "2,2": { note: "caves", sparks: [] } } });
	});

	it("drops a roll with no table or nothing rolled, and names the rest by where they sat", () => {
		const lore = normaliseHexLore({
			hexes: {
				"2,2": {
					note: "",
					sparks: [{ table: "", entries: ["a"] }, { table: "Ground", entries: [] }, { table: "Ground", entries: ["Sunken", "Thicket"], rolls: [4, "x"] }]
				}
			}
		});
		expect(lore.hexes["2,2"].sparks).toEqual([
			{ id: "2", page: "", table: "Ground", rolls: [4], entries: ["Sunken", "Thicket"], prompt: "Sunken Thicket", when: null }
		]);
	});

	it("keeps a calendar only when it reads as one", () => {
		const of = (when) => normaliseHexLore({ hexes: { "1,1": { sparks: [{ ...spark("a"), when }] } } }).hexes["1,1"].sparks[0].when;
		expect(of({ age: 1, season: "spring", day: 3, phase: "morning" })).toEqual({ age: 1, season: "spring", day: 3, phase: "morning" });
		expect(of({ age: "one", season: "spring", day: 3, phase: "morning" })).toBeNull();
		expect(of(null)).toBeNull();
	});
});

describe("recordSpark", () => {
	it("keeps rolls where they were made, oldest first, without touching other hexes", () => {
		const first = recordSpark(emptyLore(), hex(3, 4), spark("a"));
		const both = recordSpark(first, hex(3, 4), spark("b"));
		const elsewhere = recordSpark(both, hex(5, 1), spark("c"));

		expect(elsewhere.hexes["3,4"].sparks.map(({ id }) => id)).toEqual(["a", "b"]);
		expect(elsewhere.hexes["5,1"].sparks.map(({ id }) => id)).toEqual(["c"]);
		// The store it was given is left as it was.
		expect(first.hexes["3,4"].sparks.map(({ id }) => id)).toEqual(["a"]);
	});

	it("says nothing for a roll that says nothing", () => {
		const lore = emptyLore();
		expect(recordSpark(lore, hex(1, 1), { table: "", entries: [] })).toBe(lore);
	});

	it("drops the oldest roll once a hex is full", () => {
		let lore = emptyLore();
		for (let number = 0; number <= MAX_HEX_SPARKS; number++) lore = recordSpark(lore, hex(1, 1), spark(`s${number}`));
		const kept = lore.hexes["1,1"].sparks.map(({ id }) => id);
		expect(kept).toHaveLength(MAX_HEX_SPARKS);
		expect(kept[0]).toBe("s1");
		expect(kept.at(-1)).toBe(`s${MAX_HEX_SPARKS}`);
	});
});

describe("forgetSpark", () => {
	it("strikes out one roll and leaves the rest", () => {
		const lore = recordSpark(recordSpark(emptyLore(), hex(3, 4), spark("a")), hex(3, 4), spark("b"));
		expect(forgetSpark(lore, hex(3, 4), "a").hexes["3,4"].sparks.map(({ id }) => id)).toEqual(["b"]);
	});

	it("forgets the hex once the last roll goes and nothing is written", () => {
		const lore = recordSpark(emptyLore(), hex(3, 4), spark("a"));
		expect(forgetSpark(lore, hex(3, 4), "a").hexes).toEqual({});
	});

	it("keeps the hex when there is still something written", () => {
		const lore = setNote(recordSpark(emptyLore(), hex(3, 4), spark("a")), hex(3, 4), "caves");
		expect(forgetSpark(lore, hex(3, 4), "a").hexes["3,4"]).toEqual({ note: "caves", sparks: [] });
	});

	it("does nothing for a roll that isn't there", () => {
		const lore = recordSpark(emptyLore(), hex(3, 4), spark("a"));
		expect(forgetSpark(lore, hex(3, 4), "z")).toBe(lore);
		expect(forgetSpark(lore, hex(9, 9), "a")).toBe(lore);
	});
});

describe("setNote", () => {
	it("writes what's in a hex, trimmed", () => {
		expect(setNote(emptyLore(), hex(2, 2), "  cliffs and caves \n").hexes["2,2"]).toEqual({ note: "cliffs and caves", sparks: [] });
	});

	it("forgets a hex once the writing is rubbed out and no rolls are left", () => {
		const written = setNote(emptyLore(), hex(2, 2), "cliffs");
		expect(setNote(written, hex(2, 2), "   ").hexes).toEqual({});
	});

	it("keeps the rolls when the writing goes", () => {
		const lore = setNote(recordSpark(emptyLore(), hex(2, 2), spark("a")), hex(2, 2), "cliffs");
		expect(setNote(lore, hex(2, 2), "").hexes["2,2"].sparks.map(({ id }) => id)).toEqual(["a"]);
	});
});

describe("loreAt", () => {
	it("finds nothing in a hex nothing was written about", () => {
		expect(loreAt(emptyLore(), hex(1, 1))).toBeNull();
		expect(loreAt(null, hex(1, 1))).toBeNull();
	});

});

describe("wildernessSparkSet", () => {
	const page = (count) => ({ tables: Array.from({ length: count }, (_unused, index) => ({ name: `Table ${index}` })) });

	it("takes the first table of each row of a page read whole", () => {
		expect(wildernessSparkSet(page(9)).map(({ index }) => index)).toEqual([0, 3, 6]);
	});

	it("falls back to the first three of a page the import couldn't read whole", () => {
		expect(wildernessSparkSet(page(4)).map(({ index }) => index)).toEqual([0, 1, 2]);
		expect(wildernessSparkSet(page(2)).map(({ index }) => index)).toEqual([0, 1]);
	});

	it("gives nothing for a page that was never read", () => {
		for (const missing of [null, undefined, {}, { tables: [] }]) expect(wildernessSparkSet(missing)).toEqual([]);
	});

	it("hands back the tables themselves, so a roll keeps the name the import read", () => {
		expect(wildernessSparkSet(page(9)).map(({ table }) => table.name)).toEqual(["Table 0", "Table 3", "Table 6"]);
	});
});
