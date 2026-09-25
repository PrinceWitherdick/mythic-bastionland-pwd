import { describe, expect, it } from "vitest";
import { REALM_TABS, TOOLKIT_TABS, mythRollTaken, omenParts, omenStage, pointsOpposite, readMythTable, realmPlaces, resolvedMyths, tableView } from "../../module/rules/gm-toolkit.js";

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

	it("lists the Holdings by column, then row", () => {
		expect(realmPlaces(realm, lore).holdings.map((holding) => holding.hex)).toEqual([hex(2, 2), hex(6, 6), hex(9, 9)]);
	});

	it("lists the Landmarks by column, then row", () => {
		expect(realmPlaces(realm, lore).landmarks.map((landmark) => landmark.hex)).toEqual([hex(1, 9), hex(3, 1), hex(4, 4), hex(7, 1)]);
	});

	it("adds every other hex something was written about, and none twice", () => {
		expect(realmPlaces(realm, lore).others).toEqual([hex(1, 8), hex(5, 5), hex(8, 3)]);
	});

	it("breaks a tie in column by row", () => {
		const column = { holdings: [{ hex: hex(3, 7) }, { hex: hex(3, 2) }], landmarks: [] };
		expect(realmPlaces(column, null).holdings.map((holding) => holding.hex)).toEqual([hex(3, 2), hex(3, 7)]);
	});

	it("lists a Landmark in a Holding's hex once, as the Holding", () => {
		const shared = { ...realm, landmarks: [...realm.landmarks, { hex: hex(2, 2), type: "hazard" }] };
		expect(realmPlaces(shared, lore).landmarks.map((landmark) => landmark.hex)).not.toContainEqual(hex(2, 2));
	});

	const visit = (order) => ({ count: 1, first: { when: null, order }, last: { when: null, order } });
	const journey = { version: 1, next: 4, hexes: { "8,3": visit(1), "6,6": visit(3), "4,2": visit(2) } };

	it("counts a hex the Company came into among the other hexes, even with nothing written", () => {
		expect(realmPlaces(realm, lore, journey).others).toEqual([hex(1, 8), hex(4, 2), hex(5, 5), hex(8, 3)]);
	});

	it("splits the hexes visited from the rest, each by column then row, and keeps the last reached first apart", () => {
		const { visited, unvisited, recent } = realmPlaces(realm, lore, journey);
		expect(visited).toEqual([hex(4, 2), hex(6, 6), hex(8, 3)]);
		expect(unvisited).toEqual([hex(1, 8), hex(1, 9), hex(2, 2), hex(3, 1), hex(4, 4), hex(5, 5), hex(7, 1), hex(9, 9)]);
		expect(recent).toEqual([hex(6, 6), hex(4, 2), hex(8, 3)]);
	});

	it("copes with a Realm that has nothing yet", () => {
		expect(realmPlaces(null, null)).toEqual({ holdings: [], landmarks: [], others: [], visited: [], unvisited: [], recent: [] });
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

	it("drops the ellipsis a heading carries on from its title", () => {
		const lich = { ...table, columns: ["Subject…", "Must..."] };
		expect(readMythTable(lich, [0, 1], [1, 1]).map(({ column }) => column)).toEqual(["Subject", "Must"]);
	});
});

describe("tableView", () => {
	it("heads each column without the ellipsis, and tips it by what it shows", () => {
		const table = { columns: ["Subject…", "Must…"], rows: [["A thief", "Kneel"]] };
		const view = tableView(table, [1, 0], (column) => `Roll ${column}`);
		expect(view.columns).toEqual([
			{ label: "Subject", index: 0, tooltip: "Roll Subject" },
			{ label: "Must", index: 1, tooltip: "Roll Must" }
		]);
		expect(view.rows[0].entries[0]).toEqual({ text: "A thief", column: 0, row: 1, rolled: true });
	});
});
