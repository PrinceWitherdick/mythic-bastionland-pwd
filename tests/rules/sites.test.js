import { describe, expect, it } from "vitest";
import { SITE_DIAGRAM_SIZE, siteDiagram, svgDataURI } from "../../module/rules/site-diagram.js";
import {
	DEFAULT_SITE,
	POINT_KINDS,
	ROUTE_KINDS,
	SITE_EDGES,
	SITE_MAX_COUNT,
	SITE_POSITIONS,
	SITE_PRESETS,
	SITE_PROBLEMS,
	generateSite,
	isSiteConnected,
	normaliseDistribution,
	normaliseSiteOptions,
	pointRoutes
} from "../../module/rules/sites.js";

const seeds = Array.from({ length: 200 }, (_, index) => `site-${index}`);
const sites = seeds.map((seed) => generateSite({ seed }));
const burial = SITE_PRESETS.find(({ key }) => key === "burial");

/** @returns {Record<string, number>} How many of the items are each kind. */
const tally = (items, kinds) => Object.fromEntries(kinds.map((kind) => [kind, items.filter((item) => item.kind === kind).length]));

const neighbours = new Set(SITE_EDGES.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
const positionOf = (site, number) => site.points.find((point) => point.number === number)?.position;
const readingIndex = (key) => SITE_POSITIONS.findIndex((position) => position.key === key);

/** @returns {number} How many times the pattern appears in the text. */
const occurrences = (text, pattern) => text.match(pattern)?.length ?? 0;

/** Checks that hold for any Site, whatever it was asked for. */
function expectSound(site) {
	expect(isSiteConnected(site)).toBe(true);
	const pairs = site.routes.map(({ from, to }) => `${from}-${to}`);
	expect(new Set(pairs).size).toBe(pairs.length);
	for (const { from, to, kind } of site.routes) {
		expect(from).toBeLessThan(to);
		expect(ROUTE_KINDS).toContain(kind);
		expect(neighbours.has(`${positionOf(site, from)}|${positionOf(site, to)}`)).toBe(true);
	}
	expect(site.points.map(({ number }) => number)).toEqual(site.points.map((_point, index) => index + 1));
	expect(new Set([...site.points.map(({ position }) => position), ...site.erased]).size).toBe(SITE_POSITIONS.length);
}

describe("SITE_EDGES", () => {
	it("joins each corner to the next around the hexagon and to the centre", () => {
		expect(SITE_EDGES).toHaveLength(12);
		expect(SITE_EDGES.filter((edge) => edge.includes("centre"))).toHaveLength(6);
		for (const { key } of SITE_POSITIONS.filter(({ key }) => key !== "centre")) {
			expect(SITE_EDGES.filter((edge) => edge.includes(key))).toHaveLength(3);
		}
	});
});

describe("generateSite", () => {
	it("draws the book's Site by default: 3 features, 2 dangers, 1 treasure, and 3 open, 2 closed, 1 hidden route", () => {
		for (const site of sites) {
			expect(site.points).toHaveLength(6);
			expect(tally(site.points, POINT_KINDS)).toEqual(DEFAULT_SITE.points);
			expect(site.routes).toHaveLength(6);
			expect(tally(site.routes, ROUTE_KINDS)).toEqual(DEFAULT_SITE.routes);
			expect(site.erased).toHaveLength(1);
			expect(site.problems).toEqual([]);
		}
	});

	it.each(seeds.slice(0, 40).map((seed, index) => [seed, sites[index]]))("reaches every point only by neighbouring routes from %s", (_seed, site) => {
		expectSound(site);
	});

	it("rolls the same Site from the same seed, and another from another", () => {
		expect(generateSite({ seed: "same" })).toEqual(generateSite({ seed: "same" }));
		expect(generateSite({ seed: "same" })).not.toEqual(generateSite({ seed: "other" }));
		expect(sites[0].seed).toBe("site-0");
		expect(new Set(sites.map((site) => JSON.stringify(site.routes))).size).toBeGreaterThan(20);
	});

	it("numbers the points in reading order, top to bottom and then left to right", () => {
		for (const site of sites) {
			const order = site.points.map(({ position }) => readingIndex(position));
			expect(order).toEqual([...order].sort((a, b) => a - b));
		}
		const full = generateSite({ seed: "full", points: { feature: 3, danger: 3, treasure: 1 } });
		expect(full.points.map(({ position }) => position)).toEqual(SITE_POSITIONS.map(({ key }) => key));
	});

	it("may erase any of the seven points, the centre included", () => {
		expect(new Set(sites.flatMap((site) => site.erased))).toEqual(new Set(SITE_POSITIONS.map(({ key }) => key)));
	});

	it("places an entrance and a hidden entrance at different points", () => {
		for (const site of sites) {
			expect(site.entrances).toHaveLength(2);
			const [open, hidden] = site.entrances;
			expect(open.hidden).toBe(false);
			expect(hidden.hidden).toBe(true);
			expect(open.point).not.toBe(hidden.point);
			expect(site.entrances.every(({ point }) => point >= 1 && point <= site.points.length)).toBe(true);
		}
		const closed = generateSite({ seed: "sealed", entrance: false, hiddenEntrance: false });
		expect(closed.entrances).toEqual([]);
		const secret = generateSite({ seed: "secret", entrance: false, hiddenEntrance: true });
		expect(secret.entrances).toEqual([{ point: expect.any(Number), hidden: true }]);
	});

	it("breaks the rules for a sealed burial complex", () => {
		for (const seed of seeds.slice(0, 50)) {
			const site = generateSite({ ...burial, seed });
			expect(tally(site.points, POINT_KINDS)).toEqual({ feature: 1, danger: 2, treasure: 3 });
			expect(tally(site.routes, ROUTE_KINDS)).toEqual({ open: 1, closed: 3, hidden: 2 });
			expect(site.entrances).toEqual([{ point: expect.any(Number), hidden: false }]);
			expect(site.problems).toEqual([]);
			expectSound(site);
		}
	});

	it("keeps every point reachable whatever the distribution", () => {
		for (let count = 1; count <= SITE_POSITIONS.length; count++) {
			for (let asked = 0; asked <= 14; asked++) {
				for (const seed of seeds.slice(0, 8)) {
					const site = generateSite({ seed, points: { feature: count, danger: 0, treasure: 0 }, routes: { open: 0, closed: asked, hidden: 0 } });
					expect(site.points).toHaveLength(count);
					expectSound(site);
					const available = SITE_EDGES.filter(([a, b]) => [a, b].every((key) => site.points.some(({ position }) => position === key))).length;
					expect(site.routes).toHaveLength(Math.min(available, Math.max(asked, count - 1)));
				}
			}
		}
	});

	describe("problems", () => {
		it("only reports reasons it knows", () => {
			const odd = [
				{ points: { feature: 0, danger: 0, treasure: 0 } },
				{ points: { feature: 9, danger: 0, treasure: 0 } },
				{ routes: { open: 0, closed: 0, hidden: 0 } },
				{ points: { feature: 1, danger: 0, treasure: 0 }, hiddenEntrance: true }
			];
			for (const options of odd) {
				for (const { reason } of generateSite({ seed: "odd", ...options }).problems) expect(SITE_PROBLEMS).toContain(reason);
			}
		});

		it("draws nothing when no points are asked for", () => {
			const site = generateSite({ seed: "empty", points: { feature: 0, danger: 0, treasure: 0 } });
			expect(site.points).toEqual([]);
			expect(site.routes).toEqual([]);
			expect(site.entrances).toEqual([]);
			expect(site.erased).toHaveLength(7);
			expect(site.problems.map(({ reason }) => reason)).toEqual(["noPoints", "tooManyRoutes"]);
		});

		it("cuts more than seven points down to seven", () => {
			const site = generateSite({ seed: "crowded", points: { feature: 5, danger: 3, treasure: 2 } });
			expect(site.points).toHaveLength(7);
			expect(site.erased).toEqual([]);
			expect(site.problems).toContainEqual({ reason: "tooManyPoints", asked: 10, used: 7 });
			expectSound(site);
		});

		it("adds open routes when too few are asked for to reach every point", () => {
			const site = generateSite({ seed: "sparse", routes: { open: 0, closed: 1, hidden: 1 } });
			expect(site.routes).toHaveLength(5);
			expect(tally(site.routes, ROUTE_KINDS)).toEqual({ open: 3, closed: 1, hidden: 1 });
			expect(site.problems).toEqual([{ reason: "tooFewRoutes", asked: 2, used: 5 }]);
			expectSound(site);
		});

		it("cuts routes down to the neighbouring pairs there are", () => {
			const site = generateSite({ seed: "tangled", points: { feature: 7, danger: 0, treasure: 0 }, routes: { open: 10, closed: 5, hidden: 5 } });
			expect(site.routes).toHaveLength(12);
			expect(site.problems).toEqual([{ reason: "tooManyRoutes", asked: 20, used: 12 }]);
			expectSound(site);
		});

		it("can't put a hidden entrance elsewhere when there's only one point", () => {
			const site = generateSite({ seed: "lonely", points: { feature: 0, danger: 0, treasure: 1 }, routes: { open: 0, closed: 0, hidden: 0 } });
			expect(site.points).toEqual([{ number: 1, position: expect.any(String), kind: "treasure" }]);
			expect(site.entrances).toEqual([{ point: 1, hidden: false }]);
			expect(site.problems).toEqual([{ reason: "hiddenEntrance", asked: 1, used: 0 }]);
		});
	});
});

describe("normaliseDistribution", () => {
	it("reads whole, non-negative counts from a form", () => {
		expect(normaliseDistribution({ feature: "4", danger: -2, treasure: 1.8 }, POINT_KINDS)).toEqual({ feature: 4, danger: 0, treasure: 1 });
		expect(normaliseDistribution({ open: "", closed: "lots" }, ROUTE_KINDS, DEFAULT_SITE.routes)).toEqual({ open: 0, closed: 2, hidden: 1 });
		expect(normaliseDistribution({ open: 1e9 }, ROUTE_KINDS)).toEqual({ open: SITE_MAX_COUNT, closed: 0, hidden: 0 });
		expect(normaliseDistribution(undefined, POINT_KINDS)).toEqual({ feature: 0, danger: 0, treasure: 0 });
	});
});

describe("normaliseSiteOptions", () => {
	it("fills anything missing from the fallback", () => {
		expect(normaliseSiteOptions({ seed: " abc " })).toEqual({ seed: "abc", ...DEFAULT_SITE });
		const last = normaliseSiteOptions({ ...burial, seed: "kept" });
		expect(normaliseSiteOptions({ seed: "", entrance: false, points: { feature: "2" } }, last)).toEqual({
			seed: "kept",
			points: { feature: 2, danger: 2, treasure: 3 },
			routes: burial.routes,
			entrance: false,
			hiddenEntrance: false
		});
		expect(normaliseSiteOptions(null)).toEqual({ seed: "", ...DEFAULT_SITE });
	});
});

describe("pointRoutes", () => {
	it("lists the routes from a point, nearest number first", () => {
		const site = { routes: [{ from: 1, to: 2, kind: "open" }, { from: 2, to: 3, kind: "closed" }, { from: 3, to: 4, kind: "hidden" }] };
		expect(pointRoutes(site, 2)).toEqual([{ to: 1, kind: "open" }, { to: 3, kind: "closed" }]);
		expect(pointRoutes(site, 5)).toEqual([]);
	});
});

describe("siteDiagram", () => {
	it("draws a shape for each point, a line for each route and an arrow for each entrance", () => {
		for (const site of sites.slice(0, 20)) {
			const svg = siteDiagram(site, "A site");
			for (const kind of POINT_KINDS) {
				expect(occurrences(svg, new RegExp(`data-point="${kind}"`, "g"))).toBe(DEFAULT_SITE.points[kind]);
			}
			expect(occurrences(svg, /data-point="feature"><circle /g)).toBe(3);
			expect(occurrences(svg, /data-point="danger"><polygon /g)).toBe(2);
			expect(occurrences(svg, /data-point="treasure"><polygon /g)).toBe(1);
			for (const kind of ROUTE_KINDS) {
				expect(occurrences(svg, new RegExp(`data-route="${kind}"`, "g"))).toBe(DEFAULT_SITE.routes[kind]);
			}
			expect(occurrences(svg, /<line /g)).toBe(6 + 2);
			expect(occurrences(svg, /stroke-dasharray="0\.1 7"/g)).toBe(1);
			expect(occurrences(svg, /data-entrance="open"/g)).toBe(1);
			expect(occurrences(svg, /data-entrance="hidden" points="[^"]+" stroke-dasharray/g)).toBe(1);
			expect(occurrences(svg, /data-erased=/g)).toBe(1);
			for (const { number } of site.points) expect(svg).toContain(`>${number}</text>`);
		}
	});

	it("names itself for screen readers and needs no outside styles", () => {
		const svg = siteDiagram(sites[0], "Map of <Blackmoss> & \"Isle\"");
		expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="-160 -160 320 320"/);
		expect(svg).toContain(`width="${SITE_DIAGRAM_SIZE}"`);
		expect(svg).toContain("role=\"img\"");
		expect(svg).toContain("<title>Map of &lt;Blackmoss&gt; &amp; &quot;Isle&quot;</title>");
		expect(svg).not.toContain("class=");
		expect(svg.endsWith("</svg>")).toBe(true);
	});

	it("draws an empty Site as seven faint circles", () => {
		const svg = siteDiagram(generateSite({ seed: "empty", points: { feature: 0, danger: 0, treasure: 0 } }), "Nothing");
		expect(occurrences(svg, /data-erased=/g)).toBe(7);
		expect(svg).not.toContain("data-point");
	});
});

describe("svgDataURI", () => {
	it("wraps the drawing for an image without quotes or brackets that could break an attribute", () => {
		const svg = siteDiagram(sites[0], "It’s a site");
		const uri = svgDataURI(svg);
		expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
		expect(uri).not.toMatch(/[\s"<>&]/);
		expect(decodeURIComponent(uri.slice("data:image/svg+xml,".length))).toBe(svg);
	});
});
