import { describe, expect, it } from "vitest";
import { createRandom } from "../../module/rules/random.js";
import { edgeMiddle, kindGlyph, mapPercent, siteMap, sitePoint } from "../../module/rules/site-diagram.js";
import {
	ENTRANCE_KINDS,
	POINT_KINDS,
	ROUTE_KINDS,
	emptySite,
	markPoint,
	revealEntrance,
	revealPoint,
	revealRoute,
	rollSite,
	routeSlots,
	setEntrance,
	setRoute
} from "../../module/rules/sites.js";

const labels = {
	point: ({ number, kind }) => `Point ${number}, ${kind}`,
	erased: () => "Erased point",
	route: ({ from, to, kind }) => (kind ? `${kind} route between ${from} and ${to}` : `No route between ${from} and ${to}`),
	entrance: ({ number, kind }) => `${kind} entrance at ${number}`,
	glimpsed: () => "Somewhere unexplored"
};

/** @returns {number} How many times the pattern appears in the text. */
const occurrences = (text, pattern) => text.match(new RegExp(pattern, "g"))?.length ?? 0;

/** The book's example, Blackmoss Isle (p15). */
function blackmoss() {
	let site = [["upperLeft", "feature"], ["lowerLeft", "danger"], ["centre", "feature"], ["bottom", "feature"], ["lowerRight", "danger"], ["upperRight", "treasure"]]
		.reduce((next, [key, kind]) => markPoint(next, key, kind), emptySite());
	for (const [key, kind] of [["lowerLeft-upperLeft", "open"], ["centre-lowerLeft", "open"], ["centre-lowerRight", "open"], ["centre-bottom", "closed"], ["upperRight-lowerRight", "closed"], ["centre-upperRight", "hidden"]]) {
		site = setRoute(site, key, kind);
	}
	return setEntrance(setEntrance(site, "upperLeft", "open"), "centre", "hidden");
}

const draw = (site, options = {}) => siteMap(site, { title: "Map of Blackmoss Isle", labels, mode: "draw", idPrefix: "sheet", ...options });

describe("siteMap while drawing", () => {
	const svg = draw(blackmoss());

	it("draws each point as its shape, with its number", () => {
		for (const kind of POINT_KINDS) {
			const count = { feature: 3, danger: 2, treasure: 1 }[kind];
			expect(occurrences(svg, `class="bastionland-site-map__point" data-point="\\w+" data-kind="${kind}"`)).toBe(count);
		}
		expect(occurrences(svg, "data-kind=\"feature\" data-action=\"point\"[^>]*><circle class=\"bastionland-site-map__shape\"")).toBe(3);
		expect(occurrences(svg, "data-kind=\"danger\" data-action=\"point\"[^>]*><polygon ")).toBe(2);
		for (const number of [1, 2, 3, 4, 5, 6]) expect(svg).toContain(`>${number}</text>`);
		expect(svg).toContain("aria-label=\"Point 6, treasure\"");
	});

	it("draws routes as solid, crossed and dotted lines", () => {
		for (const kind of ROUTE_KINDS) {
			expect(occurrences(svg, `class="bastionland-site-map__route" data-route="[\\w-]+" data-kind="${kind}"`)).toBe({ open: 3, closed: 2, hidden: 1 }[kind]);
		}
		expect(occurrences(svg, "class=\"bastionland-site-map__line\"")).toBe(6 + 2);
		expect(occurrences(svg, "stroke-dasharray=\"0\\.1 8\"")).toBe(1);
		expect(svg).toContain("aria-label=\"closed route between 3 and 4\"");
	});

	it("offers every gap between marked neighbours for a new route, and the erased point for marking", () => {
		expect(occurrences(svg, "class=\"bastionland-site-map__slot\"")).toBe(routeSlots(blackmoss()).length - 6);
		expect(svg).toContain("aria-label=\"No route between 1 and 3\"");
		expect(occurrences(svg, "class=\"bastionland-site-map__erased\" data-point=\"top\" data-action=\"point\"")).toBe(1);
	});

	it("draws a hollow arrow into each entrance, dashed for the hidden one", () => {
		expect(occurrences(svg, "class=\"bastionland-site-map__entrance\"")).toBe(2);
		expect(occurrences(svg, "data-point=\"centre\" data-kind=\"hidden\" data-action=\"point\"[^>]*><polygon [^>]*stroke-dasharray=\"4 3\"")).toBe(1);
	});

	it("gives each clickable part an id and a place in the tab order", () => {
		expect(svg).toContain("id=\"sheet-point-centre\"");
		expect(svg).toContain("id=\"sheet-route-centre-bottom\"");
		expect(svg).toContain("id=\"sheet-point-top\"");
		expect(occurrences(svg, "role=\"button\" tabindex=\"0\"")).toBe(6 + 6 + (routeSlots(blackmoss()).length - 6) + 1 + 2);
		expect(svg).not.toContain("aria-pressed");
		expect(svg).not.toContain("is-secret");
	});

	it("marks what's selected", () => {
		const point = draw(blackmoss(), { selected: { type: "point", key: "centre" } });
		expect(point).toContain("class=\"bastionland-site-map__point is-selected\" data-point=\"centre\"");
		expect(occurrences(point, "bastionland-site-map__halo")).toBe(1);
		const route = draw(blackmoss(), { selected: { type: "route", key: "centre-upperLeft" } });
		expect(route).toContain("class=\"bastionland-site-map__slot is-selected\" data-route=\"centre-upperLeft\"");
		expect(route).not.toContain("bastionland-site-map__halo");
	});

	it("names the map for screen readers, safely", () => {
		const named = draw(emptySite(), { title: "Map of <Blackmoss> & \"Isle\"" });
		expect(named).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" class="bastionland-site-map bastionland-site-map--draw" viewBox="-200 -200 400 400" role="group"/);
		expect(named).toContain("<title>Map of &lt;Blackmoss&gt; &amp; &quot;Isle&quot;</title>");
		expect(occurrences(named, "class=\"bastionland-site-map__erased\"")).toBe(7);
		expect(named).not.toContain("data-kind");
		expect(named.endsWith("</svg>")).toBe(true);
	});
});

describe("siteMap while revealing", () => {
	const site = revealRoute(revealEntrance(revealPoint(blackmoss(), "upperLeft", true), "upperLeft", true), "centre-upperRight", true);
	const svg = siteMap(site, { title: "Map", labels, mode: "reveal" });

	it("dims what players can't see yet", () => {
		expect(occurrences(svg, "class=\"bastionland-site-map__point is-secret\"")).toBe(5);
		expect(svg).toContain("class=\"bastionland-site-map__point\" data-point=\"upperLeft\" data-kind=\"feature\" data-action=\"point\" role=\"button\" tabindex=\"0\" aria-label=\"Point 1, feature\" aria-pressed=\"true\"");
		expect(svg).toContain("class=\"bastionland-site-map__route\" data-route=\"lowerLeft-upperLeft\"");
		expect(svg).toContain("class=\"bastionland-site-map__route is-secret\" data-route=\"centre-bottom\"");
		expect(svg).toContain("class=\"bastionland-site-map__entrance is-secret\" data-point=\"centre\"");
	});

	it("lets the Referee reveal points, entrances and hidden routes, but not routes seen from either end", () => {
		expect(occurrences(svg, "data-action=\"point\"")).toBe(6);
		expect(occurrences(svg, "data-action=\"entrance\"")).toBe(2);
		expect(occurrences(svg, "data-action=\"route\"")).toBe(1);
		expect(svg).toContain("data-route=\"centre-upperRight\" data-kind=\"hidden\" data-action=\"route\" role=\"button\" tabindex=\"0\" aria-label=\"hidden route between 3 and 6\" aria-pressed=\"true\"");
		expect(svg).not.toContain("bastionland-site-map__slot\" ");
		expect(svg).toContain("class=\"bastionland-site-map__erased\" data-point=\"top\">");
	});
});

describe("siteMap for players", () => {
	it("shows only what they've found, with nothing to click", () => {
		const site = revealEntrance(revealPoint(blackmoss(), "centre", true), "centre", true);
		const svg = siteMap(site, { title: "Map", labels, players: true, mode: "draw" });
		expect(svg).toContain("bastionland-site-map--players");
		expect(svg).toContain("role=\"img\"");
		expect(svg).not.toContain("data-action");
		expect(svg).not.toContain("tabindex");
		expect(occurrences(svg, "class=\"bastionland-site-map__point\"")).toBe(1);
		expect(occurrences(svg, "class=\"bastionland-site-map__route\"")).toBe(3);
		expect(occurrences(svg, "class=\"bastionland-site-map__glimpse\"")).toBe(3);
		expect(occurrences(svg, ">\\?</text>")).toBe(3);
		expect(occurrences(svg, "class=\"bastionland-site-map__entrance\"")).toBe(1);
		expect(svg).not.toContain("bastionland-site-map__erased");
		expect(svg).not.toContain("data-kind=\"treasure\"");
		expect(svg).not.toContain("is-secret");
	});

	it("shows an empty map before anything is found", () => {
		const svg = siteMap(blackmoss(), { title: "Map", labels, players: true });
		expect(svg).not.toContain("data-point");
		expect(svg).not.toContain("data-route");
	});
});

describe("siteMap that can't be clicked", () => {
	it("draws the whole Site with no actions", () => {
		const svg = siteMap(rollSite(emptySite(), createRandom("still")), { title: "Map", labels });
		expect(svg).toContain("bastionland-site-map--still");
		expect(svg).not.toContain("data-action");
		expect(occurrences(svg, "class=\"bastionland-site-map__point\"")).toBe(6);
	});
});

describe("map geometry", () => {
	it("puts the corners on a hexagon of radius 120 around the centre", () => {
		expect(sitePoint("centre")).toEqual({ x: 0, y: 0 });
		expect(sitePoint("top")).toEqual({ x: 0, y: -120 });
		expect(Math.hypot(sitePoint("lowerRight").x, sitePoint("lowerRight").y)).toBeCloseTo(120);
		expect(edgeMiddle("centre-bottom")).toEqual({ x: 0, y: 60 });
		expect(mapPercent({ x: 0, y: 0 })).toEqual({ x: 50, y: 50 });
		expect(mapPercent(sitePoint("top"))).toEqual({ x: 50, y: 20 });
	});
});

describe("kindGlyph", () => {
	it("draws a small picture of every kind, hidden from screen readers", () => {
		for (const [group, kinds] of [["points", POINT_KINDS], ["routes", ROUTE_KINDS], ["entrances", ENTRANCE_KINDS]]) {
			for (const kind of kinds) {
				const glyph = kindGlyph(group, kind);
				expect(glyph).toMatch(/^<svg class="bastionland-site-glyph bastionland-site-glyph--\w+" viewBox="-12 -12 24 24" aria-hidden="true" focusable="false"><(circle|polygon|line) /);
			}
		}
		expect(kindGlyph("routes", "wide")).toContain("focusable=\"false\"></svg>");
	});
});
