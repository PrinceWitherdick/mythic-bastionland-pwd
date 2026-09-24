import { describe, expect, it } from "vitest";
import {
	LANDMARK_EFFECTS,
	LANDMARK_OFFERS,
	OFF_COURSE_SHOWN,
	OFF_COURSE_STATES,
	landmarkEffect,
	offCourseShown,
	offCourseState,
	samePhase,
	throwsOffCourse
} from "../../module/rules/landmarks.js";
import { LANDMARK_TYPES } from "../../module/rules/realm.js";

const at = (day, phase, { age = 1, season = "spring" } = {}) => ({ age, season, day, phase });

describe("LANDMARK_EFFECTS", () => {
	it("covers every Landmark type the book prints, and nothing else", () => {
		expect(Object.keys(LANDMARK_EFFECTS)).toEqual([...LANDMARK_TYPES]);
	});

	it("asks something of travellers at four of the six", () => {
		const asking = LANDMARK_TYPES.filter((type) => LANDMARK_EFFECTS[type].offer || LANDMARK_EFFECTS[type].offCourse);
		expect(asking).toEqual(["monument", "hazard", "curse", "ruin"]);
	});

	it("leaves Dwellings and Sanctums as places rather than demands", () => {
		for (const type of ["dwelling", "sanctum"]) {
			expect(LANDMARK_EFFECTS[type]).toEqual({ offer: null, virtue: null, offCourse: false, icon: null });
		}
	});

	it("restores SPI at a Monument and takes VIG at a Hazard, as the book says", () => {
		expect(LANDMARK_EFFECTS.monument).toMatchObject({ offer: "restoreSpirit", virtue: "spi" });
		expect(LANDMARK_EFFECTS.hazard).toMatchObject({ offer: "pushThrough", virtue: "vig" });
	});

	it("names only offers the actions know", () => {
		const offers = LANDMARK_TYPES.map((type) => LANDMARK_EFFECTS[type].offer).filter(Boolean);
		expect(offers.every((offer) => LANDMARK_OFFERS.includes(offer))).toBe(true);
		expect(new Set(offers).size).toBe(offers.length);
	});
});

describe("landmarkEffect", () => {
	it("reads a type's effect", () => {
		expect(landmarkEffect("ruin")).toMatchObject({ offer: "echoMyth" });
	});

	it("gives nothing for anything that isn't a Landmark type", () => {
		expect(landmarkEffect("holding")).toBeNull();
		expect(landmarkEffect(undefined)).toBeNull();
	});
});

describe("throwsOffCourse", () => {
	it("is the Curse alone", () => {
		expect(LANDMARK_TYPES.filter(throwsOffCourse)).toEqual(["curse"]);
		expect(throwsOffCourse("nonsense")).toBe(false);
	});
});

describe("samePhase", () => {
	it("holds only for the same Phase of the same Day of the same Season and Age", () => {
		expect(samePhase(at(3, "night"), at(3, "night"))).toBe(true);
		expect(samePhase(at(3, "night"), at(3, "morning"))).toBe(false);
		expect(samePhase(at(3, "night"), at(4, "night"))).toBe(false);
		expect(samePhase(at(3, "night"), at(3, "night", { season: "winter" }))).toBe(false);
		expect(samePhase(at(3, "night"), at(3, "night", { age: 2 }))).toBe(false);
	});

	it("refuses anything that isn't a calendar, rather than reading it as the first Phase", () => {
		expect(samePhase({}, at(1, "morning"))).toBe(false);
		expect(samePhase(null, null)).toBe(false);
		expect(samePhase({ age: 1, season: "spring", day: 1, phase: "dusk" }, at(1, "morning"))).toBe(false);
	});
});

describe("offCourseState", () => {
	it("waits out the Phase the Curse struck in", () => {
		expect(offCourseState(at(3, "morning"), at(3, "morning"))).toBe("pending");
	});

	it("blights the Phase that follows", () => {
		expect(offCourseState(at(3, "morning"), at(3, "afternoon"))).toBe("live");
		// A Curse found at Night blights the next Day's Morning.
		expect(offCourseState(at(3, "night"), at(4, "morning"))).toBe("live");
	});

	it("lapses once that Phase has passed", () => {
		expect(offCourseState(at(3, "morning"), at(3, "night"))).toBe("lapsed");
		expect(offCourseState(at(3, "night"), at(4, "afternoon"))).toBe("lapsed");
	});

	it("lapses when the calendar was set somewhere else entirely", () => {
		expect(offCourseState(at(3, "morning"), at(1, "morning"))).toBe("lapsed");
		expect(offCourseState(at(3, "morning"), at(3, "morning", { season: "winter" }))).toBe("lapsed");
	});

	it("gives nothing while no Curse is carried", () => {
		expect(offCourseState(null, at(1, "morning"))).toBeNull();
		expect(offCourseState(undefined, at(1, "morning"))).toBeNull();
		expect(offCourseState({}, at(1, "morning"))).toBeNull();
	});

	it("only ever gives a state the rules name", () => {
		const states = [
			offCourseState(at(2, "morning"), at(2, "morning")),
			offCourseState(at(2, "morning"), at(2, "afternoon")),
			offCourseState(at(2, "morning"), at(9, "night"))
		];
		expect(states.every((state) => OFF_COURSE_STATES.includes(state))).toBe(true);
	});
});

describe("offCourseShown", () => {
	it("is worth a word while pending or live, and not once lapsed", () => {
		expect(offCourseShown(at(3, "morning"), at(3, "morning"))).toBe(true);
		expect(offCourseShown(at(3, "morning"), at(3, "afternoon"))).toBe(true);
		expect(offCourseShown(at(3, "morning"), at(3, "night"))).toBe(false);
		expect(offCourseShown(null, at(3, "night"))).toBe(false);
	});

	it("shows exactly the states the rules say to show", () => {
		expect(OFF_COURSE_SHOWN.every((state) => OFF_COURSE_STATES.includes(state))).toBe(true);
		expect(OFF_COURSE_SHOWN).not.toContain("lapsed");
	});
});
