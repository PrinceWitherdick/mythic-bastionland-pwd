import { describe, expect, it } from "vitest";
import { DEFAULT_DIRE_WEATHER_RISK, DIRE_WEATHER_RISKS, LUCK_ODDS, atMercyOfWeather, d6Band, luckAtOdds, readRefereeTable, REFEREE_TABLES, weatherAfter } from "../../module/rules/referee-rolls.js";

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

describe("weatherAfter", () => {
	it("treats a second Looming threat in a row as dire weather", () => {
		expect(weatherAfter("looming", "looming")).toEqual({ result: "dire", streak: true });
		expect(weatherAfter("looming", "fine")).toEqual({ result: "looming", streak: false });
		expect(weatherAfter("looming", null)).toEqual({ result: "looming", streak: false });
		expect(weatherAfter("fine", "looming")).toEqual({ result: "fine", streak: false });
	});
});

describe("atMercyOfWeather", () => {
	it("rolls in Winter as most Realms do, all year, or never", () => {
		expect(DIRE_WEATHER_RISKS).toContain(DEFAULT_DIRE_WEATHER_RISK);
		expect(DEFAULT_DIRE_WEATHER_RISK).toBe("winter");
		expect(atMercyOfWeather("winter", "winter")).toBe(true);
		expect(atMercyOfWeather("winter", "summer")).toBe(false);
		expect(atMercyOfWeather("always", "spring")).toBe(true);
		expect(atMercyOfWeather("never", "winter")).toBe(false);
	});
});

describe("luckAtOdds", () => {
	it("goes the players' way on the odds' number or higher", () => {
		expect(luckAtOdds("even", 3)).toEqual({ favoured: false, needs: 4 });
		expect(luckAtOdds("even", 4)).toEqual({ favoured: true, needs: 4 });
		expect(luckAtOdds("slim", 5).favoured).toBe(false);
		expect(luckAtOdds("slim", 6).favoured).toBe(true);
		expect(luckAtOdds("high", 2).favoured).toBe(true);
		expect(luckAtOdds("high", 1).favoured).toBe(false);
	});

	it("runs from highest to slimmest, one pip apart", () => {
		expect(LUCK_ODDS.map(({ needs }) => needs)).toEqual([2, 3, 4, 5, 6]);
	});

	it("has nothing for odds it doesn't know, and rejects a roll that isn't a d6", () => {
		expect(luckAtOdds("certain", 4)).toBeNull();
		expect(() => luckAtOdds("even", 7)).toThrow(RangeError);
	});
});
