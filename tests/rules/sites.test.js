import { describe, expect, it } from "vitest";
import { createRandom } from "../../module/rules/random.js";
import {
	BOOK_RULES,
	ENTRANCE_KINDS,
	POINT_KINDS,
	POSITION_KEYS,
	ROUTE_KINDS,
	RULE_LIMITS,
	SITE_EDGES,
	SITE_POSITIONS,
	SITE_PRESETS,
	SITE_STEPS,
	STEP_CAN_ROLL,
	STEP_ROLLS,
	STEP_STATES,
	applySiteForm,
	clearSite,
	emptySite,
	entranceCounts,
	isBlankSite,
	markPoint,
	markedPoints,
	normaliseRules,
	normaliseSite,
	numberPoint,
	numberedPoints,
	playerView,
	pointCounts,
	revealEntrance,
	revealEverything,
	revealPoint,
	revealRoute,
	rollEntrances,
	rollPoints,
	rollRoutes,
	rollSite,
	routeCounts,
	routeSlots,
	routesFrom,
	setEntrance,
	setRoute,
	setRules,
	siteChanges,
	siteEdge,
	siteSteps,
	unreachablePoints
} from "../../module/rules/sites.js";

const burial = SITE_PRESETS.find(({ key }) => key === "burial").rules;
const seeds = Array.from({ length: 200 }, (_, index) => `site-${index}`);
const rolled = seeds.map((seed) => rollSite(emptySite(), createRandom(seed)));

/** @returns {string[]} Positions marked, in the order given. */
const mark = (site, ...pairs) => pairs.reduce((next, [key, kind]) => markPoint(next, key, kind), site);

/** The book's example, Blackmoss Isle (p15), drawn by hand: numbers as the book gives them, the top point erased. */
function blackmoss() {
	let site = mark(emptySite(),
		["upperLeft", "feature"], ["lowerLeft", "danger"], ["centre", "feature"],
		["bottom", "feature"], ["lowerRight", "danger"], ["upperRight", "treasure"]);
	site = setRoute(site, "lowerLeft-upperLeft", "open");
	site = setRoute(site, "centre-lowerLeft", "open");
	site = setRoute(site, "centre-lowerRight", "open");
	site = setRoute(site, "centre-bottom", "closed");
	site = setRoute(site, "upperRight-lowerRight", "closed");
	site = setRoute(site, "centre-upperRight", "hidden");
	site = setEntrance(site, "upperLeft", "open");
	return setEntrance(site, "centre", "hidden");
}

/** Checks that hold for any Site: routes only between marked neighbours, numbers 1 to n. */
function expectSound(site) {
	const marked = markedPoints(site);
	expect(marked.map((key) => site.points[key].number).sort((a, b) => a - b)).toEqual(marked.map((_key, index) => index + 1));
	for (const { key, ends } of SITE_EDGES) {
		if (site.routes[key].kind) expect(ends.every((end) => site.points[end].kind)).toBe(true);
	}
	for (const key of POSITION_KEYS.filter((each) => !site.points[each].kind)) {
		expect(site.points[key]).toMatchObject({ number: null, entrance: null, found: false });
	}
}

describe("SITE_EDGES", () => {
	it("joins each corner to the next around the hexagon and to the centre", () => {
		expect(SITE_EDGES).toHaveLength(12);
		expect(new Set(SITE_EDGES.map(({ key }) => key)).size).toBe(12);
		expect(SITE_EDGES.filter(({ ends }) => ends.includes("centre"))).toHaveLength(6);
		for (const key of POSITION_KEYS.filter((each) => each !== "centre")) {
			expect(SITE_EDGES.filter(({ ends }) => ends.includes(key))).toHaveLength(3);
		}
		for (const { key, ends } of SITE_EDGES) {
			expect(key).toBe(ends.join("-"));
			expect(siteEdge(key).ends).toEqual(ends);
		}
		expect(siteEdge("top-bottom")).toBeNull();
		expect(RULE_LIMITS).toEqual({ points: SITE_POSITIONS.length, routes: SITE_EDGES.length, entrances: SITE_POSITIONS.length });
	});
});

describe("normaliseSite", () => {
	it("gives an empty Site seven unmarked points, no routes and the book's rules", () => {
		for (const data of [undefined, null, "junk", {}, { points: "x", routes: [] }]) {
			const site = normaliseSite(data);
			expect(Object.keys(site.points)).toEqual([...POSITION_KEYS]);
			expect(Object.keys(site.routes)).toEqual(SITE_EDGES.map(({ key }) => key));
			expect(markedPoints(site)).toEqual([]);
			expect(site.rules).toEqual(BOOK_RULES);
			expect(site.notes).toBe("");
			expect(isBlankSite(site)).toBe(true);
		}
		expect(emptySite(burial).rules).toEqual(burial);
	});

	it("numbers the marked points from 1 without gaps, keeping their order", () => {
		const site = normaliseSite({
			points: {
				top: { kind: "feature", number: 7 },
				centre: { kind: "danger", number: 2 },
				bottom: { kind: "treasure", number: 2 },
				lowerLeft: { kind: "feature" },
				upperLeft: { kind: "nonsense", number: 1 }
			}
		});
		expect(Object.fromEntries(numberedPoints(site).map((key) => [key, site.points[key].number]))).toEqual({ centre: 1, bottom: 2, top: 3, lowerLeft: 4 });
		expect(site.points.upperLeft).toMatchObject({ kind: null, number: null });
	});

	it("drops routes to unmarked points, and marks of finding what can't be found", () => {
		const site = normaliseSite({
			points: { top: { kind: "feature", found: true, entranceFound: true }, centre: { kind: "danger", entrance: "hidden", entranceFound: true }, bottom: { found: true, entrance: "open" } },
			routes: {
				"centre-top": { kind: "open", found: true, text: "A stair" },
				"centre-bottom": { kind: "closed" },
				"top-upperRight": { kind: "wide" }
			}
		});
		expect(site.points.top).toMatchObject({ found: true, entrance: null, entranceFound: false });
		expect(site.points.centre).toMatchObject({ entrance: "hidden", entranceFound: true });
		expect(site.points.bottom).toMatchObject({ kind: null, found: false, entrance: null });
		expect(site.routes["centre-top"]).toEqual({ kind: "open", text: "A stair", found: false });
		expect(site.routes["centre-bottom"].kind).toBeNull();
		expect(site.routes["top-upperRight"].kind).toBeNull();
		expectSound(site);
	});

	it("copies rather than shares what it's given", () => {
		const data = blackmoss();
		const copy = normaliseSite(data);
		expect(copy).toEqual(data);
		copy.points.centre.text = "Changed";
		copy.rules.points.feature = 0;
		expect(data.points.centre.text).toBe("");
		expect(data.rules.points.feature).toBe(3);
	});
});

describe("normaliseRules", () => {
	it("reads whole counts within each limit, with a blank as none and nonsense as the fallback", () => {
		expect(normaliseRules({ points: { feature: "4", danger: -2, treasure: 1.8 } }).points).toEqual({ feature: 4, danger: 0, treasure: 1 });
		expect(normaliseRules({ routes: { open: "", closed: "lots" } }, burial).routes).toEqual({ open: 0, closed: 3, hidden: 2 });
		expect(normaliseRules({ routes: { open: 1e9 }, entrances: { hidden: 99 } })).toMatchObject({ routes: { open: 12 }, entrances: { hidden: 7 } });
		expect(normaliseRules(null)).toEqual(BOOK_RULES);
		expect(normaliseRules({ points: { feature: true } }, { points: { feature: "junk" } }).points.feature).toBe(3);
	});
});

describe("drawing", () => {
	it("gives each newly marked point the next number, and keeps it when its kind changes", () => {
		let site = mark(emptySite(), ["bottom", "danger"], ["top", "feature"]);
		expect([site.points.bottom.number, site.points.top.number]).toEqual([1, 2]);
		site = markPoint(site, "bottom", "treasure");
		expect(site.points.bottom).toMatchObject({ kind: "treasure", number: 1 });
		expect(markPoint(site, "centre", "monster")).toEqual(site);
		expect(markPoint(site, "nowhere", "feature")).toEqual(site);
	});

	it("erases a point with its routes, entrance and words, and closes the gap in the numbers", () => {
		const before = applySiteForm(blackmoss(), { points: { centre: { text: "A concealed harbour", entranceText: "Locals know of it" } } });
		const after = markPoint(before, "centre", null);
		expect(after.points.centre).toEqual({ kind: null, number: null, text: "", entrance: null, entranceText: "", found: false, entranceFound: false });
		expect(SITE_EDGES.filter(({ ends }) => ends.includes("centre")).every(({ key }) => after.routes[key].kind === null)).toBe(true);
		expect(routeCounts(after)).toEqual({ open: 1, closed: 1, hidden: 0 });
		expect(numberedPoints(after)).toEqual(["upperLeft", "lowerLeft", "bottom", "lowerRight", "upperRight"]);
		expectSound(after);
		expect(before.points.centre.kind).toBe("feature");
		expect(markPoint(after, "top", null)).toEqual(after);
	});

	it("renumbers a point by swapping with the one that had the number", () => {
		const site = numberPoint(blackmoss(), "upperRight", 1);
		expect(site.points.upperRight.number).toBe(1);
		expect(site.points.upperLeft.number).toBe(6);
		expect(numberPoint(site, "top", 2)).toEqual(site);
		expect(numberPoint(site, "centre", 9)).toEqual(site);
	});

	it("places, changes and takes away entrances only at marked points", () => {
		let site = blackmoss();
		expect(entranceCounts(site)).toEqual({ open: 1, hidden: 1 });
		site = revealEntrance(applySiteForm(site, { points: { centre: { entranceText: "A second landing" } } }), "centre", true);
		site = setEntrance(site, "centre", "open");
		expect(site.points.centre).toMatchObject({ entrance: "open", entranceText: "A second landing", entranceFound: true });
		site = setEntrance(site, "centre", null);
		expect(site.points.centre).toMatchObject({ entrance: null, entranceText: "", entranceFound: false });
		expect(setEntrance(site, "top", "open")).toEqual(site);
		expect(setEntrance(site, "centre", "secret")).toEqual(site);
	});

	it("draws routes only between marked neighbours, and takes one away with its words", () => {
		let site = blackmoss();
		expect(setRoute(site, "top-upperRight", "open")).toEqual(site);
		expect(setRoute(site, "centre-top", "open")).toEqual(site);
		expect(setRoute(site, "centre-bottom", "wide")).toEqual(site);
		site = revealRoute(applySiteForm(site, { routes: { "centre-upperRight": { text: "A hidden cave" } } }), "centre-upperRight", true);
		site = setRoute(site, "centre-upperRight", "closed");
		expect(site.routes["centre-upperRight"]).toEqual({ kind: "closed", text: "A hidden cave", found: false });
		site = setRoute(site, "centre-upperRight", null);
		expect(site.routes["centre-upperRight"]).toEqual({ kind: null, text: "", found: false });
	});

	it("lists a point's routes, nearest number first", () => {
		const site = blackmoss();
		expect(routesFrom(site, "centre").map(({ to, kind }) => [to, kind])).toEqual([[2, "open"], [4, "closed"], [5, "open"], [6, "hidden"]]);
		expect(routesFrom(site, "top")).toEqual([]);
		expect(routeSlots(site)).toHaveLength(9);
	});

	it("clears the drawing but keeps the rules and notes", () => {
		const site = clearSite(setRules(applySiteForm(blackmoss(), { notes: "An island" }), burial));
		expect(markedPoints(site)).toEqual([]);
		expect(site.notes).toBe("An island");
		expect(site.rules).toEqual(burial);
	});
});

describe("applySiteForm", () => {
	it("takes the notes, rules and words the form sent, and leaves the rest", () => {
		const site = applySiteForm(blackmoss(), {
			notes: "A rocky island",
			rules: { points: { treasure: "2" } },
			points: { upperLeft: { text: "Stony beach", entranceText: "A small cove" }, top: { text: 5 } },
			routes: { "centre-bottom": { text: "Overgrown with black moss" }, nowhere: { text: "x" } },
			name: "Blackmoss Isle"
		});
		expect(site.notes).toBe("A rocky island");
		expect(site.rules.points).toEqual({ feature: 3, danger: 2, treasure: 2 });
		expect(site.rules.routes).toEqual(BOOK_RULES.routes);
		expect(site.points.upperLeft).toMatchObject({ text: "Stony beach", entranceText: "A small cove" });
		expect(site.points.top.text).toBe("");
		expect(site.routes["centre-bottom"].text).toBe("Overgrown with black moss");
		expect(site).not.toHaveProperty("name");
		expect(applySiteForm(site, {})).toEqual(site);
	});
});

describe("siteSteps", () => {
	it("follows the book's four steps in order", () => {
		expect(siteSteps(emptySite()).map(({ key }) => key)).toEqual([...SITE_STEPS]);
		for (const step of siteSteps(blackmoss())) expect(STEP_STATES).toContain(step.state);
	});

	it("has everything still to do on an empty Site", () => {
		const [points, routes, reachable, entrances] = siteSteps(emptySite());
		expect(points).toMatchObject({ state: "todo", tallies: [{ kind: "feature", count: 0, target: 3, state: "todo" }, { kind: "danger" }, { kind: "treasure" }] });
		expect(routes.state).toBe("todo");
		expect(reachable).toEqual({ key: "reachable", state: "todo", tallies: [], unreachable: [] });
		expect(entrances.state).toBe("todo");
	});

	it("has every step done for the book's example", () => {
		expect(siteSteps(blackmoss()).map(({ state }) => state)).toEqual(["done", "done", "done", "done"]);
	});

	it("counts the hidden entrance as optional", () => {
		const site = setEntrance(blackmoss(), "centre", null);
		const entrances = siteSteps(site)[3];
		expect(entrances.state).toBe("done");
		expect(entrances.tallies[1]).toEqual({ kind: "hidden", count: 0, target: 1, state: "done", optional: true });
		expect(siteSteps(setEntrance(site, "upperLeft", null))[3].state).toBe("todo");
	});

	it("says when there are more than the rules ask for", () => {
		const site = setRoute(markPoint(blackmoss(), "top", "danger"), "top-upperRight", "open");
		const [points, routes] = siteSteps(site);
		expect(points.state).toBe("over");
		expect(points.tallies.find(({ kind }) => kind === "danger")).toMatchObject({ count: 3, target: 2, state: "over" });
		expect(routes.state).toBe("over");
		expect(siteSteps(setRules(site, { points: { danger: 3 }, routes: { open: 4 } })).slice(0, 2).map(({ state }) => state)).toEqual(["done", "done"]);
	});

	it("names the points the routes don't reach, once the routes are drawn", () => {
		let site = setRoute(setRoute(blackmoss(), "centre-upperRight", null), "upperRight-lowerRight", null);
		expect(siteSteps(site)[1].state).toBe("todo");
		expect(siteSteps(site)[2]).toMatchObject({ state: "todo", unreachable: [6] });
		site = setRoute(setRoute(site, "lowerRight-bottom", "hidden"), "bottom-lowerLeft", "closed");
		expect(siteSteps(site)[1].state).toBe("done");
		expect(siteSteps(site)[2]).toMatchObject({ state: "problem", unreachable: [6] });
		const extra = siteSteps(setRoute(site, "centre-upperLeft", "open"));
		expect(extra[1].state).toBe("over");
		expect(extra[2]).toMatchObject({ state: "problem", unreachable: [6] });
		expect(siteSteps(setRoute(site, "centre-upperRight", "open"))[2]).toMatchObject({ state: "done", unreachable: [] });
	});
});

describe("unreachablePoints", () => {
	it("measures from the entrance, or else from the largest group, lowest number first among equals", () => {
		let site = mark(emptySite(), ["top", "feature"], ["upperRight", "feature"], ["bottom", "danger"], ["lowerLeft", "danger"]);
		expect(unreachablePoints(site)).toEqual([2, 3, 4]);
		site = setRoute(site, "top-upperRight", "open");
		expect(unreachablePoints(site)).toEqual([3, 4]);
		site = setRoute(site, "bottom-lowerLeft", "hidden");
		expect(unreachablePoints(site)).toEqual([3, 4]);
		expect(unreachablePoints(setEntrance(site, "lowerLeft", "open"))).toEqual([1, 2]);
		expect(unreachablePoints(mark(emptySite(), ["centre", "treasure"]))).toEqual([]);
	});
});

describe("rolling", () => {
	it("rolls the book's Site onto an empty one", () => {
		for (const site of rolled) {
			expect(pointCounts(site)).toEqual(BOOK_RULES.points);
			expect(routeCounts(site)).toEqual(BOOK_RULES.routes);
			expect(entranceCounts(site)).toEqual(BOOK_RULES.entrances);
			expect(markedPoints(site)).toHaveLength(6);
			expect(siteSteps(site).map(({ state }) => state)).toEqual(["done", "done", "done", "done"]);
			expectSound(site);
		}
	});

	it("rolls the same Site from the same seed, and others from others", () => {
		expect(rollSite(emptySite(), createRandom("same"))).toEqual(rollSite(emptySite(), createRandom("same")));
		expect(new Set(rolled.map((site) => JSON.stringify(site))).size).toBeGreaterThan(150);
		expect(new Set(rolled.map((site) => POSITION_KEYS.find((key) => !site.points[key].kind)))).toEqual(new Set(POSITION_KEYS));
	});

	it("numbers rolled points in reading order after those already marked", () => {
		for (const site of rolled.slice(0, 20)) {
			const order = numberedPoints(site).map((key) => POSITION_KEYS.indexOf(key));
			expect(order).toEqual([...order].sort((a, b) => a - b));
		}
		const site = rollPoints(mark(emptySite(), ["bottom", "treasure"]), createRandom("after"));
		expect(site.points.bottom.number).toBe(1);
		expect(pointCounts(site)).toEqual(BOOK_RULES.points);
	});

	it("keeps everything already drawn and written", () => {
		for (const seed of seeds.slice(0, 40)) {
			let start = mark(emptySite(), ["centre", "treasure"], ["bottom", "danger"]);
			start = setEntrance(setRoute(start, "centre-bottom", "hidden"), "bottom", "open");
			start = applySiteForm(start, { points: { centre: { text: "The hoard" } }, notes: "A tomb" });
			const site = rollSite(start, createRandom(seed));
			expect(site.points.centre).toMatchObject({ kind: "treasure", number: 1, text: "The hoard" });
			expect(site.points.bottom).toMatchObject({ kind: "danger", number: 2, entrance: "open" });
			expect(site.routes["centre-bottom"].kind).toBe("hidden");
			expect(site.notes).toBe("A tomb");
			expect(pointCounts(site)).toEqual(BOOK_RULES.points);
			expect(routeCounts(site)).toEqual(BOOK_RULES.routes);
			expect(entranceCounts(site)).toEqual(BOOK_RULES.entrances);
			expect(unreachablePoints(site)).toEqual([]);
		}
	});

	it("breaks the rules for a sealed burial complex", () => {
		for (const seed of seeds.slice(0, 50)) {
			const site = rollSite(emptySite(burial), createRandom(seed));
			expect(pointCounts(site)).toEqual(burial.points);
			expect(routeCounts(site)).toEqual(burial.routes);
			expect(entranceCounts(site)).toEqual({ open: 1, hidden: 0 });
			expect(unreachablePoints(site)).toEqual([]);
		}
	});

	it("puts fewer points where routes can still join them", () => {
		for (let count = 1; count <= 7; count++) {
			for (const seed of seeds.slice(0, 30)) {
				const rules = { points: { feature: count, danger: 0, treasure: 0 }, routes: { open: 0, closed: 0, hidden: 0 } };
				const site = rollSite(emptySite(rules), createRandom(seed));
				expect(markedPoints(site)).toHaveLength(count);
				// Too few routes asked for, so open ones join every point.
				expect(routeCounts(site)).toEqual({ open: count - 1, closed: 0, hidden: 0 });
				expect(unreachablePoints(site)).toEqual([]);
				expectSound(site);
			}
		}
	});

	it("draws no more routes than there's room for", () => {
		const rules = { points: { feature: 7, danger: 0, treasure: 0 }, routes: { open: 10, closed: 5, hidden: 5 }, entrances: { open: 7, hidden: 7 } };
		const site = rollSite(emptySite(rules), createRandom("tangled"));
		expect(Object.values(routeCounts(site)).reduce((sum, count) => sum + count, 0)).toBe(12);
		expect(entranceCounts(site).open + entranceCounts(site).hidden).toBe(7);
		expectSound(site);
	});

	it("rolls each step on its own", () => {
		const random = createRandom("steps");
		expect(Object.keys(STEP_ROLLS)).toEqual(["points", "routes", "entrances"]);
		expect(rollRoutes(emptySite(), random)).toEqual(emptySite());
		expect(rollEntrances(emptySite(), random)).toEqual(emptySite());
		const points = rollPoints(emptySite(), random);
		expect(routeCounts(points)).toEqual({ open: 0, closed: 0, hidden: 0 });
		const routes = rollRoutes(points, random);
		expect(entranceCounts(routes)).toEqual({ open: 0, hidden: 0 });
		expect(routeCounts(routes)).toEqual(BOOK_RULES.routes);
		expect(entranceCounts(rollEntrances(routes, random))).toEqual(BOOK_RULES.entrances);
		const done = rollSite(emptySite(), random);
		expect(rollSite(done, random)).toEqual(done);
	});
});

describe("revealing", () => {
	it("shows players nothing until they've found something", () => {
		expect(playerView(blackmoss())).toEqual({ points: [], glimpsed: [], routes: [], entrances: [] });
	});

	it("shows a found point, the open and closed routes from it, and a glimpse of where they lead", () => {
		const view = playerView(revealPoint(blackmoss(), "centre", true));
		expect(view.points).toEqual([{ key: "centre", kind: "feature", number: 3 }]);
		expect(view.routes).toEqual([
			{ key: "centre-lowerRight", kind: "open" },
			{ key: "centre-bottom", kind: "closed" },
			{ key: "centre-lowerLeft", kind: "open" }
		]);
		expect(view.glimpsed).toEqual(["lowerLeft", "lowerRight", "bottom"]);
		expect(view.entrances).toEqual([]);
	});

	it("shows a hidden route or entrance only once it's found", () => {
		let site = revealPoint(blackmoss(), "upperLeft", true);
		expect(playerView(site).entrances).toEqual([{ key: "upperLeft", kind: "open" }]);
		site = revealEntrance(site, "centre", true);
		expect(playerView(site).entrances).toEqual([{ key: "upperLeft", kind: "open" }, { key: "centre", kind: "hidden" }]);
		expect(playerView(site).glimpsed).toEqual(["centre", "lowerLeft"]);
		site = revealRoute(site, "centre-upperRight", true);
		expect(playerView(site).routes.map(({ key }) => key)).toEqual(["lowerLeft-upperLeft", "centre-upperRight"]);
		expect(playerView(revealRoute(site, "centre-bottom", true))).toEqual(playerView(site));
		expect(revealPoint(site, "top", true)).toEqual(site);
		expect(revealEntrance(site, "bottom", true)).toEqual(site);
	});

	it("reveals or hides everything at once", () => {
		const shown = revealEverything(blackmoss(), true);
		const view = playerView(shown);
		expect(view.points).toHaveLength(6);
		expect(view.routes).toHaveLength(6);
		expect(view.entrances).toHaveLength(2);
		expect(view.glimpsed).toEqual([]);
		expect(revealEverything(shown, false)).toEqual(blackmoss());
	});
});

describe("isBlankSite", () => {
	it("counts anything drawn or written, but not the rules", () => {
		expect(isBlankSite(setRules(emptySite(), burial))).toBe(true);
		expect(isBlankSite(applySiteForm(emptySite(), { notes: "  " }))).toBe(true);
		expect(isBlankSite(applySiteForm(emptySite(), { notes: "A tomb" }))).toBe(false);
		expect(isBlankSite(mark(emptySite(), ["top", "feature"]))).toBe(false);
		expect(isBlankSite(normaliseSite({ points: { top: { text: "Left over" } } }))).toBe(false);
		expect(isBlankSite(blackmoss())).toBe(false);
	});
});

describe("siteChanges", () => {
	it("lists only the values that changed, by their path in the Site", () => {
		const before = blackmoss();
		expect(siteChanges(before, before)).toEqual({});
		expect(siteChanges(before, markPoint(before, "bottom", "treasure"))).toEqual({ "points.bottom.kind": "treasure" });
		expect(siteChanges(before, setRules(before, burial))).toEqual({
			"rules.points.feature": 1, "rules.points.treasure": 3,
			"rules.routes.open": 1, "rules.routes.closed": 3, "rules.routes.hidden": 2,
			"rules.entrances.hidden": 0
		});
		const erased = siteChanges(before, markPoint(before, "lowerLeft", null));
		expect(erased).toMatchObject({ "points.lowerLeft.kind": null, "points.lowerLeft.number": null, "points.centre.number": 2, "routes.centre-lowerLeft.kind": null });
		expect(erased).not.toHaveProperty("points.upperLeft.number");
		expect(siteChanges(emptySite(), before)).toHaveProperty(["routes.centre-upperRight.kind"], "hidden");
	});
});

describe("STEP_CAN_ROLL", () => {
	it("says whether a step's roll would draw anything, without rolling it", () => {
		// The sheet greys out a roll with nothing left to do, so it has to agree with the roll itself.
		for (const seed of seeds) {
			const site = setRules(rollPoints(emptySite(), createRandom(seed)), burial);
			for (const [key, roll] of Object.entries(STEP_ROLLS)) {
				const drew = Object.keys(siteChanges(site, roll(site, createRandom(seed)))).length > 0;
				expect(STEP_CAN_ROLL[key](site)).toBe(drew);
			}
		}
	});

	it("has nothing left once the Site is rolled in full", () => {
		for (const site of rolled) {
			for (const key of Object.keys(STEP_ROLLS)) expect(STEP_CAN_ROLL[key](site)).toBe(false);
		}
	});

	it("has something to do on an empty Site the rules ask for", () => {
		const wanted = setRules(emptySite(), burial);
		expect(STEP_CAN_ROLL.points(wanted)).toBe(true);
		// Routes and entrances need points on the map first.
		expect(STEP_CAN_ROLL.routes(wanted)).toBe(false);
		expect(STEP_CAN_ROLL.entrances(wanted)).toBe(false);
	});
});

describe("entrance and route kinds", () => {
	it("are the book's", () => {
		expect(POINT_KINDS).toEqual(["feature", "danger", "treasure"]);
		expect(ROUTE_KINDS).toEqual(["open", "closed", "hidden"]);
		expect(ENTRANCE_KINDS).toEqual(["open", "hidden"]);
	});
});
