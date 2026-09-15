import { describe, expect, it } from "vitest";
import { d6Band, readRefereeTable, REFEREE_TABLES } from "../../module/rules/referee-rolls.js";

describe("d6Band", () => {
	it.each([[1, 0], [2, 1], [3, 1], [4, 2], [5, 2], [6, 2]])("reads %i as result %i", (d6, band) => {
		expect(d6Band(d6)).toBe(band);
	});

	it.each([0, 7, 2.5, Number.NaN])("rejects %s", (d6) => {
		expect(() => d6Band(d6)).toThrow(RangeError);
	});
});

describe("readRefereeTable", () => {
	it("gives each table three results, worst first", () => {
		for (const table of REFEREE_TABLES) expect(table.results).toHaveLength(3);
		expect(readRefereeTable("luck", 1)).toEqual({ result: "crisis", side: null });
		expect(readRefereeTable("luck", 3)).toEqual({ result: "problem", side: null });
		expect(readRefereeTable("luck", 6)).toEqual({ result: "blessing", side: null });
	});

	it("drifts left on a 2 and right on a 3 when Travelling Blind", () => {
		expect(readRefereeTable("blind", 2)).toEqual({ result: "drift", side: "left" });
		expect(readRefereeTable("blind", 3)).toEqual({ result: "drift", side: "right" });
		expect(readRefereeTable("blind", 1).side).toBeNull();
	});

	it("has nothing for a table the book doesn't print", () => {
		expect(readRefereeTable("fortune", 4)).toBeNull();
	});
});
