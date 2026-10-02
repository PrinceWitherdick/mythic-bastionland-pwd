import { describe, expect, it } from "vitest";
import { DAY_PAGE, ELEMENT_SKIES, HEAVY_RAIN, SKY_POSITION, SOLID_FOG, WEATHER_POSITION, dayTables, fogHides, fogIn, rolledSky } from "../../module/rules/sky-weather.js";
import { isWeather } from "../../module/rules/weather.js";
import { sameDay } from "../../module/rules/time.js";
import { SPARK_TABLES_PER_PAGE } from "../../module/rules/spark-tables.js";

const morning = { age: 1, year: 1, season: "spring", day: 4, phase: "morning" };

/** A Spark page of nine tables, each named for where it stands. */
const page = (count = SPARK_TABLES_PER_PAGE) => ({
	key: DAY_PAGE,
	tables: Array.from({ length: count }, (_, index) => ({ name: `Table ${index}`, columns: ["A", "B"], rows: [] }))
});

describe("dayTables", () => {
	it("finds Sky and Weather by where the Nature page prints them", () => {
		const { sky, weather } = dayTables(page());
		expect(DAY_PAGE).toBe("nature");
		expect(sky.name).toBe(`Table ${SKY_POSITION}`);
		expect(weather.name).toBe(`Table ${WEATHER_POSITION}`);
	});

	it("reads the page row by row, as Import PDF does: Land, Sky, Water, then Weather", () => {
		expect(SKY_POSITION).toBe(1);
		expect(WEATHER_POSITION).toBe(3);
	});

	it("gives neither from a page missing a table, since the rest may have shifted", () => {
		expect(dayTables(page(8))).toBeNull();
		expect(dayTables(null)).toBeNull();
		expect(dayTables({ tables: [] })).toBeNull();
	});
});

describe("fogIn", () => {
	it("reads Solid Fog as the fog that hides the neighbouring hexes", () => {
		expect(fogIn(SOLID_FOG)).toBe("solid");
		expect(fogIn([8, 12])).toBe("solid");
	});

	it("leaves any other fog to the Referee, and other weather alone", () => {
		expect(fogIn([1, 12])).toBe("fog");
		expect(fogIn([8, 3])).toBeNull();
		expect(fogIn([5, 5])).toBeNull();
		expect(fogIn(undefined)).toBeNull();
	});
});

describe("sameDay", () => {
	it("takes the Phases of one Day together, and no other Day", () => {
		expect(sameDay(morning, { ...morning, phase: "night" })).toBe(true);
		expect(sameDay(morning, { ...morning, day: 5 })).toBe(false);
		expect(sameDay(morning, { ...morning, year: 2 })).toBe(false);
		expect(sameDay(morning, { ...morning, season: "harvest" })).toBe(false);
		expect(sameDay(null, morning)).toBe(false);
	});

	it("reads a date written before the year was counted as the first year", () => {
		const { year: _year, ...old } = morning;
		expect(sameDay(old, morning)).toBe(true);
	});
});

describe("fogHides", () => {
	const fog = { when: morning };

	it("hides the way for the rest of the day it came down", () => {
		expect(fogHides(fog, morning)).toBe(true);
		expect(fogHides(fog, { ...morning, phase: "afternoon" })).toBe(true);
	});

	it("leaves the Night to its own dark, and lapses with the day", () => {
		expect(fogHides(fog, { ...morning, phase: "night" })).toBe(false);
		expect(fogHides(fog, { ...morning, day: 5 })).toBe(false);
		expect(fogHides(null, morning)).toBe(false);
		expect(fogHides({ when: "public" }, morning)).toBe(false);
	});
});

describe("the sky a weather roll draws", () => {
	const d12 = Array.from({ length: 12 }, (_, index) => index + 1);

	it("draws one of our skies for every second-column d12", () => {
		for (const element of d12) expect(isWeather(ELEMENT_SKIES[element])).toBe(true);
	});

	it("never draws snow, which the table has none of", () => {
		for (const description of d12) {
			for (const element of d12) expect(["snow", "blizzard"]).not.toContain(rolledSky([description, element]));
		}
	});

	it("draws fog wherever the roll is fog, Solid Fog among them", () => {
		expect(rolledSky(SOLID_FOG)).toBe("fog");
		for (const description of d12) expect(rolledSky([description, SOLID_FOG[1]])).toBe("fog");
	});

	it("makes a heavy rain a downpour, and nothing else heavier", () => {
		const rains = d12.filter((element) => ELEMENT_SKIES[element] === "rain");
		expect(rains.length).toBeGreaterThan(0);
		for (const element of rains) {
			for (const description of d12) {
				expect(rolledSky([description, element])).toBe(HEAVY_RAIN.includes(description) ? "downpour" : "rain");
			}
		}
		for (const element of d12.filter((candidate) => !rains.includes(candidate))) {
			for (const description of HEAVY_RAIN) expect(rolledSky([description, element])).toBe(ELEMENT_SKIES[element]);
		}
	});

	it("draws nothing for a roll that isn't one", () => {
		expect(rolledSky(null)).toBeNull();
		expect(rolledSky([])).toBeNull();
		expect(rolledSky([1, 0])).toBeNull();
		expect(rolledSky([1, 13])).toBeNull();
	});
});
