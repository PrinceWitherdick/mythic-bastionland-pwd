import { describe, expect, it } from "vitest";
import {
	HEX_LORE_VERSION,
	MAX_HEX_SPARKS,
	MAX_SPARK_NAME,
	arrivalSparkSet,
	emptyLore,
	forgetSpark,
	latestWilderness,
	loreAt,
	normaliseHexLore,
	normaliseRecord,
	recordSpark,
	renameSpark,
	rollsOnArrival,
	setNote,
	sparkBatches,
	sparkFromRoll,
	sparkKeepTarget,
	takenEntries,
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

describe("renameSpark", () => {
	const two = () => recordSpark(recordSpark(emptyLore(), hex(3, 4), spark("a")), hex(3, 4), spark("b"));

	it("names one roll and leaves the rest", () => {
		const sparks = renameSpark(two(), hex(3, 4), "a", "  Hamo ").hexes["3,4"].sparks;
		expect(sparks[0].name).toBe("Hamo");
		expect(sparks[1]).not.toHaveProperty("name");
	});

	it("takes the name away when it's rubbed out", () => {
		const named = renameSpark(two(), hex(3, 4), "a", "Hamo");
		expect(renameSpark(named, hex(3, 4), "a", " ").hexes["3,4"].sparks[0]).not.toHaveProperty("name");
	});

	it("cuts a long name to length", () => {
		const name = renameSpark(two(), hex(3, 4), "a", "x".repeat(MAX_SPARK_NAME + 10)).hexes["3,4"].sparks[0].name;
		expect(name).toHaveLength(MAX_SPARK_NAME);
	});

	it("does nothing for a roll that isn't there, or a name that hasn't changed", () => {
		const lore = renameSpark(two(), hex(3, 4), "a", "Hamo");
		expect(renameSpark(lore, hex(3, 4), "z", "Odo")).toBe(lore);
		expect(renameSpark(lore, hex(9, 9), "a", "Odo")).toBe(lore);
		expect(renameSpark(lore, hex(3, 4), "a", "Hamo")).toBe(lore);
	});

	it("keeps a person's mark and name through a reload, and gives other rolls neither", () => {
		const lore = normaliseHexLore(renameSpark(recordSpark(emptyLore(), hex(3, 4), { ...spark("a"), person: true }), hex(3, 4), "a", "Hamo"));
		expect(lore.hexes["3,4"].sparks[0]).toMatchObject({ person: true, name: "Hamo" });
		const plain = normaliseHexLore(recordSpark(emptyLore(), hex(3, 4), { ...spark("b"), person: "yes", name: "  " }));
		expect(plain.hexes["3,4"].sparks[0]).toEqual(spark("b"));
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

describe("arrivalSparkSet", () => {
	const page = (count) => ({ tables: Array.from({ length: count }, (_unused, index) => ({ name: `Table ${index}` })) });

	it("takes the land and the feature from a page read whole, leaving the weather to the day", () => {
		expect(arrivalSparkSet(page(9)).map(({ index }) => index)).toEqual([0, 6]);
		expect(arrivalSparkSet(page(9)).map(({ table }) => table.name)).toEqual(["Table 0", "Table 6"]);
	});

	it("rolls nothing unasked from a page read in part, or never read", () => {
		for (const missing of [page(8), page(2), null, undefined, {}, { tables: [] }]) expect(arrivalSparkSet(missing)).toEqual([]);
	});
});

describe("rollsOnArrival", () => {
	it("rolls a Wilderness hex with nothing kept in it", () => {
		expect(rollsOnArrival({ record: null, holding: null })).toBe(true);
	});

	it("leaves a hex the GM has written in or rolled for", () => {
		expect(rollsOnArrival({ record: normaliseRecord({ note: "A ford" }), holding: null })).toBe(false);
		expect(rollsOnArrival({ record: normaliseRecord({ sparks: [spark("a")] }), holding: null })).toBe(false);
	});

	it("leaves a Holding, which isn't Wilderness", () => {
		expect(rollsOnArrival({ record: null, holding: { name: "Keep" } })).toBe(false);
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

describe("takenEntries", () => {
	// Invented, so no book text lives in the repository.
	const table = { columns: ["Shape", "Cover"], rows: Array.from({ length: 12 }, (_unused, row) => [`shape ${row + 1}`, `cover ${row + 1}`]) };

	it("reads the row taken in each column", () => {
		expect(takenEntries(table, [3, 12])).toEqual([
			{ column: "Shape", roll: 3, entry: "shape 3" },
			{ column: "Cover", roll: 12, entry: "cover 12" }
		]);
	});

	it("leaves out a column nothing was taken from", () => {
		expect(takenEntries(table, [null, 5])).toEqual([{ column: "Cover", roll: 5, entry: "cover 5" }]);
		expect(takenEntries(table, [null, null])).toEqual([]);
	});

	it("leaves out a row the table doesn't have", () => {
		expect(takenEntries(table, [13, 1]).map(({ column }) => column)).toEqual(["Cover"]);
	});
});

describe("sparkBatches", () => {
	const at = (id, phase, batch) => ({ ...spark(id), when: { age: 1, season: "spring", day: 3, phase }, ...(batch ? { batch } : {}) });
	const ids = (sparks) => sparkBatches(sparks).map((batch) => batch.map(({ id }) => id));

	it("gathers the rolls kept in one go, oldest first", () => {
		expect(ids([at("a", "morning", "x"), at("b", "morning", "x"), at("c", "morning", "y"), at("d", "night", "z")])).toEqual([["a", "b"], ["c"], ["d"]]);
	});

	it("gathers rolls kept before batches by the moment they were made, side by side", () => {
		expect(ids([at("a", "morning"), at("b", "morning"), at("c", "night"), at("d", "morning")])).toEqual([["a", "b"], ["c"], ["d"]]);
		expect(ids([{ ...spark("a"), when: null }, { ...spark("b"), when: null }])).toEqual([["a", "b"]]);
	});

	it("keeps a batched roll apart from an old one made at the same moment", () => {
		expect(ids([at("a", "morning"), at("b", "morning", "x")])).toEqual([["a"], ["b"]]);
	});

	it("gives nothing for no rolls", () => {
		expect(sparkBatches([])).toEqual([]);
		expect(sparkBatches(undefined)).toEqual([]);
	});

	it("is kept through a store's normalising", () => {
		const lore = normaliseHexLore(recordSpark(emptyLore(), hex(1, 1), { ...spark("a"), batch: "x" }));
		expect(loreAt(lore, hex(1, 1)).sparks[0].batch).toBe("x");
		expect(loreAt(normaliseHexLore(recordSpark(emptyLore(), hex(1, 1), spark("b"))), hex(1, 1)).sparks[0]).not.toHaveProperty("batch");
	});
});

describe("latestWilderness", () => {
	const at = (id, table, day, phase = "morning", page = "nature") => ({ ...spark(id, table), page, when: { age: 1, season: "spring", day, phase } });
	const ids = (record) => latestWilderness(record).map(({ id }) => id);

	it("gives nothing for a hex with no Nature roll", () => {
		expect(ids(null)).toEqual([]);
		expect(ids({ note: "caves", sparks: [] })).toEqual([]);
		expect(ids({ note: "", sparks: [at("a", "Crowd", 2, "morning", "people")] })).toEqual([]);
	});

	it("keeps only the rolls from the latest moment on the calendar, not the latest kept", () => {
		const sparks = [at("new-ground", "Ground", 5), at("new-sky", "Sky", 5), at("old-ground", "Ground", 2), at("old-sky", "Sky", 2), at("old-wet", "Wet", 2)];
		expect(ids({ note: "", sparks })).toEqual(["new-ground", "new-sky"]);
	});

	it("weighs the Phase within a Day", () => {
		expect(ids({ note: "", sparks: [at("night", "Sky", 3, "night"), at("morning", "Sky", 3, "morning")] })).toEqual(["night"]);
	});

	it("gives a table rolled twice at one moment its later roll", () => {
		expect(ids({ note: "", sparks: [at("a", "Sky", 3), at("b", "Ground", 3), at("c", "Sky", 3)] })).toEqual(["b", "c"]);
	});

	it("counts a roll kept with no calendar as the oldest", () => {
		const undated = { ...spark("undated", "Sky"), when: null };
		expect(ids({ note: "", sparks: [at("dated", "Ground", 1), undated] })).toEqual(["dated"]);
		expect(ids({ note: "", sparks: [undated] })).toEqual(["undated"]);
	});
});

describe("sparkFromRoll", () => {
	const page = { key: "nature", name: "Nature", page: 22 };
	const table = { name: "Ground" };
	const when = { age: 1, season: "spring", day: 3, phase: "morning" };

	it("keeps a roll on one table the way a hex holds it", () => {
		const results = [{ column: "A", roll: 4, entry: "Sunken" }, { column: "B", roll: 9, entry: "Thicket" }];
		expect(sparkFromRoll({ page, table, results, id: "x", when })).toEqual(spark("x"));
	});

	it("leaves out a column that gave nothing", () => {
		const results = [{ column: "A", roll: 4, entry: "Sunken" }, { column: "B", roll: 9, entry: null }];
		expect(sparkFromRoll({ page, table, results, id: "x" })).toMatchObject({ rolls: [4], entries: ["Sunken"], prompt: "Sunken", when: null });
	});

	it("is nothing when no column gave anything", () => {
		expect(sparkFromRoll({ page, table, results: [{ column: "A", roll: 4, entry: null }], id: "x" })).toBeNull();
		expect(recordSpark(emptyLore(), hex(1, 1), sparkFromRoll({ page, table, results: [], id: "x" }))).toEqual(emptyLore());
	});
});

describe("sparkKeepTarget", () => {
	const lore = { scene: "realm", hex: hex(2, 3) };
	const company = { scene: "realm", hex: hex(5, 5) };

	it("keeps rolls in the hex the Lay of the Land is open on first", () => {
		expect(sparkKeepTarget({ lore, company })).toBe(lore);
	});

	it("falls back to the Company's hex", () => {
		expect(sparkKeepTarget({ lore: null, company })).toBe(company);
	});

	it("keeps nothing with neither", () => {
		expect(sparkKeepTarget({})).toBeNull();
		expect(sparkKeepTarget()).toBeNull();
	});
});
