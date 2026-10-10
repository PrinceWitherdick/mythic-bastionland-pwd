import { describe, expect, it } from "vitest";
import { REFEREE_TABLES } from "../../module/rules/referee-rolls.js";
import { HARDSHIPS, PHASES, SEASONS } from "../../module/rules/time.js";
import {
	D6_BANDS,
	TRAVEL_GROUPS,
	TRAVEL_RULES,
	TRAVEL_SIDES,
	groupsOnSide,
	normaliseTravelRulesScroll,
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
	const screen = { left: 120, top: 40, right: 1600, bottom: 1040 };

	it("stands against the map's edges, level with its top and as tall as it, whichever way the map has been panned and zoomed", () => {
		const map = { left: 500, top: -300, right: 1100, bottom: 1400 };
		expect(travelRulesPlacement(screen, { side: "right", map, width: 380 })).toEqual({ left: 1112, top: -300, maxHeight: 1700 });
		expect(travelRulesPlacement(screen, { side: "left", map, width: 380 })).toEqual({ left: 108, top: -300, maxHeight: 1700 });
	});

	it("is never shorter than can be read, however far out the map is zoomed", () => {
		expect(travelRulesPlacement(screen, { map: { left: 700, top: 500, right: 900, bottom: 600 }, width: 380 })).toMatchObject({ top: 500, maxHeight: 240 });
	});

	it("grows its gap from the map with the interface scale", () => {
		expect(travelRulesPlacement(screen, { side: "left", map: { left: 800, right: 1000 }, width: 300, scale: 1.5 }).left).toBe(332);
	});

	it("stands inside the sidebar on the right, under the navigation and above the hotbar", () => {
		expect(travelRulesPlacement(screen, { width: 380 })).toEqual({ left: 1208, top: 52, maxHeight: 976 });
	});

	it("stands inside the tool palette on the left, its own width away from that edge", () => {
		expect(travelRulesPlacement(screen, { side: "left", width: 380 })).toEqual({ left: 132, top: 52, maxHeight: 976 });
	});

	it("keeps both panels whole inside the room the interface leaves", () => {
		for (const side of TRAVEL_SIDES) {
			const { left, top, maxHeight } = travelRulesPlacement(screen, { side, width: 380 });
			expect(left).toBeGreaterThanOrEqual(screen.left);
			expect(left + 380).toBeLessThanOrEqual(screen.right);
			expect(top).toBeGreaterThanOrEqual(screen.top);
			expect(top + maxHeight).toBeLessThanOrEqual(screen.bottom);
		}
	});

	it("is never shorter than can be read, on a short screen", () => {
		expect(travelRulesPlacement({ left: 0, top: 400, right: 900, bottom: 600 })).toMatchObject({ top: 412, maxHeight: 240 });
	});

	it("grows its gap and least height with the interface scale", () => {
		expect(travelRulesPlacement(screen, { width: 380, scale: 1.5 })).toEqual({ left: 1012, top: 58, maxHeight: 964 });
		expect(travelRulesPlacement({ left: 0, top: 400, right: 1000, bottom: 600 }, { scale: 1.5 }).maxHeight).toBe(360);
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

describe("normaliseTravelRulesScroll", () => {
	it("starts both sides at the top", () => {
		expect(normaliseTravelRulesScroll(undefined)).toEqual({ left: 0, right: 0 });
	});

	it("keeps each side its own whole-pixel scroll and drops the rest", () => {
		expect(normaliseTravelRulesScroll({ left: 120.6, right: 48, top: 9 })).toEqual({ left: 121, right: 48 });
	});

	it("starts at the top from anything that isn't a distance down", () => {
		expect(normaliseTravelRulesScroll({ left: -40, right: "far" })).toEqual({ left: 0, right: 0 });
	});
});
