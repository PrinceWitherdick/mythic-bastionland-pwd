import { describe, expect, it } from "vitest";
import {
	HEX_NAMES_VERSION,
	MAX_HEX_NAME,
	cleanHexName,
	emptyHexNames,
	hexLabelText,
	hexNameAt,
	normaliseHexNames,
	setHexName
} from "../../module/rules/hex-names.js";

const hex = (col, row) => ({ col, row });
const t = (key, data) => (data ? `${key}${JSON.stringify(data)}` : key);

describe("cleanHexName", () => {
	it("keeps a name on one line, trimmed and cut to length", () => {
		expect(cleanHexName("  The Weeping\n\tFen  ")).toBe("The Weeping Fen");
		expect(cleanHexName("x".repeat(MAX_HEX_NAME + 20))).toHaveLength(MAX_HEX_NAME);
		expect(cleanHexName(null)).toBe("");
		expect(cleanHexName(7)).toBe("");
	});
});

describe("normaliseHexNames", () => {
	it("gives an empty store for anything that isn't one", () => {
		expect(normaliseHexNames(null)).toEqual(emptyHexNames());
		expect(normaliseHexNames({ hexes: "no" })).toEqual(emptyHexNames());
	});

	it("drops bad keys and blank names, and cleans the rest", () => {
		const names = normaliseHexNames({ hexes: { "5,7": { name: " Fen " }, "nope": { name: "Lost" }, "1,1": { name: "  " }, "2,2": "Bare" } });
		expect(names).toEqual({ version: HEX_NAMES_VERSION, hexes: { "5,7": { name: "Fen" } } });
	});
});

describe("setHexName", () => {
	it("names a hex, renames it, and takes the name away with a blank one", () => {
		const named = setHexName(emptyHexNames(), hex(5, 7), "The Weeping Fen");
		expect(hexNameAt(named, hex(5, 7))).toBe("The Weeping Fen");
		const renamed = setHexName(named, hex(5, 7), "Fenwick");
		expect(hexNameAt(renamed, hex(5, 7))).toBe("Fenwick");
		const cleared = setHexName(renamed, hex(5, 7), "   ");
		expect(cleared.hexes).toEqual({});
		expect(hexNameAt(cleared, hex(5, 7))).toBe("");
	});

	it("hands back the same store when the name doesn't change, so nothing is written", () => {
		const named = setHexName(emptyHexNames(), hex(5, 7), "Fen");
		expect(setHexName(named, hex(5, 7), " Fen ")).toBe(named);
		const empty = emptyHexNames();
		expect(setHexName(empty, hex(1, 1), "")).toBe(empty);
	});

	it("leaves the other hexes' records as they were", () => {
		const one = setHexName(emptyHexNames(), hex(1, 1), "Ford");
		const two = setHexName(one, hex(2, 2), "Hill");
		expect(two.hexes["1,1"]).toBe(one.hexes["1,1"]);
	});
});

describe("hexLabelText", () => {
	it("calls a named hex by its name with its column and row after", () => {
		expect(hexLabelText(hex(5, 7), "Fen", t)).toBe(`realm.hexNamed{"name":"Fen","hex":"realm.hex{\\"col\\":5,\\"row\\":7}"}`);
	});

	it("calls a hex with no name by its column and row", () => {
		expect(hexLabelText(hex(5, 7), "", t)).toBe(`realm.hex{"col":5,"row":7}`);
	});
});
