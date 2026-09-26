import { describe, expect, it } from "vitest";
import {
	afterOldAge,
	agedScore,
	agingSteps,
	cadencesTurned,
	compareCalendars,
	DEFAULT_CALENDAR,
	nextAge,
	nextDay,
	nextPhase,
	nextSeason,
	normalizeCalendar,
	seasonKey
} from "../../module/rules/time.js";

describe("normalizeCalendar", () => {
	it("starts a game on the first Morning of Spring in Age 1", () => {
		expect(normalizeCalendar(undefined)).toEqual({ age: 1, year: 1, season: "spring", day: 1, phase: "morning" });
		expect(DEFAULT_CALENDAR).toEqual(normalizeCalendar(null));
	});

	it("keeps what it can read and replaces the rest", () => {
		expect(normalizeCalendar({ age: 3, season: "winter", day: 0, phase: "dusk" })).toEqual({ age: 3, year: 1, season: "winter", day: 1, phase: "morning" });
		expect(normalizeCalendar({ age: 2.5, year: 4, season: "harvest", day: 4, phase: "night" })).toEqual({ age: 1, year: 4, season: "harvest", day: 4, phase: "night" });
	});
});

describe("advancing time", () => {
	it("moves through the Phases and into the next Day after Night", () => {
		const morning = { age: 1, year: 1, season: "spring", day: 1, phase: "morning" };
		expect(nextPhase(morning).phase).toBe("afternoon");
		expect(nextPhase({ ...morning, phase: "night" })).toEqual({ age: 1, year: 1, season: "spring", day: 2, phase: "morning" });
	});

	it("dawns on the next Day's Morning whatever Phase it was, since weeks passing gives no figure", () => {
		expect(nextDay({ age: 1, season: "spring", day: 4, phase: "night" })).toEqual({ age: 1, year: 1, season: "spring", day: 5, phase: "morning" });
		expect(nextDay({ age: 2, year: 3, season: "winter", day: 1, phase: "morning" })).toEqual({ age: 2, year: 3, season: "winter", day: 2, phase: "morning" });
	});

	it("turns the Season to its first Morning, Winter giving way to the next year's Spring in the same Age", () => {
		expect(nextSeason({ age: 2, year: 3, season: "spring", day: 9, phase: "night" })).toEqual({ age: 2, year: 3, season: "harvest", day: 1, phase: "morning" });
		expect(nextSeason({ age: 2, year: 3, season: "winter", day: 3, phase: "afternoon" })).toEqual({ age: 2, year: 4, season: "spring", day: 1, phase: "morning" });
	});

	it("begins a new Age in the next year's Spring", () => {
		expect(nextAge({ age: 2, year: 3, season: "harvest", day: 5, phase: "night" })).toEqual({ age: 3, year: 4, season: "spring", day: 1, phase: "morning" });
	});

	it("names a Season by its Age", () => {
		expect(seasonKey({ age: 4, season: "winter", day: 2, phase: "night" })).toBe("4-winter");
		expect(seasonKey(nextSeason({ age: 4, season: "winter" }))).toBe("4-2-spring");
		expect(seasonKey({ age: 4, year: 7, season: "harvest" })).toBe("4-7-harvest");
	});
});

describe("compareCalendars", () => {
	const now = { age: 2, season: "harvest", day: 5, phase: "afternoon" };

	it("weighs the Age, then the Season, then the Day, then the Phase", () => {
		expect(compareCalendars(now, now)).toBe(0);
		expect(compareCalendars(now, { ...now, age: 3 })).toBe(-1);
		expect(compareCalendars(now, { ...now, season: "spring" })).toBe(1);
		expect(compareCalendars(now, { ...now, day: 6 })).toBe(-1);
		expect(compareCalendars(now, { ...now, phase: "morning" })).toBe(1);
	});

	it("counts a Day within its Season, so a new Season's first Day comes later", () => {
		expect(compareCalendars(nextSeason(now), now)).toBe(1);
	});

	it("puts the next year's Spring after this year's Winter, and after this year's Spring", () => {
		const winter = { age: 2, year: 5, season: "winter", day: 8, phase: "night" };
		expect(compareCalendars(nextSeason(winter), winter)).toBe(1);
		expect(compareCalendars(nextSeason(winter), { ...winter, season: "spring", day: 30 })).toBe(1);
	});

	it("reads a calendar written before the year was counted as the first year", () => {
		expect(compareCalendars({ age: 1, season: "winter", day: 1, phase: "morning" }, { age: 1, year: 1, season: "winter", day: 1, phase: "morning" })).toBe(0);
	});

	it("puts every step forward after the calendar it was taken from", () => {
		for (const step of [nextPhase, nextDay, nextSeason, nextAge]) expect(compareCalendars(step(now), now)).toBe(1);
	});
});

describe("cadencesTurned", () => {
	const at = (season, day, phase, age = 1) => ({ age, season, day, phase });

	it("names what a change of calendar brings round", () => {
		expect(cadencesTurned(at("spring", 3, "morning"), at("spring", 3, "afternoon"))).toEqual([]);
		expect(cadencesTurned(at("spring", 3, "afternoon"), at("spring", 3, "night"))).toEqual(["night"]);
		expect(cadencesTurned(at("spring", 3, "night"), at("spring", 4, "morning"))).toEqual(["day"]);
		expect(cadencesTurned(at("spring", 3, "night"), at("harvest", 1, "morning"))).toEqual(["season", "day"]);
	});

	it("counts Winter giving way to the next year's Spring in the same Age as a new Season", () => {
		const winter = at("winter", 7, "night");
		expect(cadencesTurned(winter, nextSeason(winter))).toEqual(["season", "day"]);
		expect(cadencesTurned(at("spring", 3, "morning"), { ...at("spring", 3, "night"), year: 2 })).toEqual(["season", "day", "night"]);
	});

	it("brings nothing round for an Age, a Season or a Day set back", () => {
		expect(cadencesTurned(at("spring", 1, "morning", 2), at("winter", 5, "night", 1))).toEqual([]);
		expect(cadencesTurned(at("winter", 1, "morning"), at("spring", 1, "morning"))).toEqual([]);
		expect(cadencesTurned(at("spring", 4, "morning"), at("spring", 3, "morning"))).toEqual([]);
	});
});

describe("growing older", () => {
	it("passes through every Age between the old and the new", () => {
		expect(agingSteps("young", "mature")).toEqual(["mature"]);
		expect(agingSteps("young", "old")).toEqual(["mature", "old"]);
		expect(agingSteps("mature", "old")).toEqual(["old"]);
		expect(agingSteps("old", "young")).toEqual([]);
		expect(agingSteps("mature", "mature")).toEqual([]);
	});

	it("keeps the higher roll on becoming Mature and the lower on becoming Old", () => {
		expect(agedScore({ value: 10, max: 10 }, 14, "mature")).toEqual({ value: 14, max: 14 });
		expect(agedScore({ value: 10, max: 10 }, 7, "mature")).toEqual({ value: 10, max: 10 });
		expect(agedScore({ value: 10, max: 10 }, 7, "old")).toEqual({ value: 7, max: 7 });
		expect(agedScore({ value: 10, max: 10 }, 14, "old")).toEqual({ value: 10, max: 10 });
	});

	it("keeps any loss from the maximum", () => {
		expect(agedScore({ value: 7, max: 10 }, 15, "mature")).toEqual({ value: 12, max: 15 });
		expect(agedScore({ value: 2, max: 10 }, 5, "old")).toEqual({ value: 0, max: 5 });
	});

	it("takes d12 VIG from the Old at the end of an Age, and they die peacefully at 0", () => {
		expect(afterOldAge(12, 5)).toEqual({ max: 7, diesPeacefully: false });
		expect(afterOldAge(4, 9)).toEqual({ max: 0, diesPeacefully: true });
	});
});
