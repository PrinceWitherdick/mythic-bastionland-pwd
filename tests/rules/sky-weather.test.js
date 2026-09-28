import { describe, expect, it } from "vitest";
import { DAY_PAGE, SKY_POSITION, SOLID_FOG, WEATHER_POSITION, dayTables, fogHides, fogIn } from "../../module/rules/sky-weather.js";
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
