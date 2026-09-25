import { describe, expect, it } from "vitest";
import { REFEREE_TABLES } from "../../module/rules/referee-rolls.js";
import { HARDSHIPS, PHASES, SEASONS } from "../../module/rules/time.js";
import {
	D6_BANDS,
	TRAVEL_GROUPS,
	TRAVEL_RULES,
	TRAVEL_SIDES,
	groupsOnSide,
	normaliseTravelRulesView,
	pressingSections,
	travelRulesPlacement
} from "../../module/rules/travel-rules.js";

const sections = TRAVEL_RULES.flatMap((group) => group.sections);
const sectionKeys = sections.map((section) => section.key);

describe("TRAVEL_RULES", () => {
	it("keeps Travel on p18 before Exploration on p19", () => {
		expect(TRAVEL_GROUPS).toEqual(["travel", "rest", "tables", "exploration", "folklore"]);
		expect(TRAVEL_RULES.map((group) => group.page)).toEqual([18, 18, 18, 19, 19]);
	});

	it("names every section once", () => {
		expect(new Set(sectionKeys).size).toBe(sectionKeys.length);
	});

	it("reads every table in the three d6 bands", () => {
		const tables = sections.filter((section) => section.rows);
		expect(tables.map((section) => section.key)).toEqual(["wildernessRoll", "blind", "weather", "mood"]);
		for (const table of tables) expect(table.rows).toHaveLength(D6_BANDS.length);
	});

	it("reads the Referee's travelling tables as the Referee Rolls do, and rolls them", () => {
		for (const key of ["blind", "weather", "mood"]) {
			const section = sections.find((candidate) => candidate.key === key);
			expect(section.rows).toEqual(REFEREE_TABLES.find((table) => table.key === key).results);
			expect(section.roll).toBe(key);
		}
	});

	it("offers only the Gallop, the Wilderness Roll and the Referee's tables as rolls", () => {
		const rolls = sections.filter((section) => section.roll).map((section) => section.roll);
		expect(rolls).toEqual(["gallop", "wilderness", "blind", "weather", "mood"]);
	});

	it("puts Travel and its rolls on the left, and Rest and Exploration on the right", () => {
		expect(groupsOnSide("left").map((group) => group.key)).toEqual(["travel", "tables"]);
		expect(groupsOnSide("right").map((group) => group.key)).toEqual(["rest", "exploration", "folklore"]);
		expect(TRAVEL_SIDES.flatMap((side) => groupsOnSide(side)).length).toBe(TRAVEL_RULES.length);
		expect(groupsOnSide("right").flatMap((group) => group.sections).some((section) => section.roll)).toBe(false);
	});

	it("puts every hardship's button under the Rest rule that deals it, once", () => {
		const hardships = sections.filter((section) => section.hardship);
		expect(hardships.map((section) => section.hardship).sort()).toEqual(HARDSHIPS.map(({ key }) => key).sort());
		for (const section of hardships) expect(section.hardship).toBe(section.key);
		expect(TRAVEL_RULES.find((group) => group.key === "rest").sections).toEqual(expect.arrayContaining(hardships));
	});

	it("gives a heading to every section that doesn't open its group", () => {
		for (const group of TRAVEL_RULES) {
			const intros = group.sections.filter((section) => section.intro);
			expect(intros.every((section) => section === group.sections[0])).toBe(true);
		}
	});
});

describe("pressingSections", () => {
	it("marks Night at night, Sleep and Supplies each morning, and Winter and Dire Weather in Winter", () => {
		expect([...pressingSections({ season: "spring", phase: "afternoon" })]).toEqual([]);
		expect([...pressingSections({ season: "spring", phase: "night" })]).toEqual(["night"]);
		expect([...pressingSections({ season: "harvest", phase: "morning" })].sort()).toEqual(["sleep", "supplies"]);
		expect([...pressingSections({ season: "winter", phase: "night" })].sort()).toEqual(["night", "weather", "winter"]);
	});

	it("only ever marks sections that exist", () => {
		for (const season of SEASONS) {
			for (const phase of PHASES) {
				for (const key of pressingSections({ season, phase })) expect(sectionKeys).toContain(key);
			}
		}
	});

	it("marks nothing without a calendar", () => {
		expect(pressingSections().size).toBe(0);
	});
});

describe("travelRulesPlacement", () => {
	it("sits against the map's right edge, level with its top and as tall as the map", () => {
		expect(travelRulesPlacement({ left: 532, top: 40, right: 1387, bottom: 1040 })).toEqual({ left: 1399, top: 40, maxHeight: 1000 });
	});

	it("sits against the map's left edge on the left, its own width away", () => {
		expect(travelRulesPlacement({ left: 532, top: 40, right: 1387, bottom: 1040 }, { side: "left" })).toEqual({ left: 220, top: 40, maxHeight: 1000 });
		expect(travelRulesPlacement({ left: 532, top: 40, right: 1387, bottom: 1040 }, { side: "left", width: 320, scale: 1.25 }).left).toBe(117);
	});

	it("stays held to the map while it runs past the top and foot of the screen", () => {
		expect(travelRulesPlacement({ top: -500, right: 2100, bottom: 3000 })).toEqual({ left: 2112, top: -500, maxHeight: 3500 });
		expect(travelRulesPlacement({ top: -2000, right: 900, bottom: 100 })).toEqual({ left: 912, top: -2000, maxHeight: 2100 });
	});

	it("is never shorter than can be read, beside a small map", () => {
		expect(travelRulesPlacement({ top: 400, right: 900, bottom: 600 })).toMatchObject({ top: 400, maxHeight: 240 });
	});

	it("grows its gap and least height with the interface scale", () => {
		expect(travelRulesPlacement({ top: -500, right: 1000, bottom: 3000 }, { scale: 1.5 })).toEqual({ left: 1018, top: -500, maxHeight: 3500 });
		expect(travelRulesPlacement({ top: 400, right: 1000, bottom: 600 }, { scale: 1.5 }).maxHeight).toBe(360);
	});
});

describe("normaliseTravelRulesView", () => {
	it("starts with both sides and every group open", () => {
		expect(normaliseTravelRulesView(undefined)).toEqual({ folded: [], closed: [] });
	});

	it("keeps known sides and groups in order and drops the rest", () => {
		expect(normaliseTravelRulesView({ folded: ["right", "top", "left"], closed: ["folklore", "nonsense", "travel"] }))
			.toEqual({ folded: ["left", "right"], closed: ["travel", "folklore"] });
	});

	it("folds both sides for rules folded before they were split", () => {
		expect(normaliseTravelRulesView({ folded: true }).folded).toEqual(["left", "right"]);
	});

	it("folds nothing from anything else", () => {
		expect(normaliseTravelRulesView({ folded: "yes", closed: "travel" })).toEqual({ folded: [], closed: [] });
	});
});
