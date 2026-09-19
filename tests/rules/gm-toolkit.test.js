import { describe, expect, it } from "vitest";
import { REALM_TABS, TOOLKIT_TABS, mythRollTaken, omenParts, omenStage, pointsOpposite, readMythTable, realmPlaces, resolvedMyths } from "../../module/rules/gm-toolkit.js";

const hex = (col, row) => ({ col, row });

describe("omenStage", () => {
	it("follows a Myth from no Omen met to all six", () => {
		expect(omenStage(0)).toEqual({ current: null, next: 1 });
		expect(omenStage(2)).toEqual({ current: 2, next: 3 });
		expect(omenStage(6)).toEqual({ current: 6, next: null });
	});

	it("reads a count out of range as the nearest it can be", () => {
		expect(omenStage(-3)).toEqual({ current: null, next: 1 });
		expect(omenStage(9)).toEqual({ current: 6, next: null });
		expect(omenStage("x")).toEqual({ current: null, next: 1 });
	});
});

describe("realmPlaces", () => {
	const realm = {
		holdings: [
			{ hex: hex(9, 9), style: "tower", name: "", seat: false },
			{ hex: hex(2, 2), style: "castle", name: "Keep", seat: false },
			{ hex: hex(6, 6), style: "town", name: "Seat", seat: true }
		],
		landmarks: [
			{ hex: hex(1, 9), type: "ruin" },
			{ hex: hex(4, 4), type: "dwelling" },
			{ hex: hex(3, 1), type: "ruin" },
			{ hex: hex(7, 1), type: "sanctum" }
		],
		myths: [{ hex: hex(5, 5), number: 1 }]
	};
	const lore = { hexes: { "5,5": {}, "2,2": {}, "8,3": {}, "1,8": {}, "not a hex": {} } };

	it("puts the Seat of Power first, then the Holdings as the sheet reads", () => {
		expect(realmPlaces(realm, lore).holdings.map((holding) => holding.hex)).toEqual([hex(6, 6), hex(2, 2), hex(9, 9)]);
	});

	it("lists the Landmarks by type in the book's order, then as the sheet reads", () => {
		expect(realmPlaces(realm, lore).landmarks.map((landmark) => landmark.hex)).toEqual([hex(4, 4), hex(7, 1), hex(3, 1), hex(1, 9)]);
	});

	it("adds every other hex something was written about, and none twice", () => {
		expect(realmPlaces(realm, lore).others).toEqual([hex(8, 3), hex(5, 5), hex(1, 8)]);
	});

	it("copes with a Realm that has nothing yet", () => {
		expect(realmPlaces(null, null)).toEqual({ holdings: [], landmarks: [], others: [] });
	});

	it("keeps its pages in the rail's order, the Realm's own before the notes", () => {
		expect(TOOLKIT_TABS[0]).toBe("myths");
		expect(REALM_TABS.every((tab) => TOOLKIT_TABS.includes(tab))).toBe(true);
		expect(TOOLKIT_TABS).toContain("notes");
		expect(REALM_TABS).not.toContain("notes");
	});
});

describe("mythRollTaken", () => {
	const realm = { myths: [{ number: 1, d6: 2, d12: 7 }, { number: 2, d6: 5, d12: 1 }] };

	it("knows a Myth the Realm already has, so a new one is rolled again", () => {
		expect(mythRollTaken(realm, { d6: 2, d12: 7 })).toBe(true);
		expect(mythRollTaken(realm, { d6: 2, d12: 8 })).toBe(false);
		expect(mythRollTaken(null, { d6: 2, d12: 7 })).toBe(false);
	});
});

describe("resolvedMyths", () => {
	it("lists the Myths marked resolved, and not one rolled afresh under the same number", () => {
		const realm = { myths: [{ number: 1, d6: 2, d12: 7 }, { number: 2, d6: 5, d12: 1 }] };
		const notes = { myths: { 1: { roll: "2-07", note: "", resolved: true }, 2: { roll: "6-06", note: "", resolved: true } } };
		expect(resolvedMyths(realm, notes).map((myth) => myth.number)).toEqual([1]);
		expect(resolvedMyths(null, notes)).toEqual([]);
	});
});

describe("omenParts", () => {
	it("marks each \"see opposite\" so it can open the Myth's table", () => {
		expect(omenParts("A lantern swings in the dark (see opposite). It goes out.")).toEqual([
			{ text: "A lantern swings in the dark (", opposite: false },
			{ text: "see opposite", opposite: true },
			{ text: "). It goes out.", opposite: false }
		]);
		expect(pointsOpposite("Roll a new one (See Opposite).")).toBe(true);
	});

	it("leaves other text whole, and nothing as nothing", () => {
		expect(omenParts("The young lurch in opposite directions.")).toEqual([{ text: "The young lurch in opposite directions.", opposite: false }]);
		expect(pointsOpposite("The young lurch in opposite directions.")).toBe(false);
		expect(omenParts(null)).toEqual([]);
		expect(pointsOpposite(null)).toBe(false);
	});
});

describe("readMythTable", () => {
	const table = {
		name: "Wick Table",
		columns: ["Colour", "Smell"],
		rows: [["Tallow", "Smoke"], ["Beeswax", "Honey"], ["Rush", "Reed"], ["Bone", "Ash"], ["Pitch", "Tar"], ["Moon", "Nothing"]]
	};

	it("reads a d6 in each column", () => {
		expect(readMythTable(table, [0, 1], [2, 6])).toEqual([
			{ index: 0, column: "Colour", roll: 2, entry: "Beeswax" },
			{ index: 1, column: "Smell", roll: 6, entry: "Nothing" }
		]);
	});

	it("reads one column alone", () => {
		expect(readMythTable(table, [1], [4])).toEqual([{ index: 1, column: "Smell", roll: 4, entry: "Ash" }]);
	});
});
