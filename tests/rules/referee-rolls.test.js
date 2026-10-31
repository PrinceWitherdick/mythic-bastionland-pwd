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
	const at = (phase, day = 1, more = {}) => ({ age: 1, year: 1, season: "winter", day, phase, ...more });
	const kept = (rolled, when, before = null) => ({ when, rolled, result: rolled, before });

	it("treats a second Looming threat in a row as dire weather (p18)", () => {
		expect(weatherAfter("looming", kept("looming", at("morning")), at("afternoon"))).toMatchObject({ result: "dire", streak: true });
		expect(weatherAfter("looming", kept("fine", at("morning")), at("afternoon"))).toMatchObject({ result: "looming", streak: false });
		expect(weatherAfter("looming", null, at("afternoon"))).toMatchObject({ result: "looming", streak: false, before: null });
		expect(weatherAfter("fine", kept("looming", at("morning")), at("afternoon"))).toMatchObject({ result: "fine", streak: false });
	});

	it("runs on from one Day's Night to the next Day's Morning", () => {
		expect(weatherAfter("looming", kept("looming", at("night", 4)), at("morning", 5))).toMatchObject({ result: "dire", streak: true });
	});

	it("keeps the run going through a third Looming, read against what the die gave", () => {
		const second = kept("looming", at("afternoon"), { when: at("morning"), rolled: "looming" });
		expect(weatherAfter("looming", second, at("night"))).toMatchObject({ result: "dire", streak: true });
	});

	it("breaks the run where a Phase went by with no roll, as one spent in a Holding", () => {
		expect(weatherAfter("looming", kept("looming", at("morning")), at("night"))).toMatchObject({ result: "looming", streak: false });
	});

	it("breaks the run across Seasons and years: last Winter's Looming isn't this Winter's", () => {
		const lastWinter = kept("looming", at("night", 30));
		expect(weatherAfter("looming", lastWinter, at("morning", 1, { year: 2 }))).toMatchObject({ result: "looming", streak: false });
	});

	it("reads a roll made again in the same Phase against the Phase before, so two rolls at once make no run", () => {
		const morning = kept("looming", at("morning"), null);
		expect(weatherAfter("looming", morning, at("morning"))).toMatchObject({ result: "looming", streak: false, before: null });
		const afternoon = kept("fine", at("afternoon"), { when: at("morning"), rolled: "looming" });
		expect(weatherAfter("looming", afternoon, at("afternoon"))).toMatchObject({ result: "dire", streak: true, before: { when: at("morning"), rolled: "looming" } });
	});

	it("keeps the earlier roll it was read against, without that roll's own earlier one", () => {
		const earlier = kept("looming", at("morning"), { when: at("night", 0), rolled: "fine" });
		expect(weatherAfter("fine", earlier, at("afternoon")).before).toEqual({ when: at("morning"), rolled: "looming" });
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
