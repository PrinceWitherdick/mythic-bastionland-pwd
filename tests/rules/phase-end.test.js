import { describe, expect, it } from "vitest";
import { PHASE_END_MODES, likelyPhaseMode, morningHardships, wildernessDue } from "../../module/rules/phase-end.js";
import { HARDSHIPS } from "../../module/rules/time.js";

describe("likelyPhaseMode", () => {
	it("travels by day, camps through the Night, and stays indoors in a Holding", () => {
		expect(likelyPhaseMode({ phase: "morning" })).toBe("travel");
		expect(likelyPhaseMode({ phase: "night" })).toBe("camp");
		expect(likelyPhaseMode({ phase: "night", movedTonight: true })).toBe("travel");
		expect(likelyPhaseMode({ phase: "afternoon", holding: true })).toBe("indoors");
		expect(likelyPhaseMode({ phase: "night", holding: true })).toBe("indoors");
	});

	it("was on the move wherever a Barrier turned it back, Holding or no", () => {
		expect(likelyPhaseMode({ phase: "night", holding: true, atBarrier: true })).toBe("travel");
	});

	it("gives only modes the window offers", () => {
		for (const phase of ["morning", "afternoon", "night"]) {
			for (const holding of [false, true]) expect(PHASE_END_MODES).toContain(likelyPhaseMode({ phase, holding }));
		}
	});
});

describe("wildernessDue", () => {
	it("rolls in the Wilderness and shows a Myth's Omen, unless the Company slept indoors", () => {
		expect(wildernessDue({ calls: "roll", mode: "travel" })).toBe(true);
		expect(wildernessDue({ calls: "roll", mode: "camp" })).toBe(true);
		expect(wildernessDue({ calls: "omen", mode: "travel" })).toBe(true);
		expect(wildernessDue({ calls: "roll", mode: "indoors" })).toBe(false);
	});

	it("makes no roll in a Holding, or where no Realm shows the Company, but does at a Barrier", () => {
		expect(wildernessDue({ calls: "none", mode: "travel" })).toBe(false);
		expect(wildernessDue({ calls: null, mode: "travel" })).toBe(false);
		expect(wildernessDue({ calls: "none", mode: "travel", atBarrier: true })).toBe(true);
	});
});

describe("morningHardships", () => {
	it("costs nothing to those who slept indoors, fed", () => {
		expect(morningHardships({ mode: "indoors", winter: true, dire: true })).toEqual([]);
		expect(morningHardships({ mode: "camp" })).toEqual([]);
	});

	it("costs SPI and sleep for travelling through the Night, and VIG too in Winter", () => {
		expect(morningHardships({ mode: "travel" })).toEqual(["night", "sleep"]);
		expect(morningHardships({ mode: "travel", winter: true })).toEqual(["night", "winter", "sleep"]);
		expect(morningHardships({ mode: "camp", winter: true })).toEqual(["winter"]);
	});

	it("lets nobody outdoors sleep properly in dire weather", () => {
		expect(morningHardships({ mode: "camp", dire: true })).toEqual(["sleep"]);
	});

	it("takes each member's own lost sleep and hunger, once each", () => {
		expect(morningHardships({ mode: "indoors" }, { noSleep: true, deprived: true })).toEqual(["sleep", "supplies"]);
		expect(morningHardships({ mode: "travel" }, { noSleep: true })).toEqual(["night", "sleep"]);
	});

	it("names only the book's hardships", () => {
		const keys = HARDSHIPS.map(({ key }) => key);
		expect(morningHardships({ mode: "travel", winter: true, dire: true }, { noSleep: true, deprived: true }).every((kind) => keys.includes(kind))).toBe(true);
	});
});
