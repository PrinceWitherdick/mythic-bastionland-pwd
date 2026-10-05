import { describe, expect, it } from "vitest";
import { emptyJourney, recordVisits } from "../../module/rules/journey.js";
import { emptyRealm, TERRAIN } from "../../module/rules/realm.js";
import { edgeKey, hexIndex, hexKey, parseHexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { REALM_PALETTES } from "../../module/rules/realm-skins.js";
import { emptyShared, recordTold } from "../../module/rules/hex-shared.js";
import {
	CHART_MAX_ZOOM, LEGEND_KINDS, chartBoxHolding, chartBoxText, chartScrollBy, chartZoomed, clampChartBox, haloPoints, legendGlyph,
	panChartBox, parseChartBox, routeOf, routeStretches, travelsChart, wheelZoomFactor, zoomChartBox
} from "../../module/rules/travels-chart.js";
import { holdingsKnown, travelsList } from "../../module/rules/travels.js";

const g = realmGeometry({ cols: 12, rows: 12 });
const hex = (col, row) => ({ col, row });
const palette = REALM_PALETTES[0];

// Invented names, so no book text lives in the repository.
const [town, ruin, wild, castle] = [hex(2, 2), hex(3, 3), hex(5, 5), hex(7, 7)];

function sources() {
	const realm = emptyRealm(g);
	realm.terrain[hexIndex(g, wild)] = TERRAIN.indexOf("forest") + 1;
	realm.holdings = [
		{ id: "h0", hex: town, style: "town", seat: true, name: "Ashford" },
		{ id: "h1", hex: castle, style: "castle", seat: false, name: "Hidden Hall" }
	];
	realm.landmarks = [{ id: "l0", hex: ruin, type: "ruin", name: "Secret Ruin", seer: null, revealed: false }];
	realm.myths = [{ id: "m0", hex: ruin, number: 3, d6: 1, d12: 1, omen: 0, revealed: false }];
	realm.barriers = [{ id: "b0", edge: edgeKey(wild, hex(5, 6)), revealed: true }];
	const journey = recordVisits(emptyJourney(), [town, ruin, wild, castle]);
	const shared = recordTold(emptyShared(), hex(9, 9), { id: "t1", note: "A ford.", at: 1 });
	const handHidden = (at) => ({ holding: hexKey(at) === hexKey(castle) });
	return { realm, g, journey, shared, marks: [], handHidden, companyHex: wild };
}

const views = (s = sources()) => {
	const list = travelsList(s);
	return [...list.visited, ...list.heardOf];
};

const chart = (options = {}) => travelsChart(views(), g, { palette, title: "Chart", label: (view) => view.key, ...options });
const count = (text, pattern) => text.split(pattern).length - 1;

describe("travelsChart", () => {
	it("rules every hex once: the known ones drawn in, the rest faint", () => {
		const svg = chart();
		const known = views().length;
		expect(count(svg, "class=\"bastionland-travels-chart__hex\"")).toBe(known);
		expect(count(svg, "<polygon points=")).toBe(g.cols * g.rows - known);
	});

	it("makes a button only of the hexes the players may open", () => {
		const svg = chart();
		const keys = [...svg.matchAll(/data-hex="([^"]+)" data-action="pickTravelsHex"/g)].map((match) => match[1]);
		expect(keys.sort()).toEqual(views().map((view) => view.key).sort());
		for (const key of keys) expect(parseHexKey(key)).not.toBeNull();
	});

	it("marks only what the players have found", () => {
		const svg = chart();
		// The town's Holding shows, the hidden castle's doesn't; the Myth and Landmark aren't found.
		expect(count(svg, "glyph--holding")).toBe(1);
		expect(count(svg, "glyph--myth")).toBe(0);
		expect(count(svg, "glyph--landmark")).toBe(0);
		expect(count(svg, "glyph--company")).toBe(1);
		expect(svg).not.toContain("Hidden Hall");
		expect(svg).not.toContain("Secret Ruin");
	});

	it("dashes round a hex only heard of, and dots one told of", () => {
		const svg = chart();
		expect(svg).toContain("is-heard");
		expect(count(svg, "bastionland-travels-chart__told")).toBe(1);
	});

	it("draws a revealed Barrier along the edge it closes", () => {
		expect(count(chart(), "bastionland-travels-chart__barrier")).toBe(1);
	});

	it("rings the hex chosen", () => {
		const svg = chart({ selected: hexKey(wild) });
		expect(count(svg, "bastionland-travels-chart__halo")).toBe(1);
		expect(svg).toContain(`data-hex="${hexKey(wild)}" data-action="pickTravelsHex" role="button" tabindex="0" aria-label="5,5" aria-current="true"`);
	});

	it("escapes the words it's given", () => {
		const svg = chart({ title: "<b>", label: () => "\"<i>\"" });
		expect(svg).not.toContain("<b>");
		expect(svg).not.toContain("<i>");
		expect(svg).toContain("&lt;b&gt;");
	});

	it("draws the way the Company went only when asked", () => {
		expect(chart()).not.toContain("<polyline");
		expect(chart({ route: [hex(1, 1), hex(1, 2), hex(1, 3)] })).toContain("<polyline");
	});
});

describe("Holdings known from the start", () => {
	// The Company has been nowhere yet.
	const fresh = () => ({ ...sources(), journey: emptyJourney(), shared: emptyShared() });

	it("lists the Holdings the players can see, but not one the GM hid", () => {
		expect(holdingsKnown(fresh()).map((view) => view.key)).toEqual([hexKey(town)]);
	});

	it("leaves out a hex already on the chart", () => {
		expect(holdingsKnown(fresh(), new Set([hexKey(town)]))).toEqual([]);
	});

	it("draws the mark of a Holding never reached, named on hover but no button", () => {
		const s = fresh();
		const svg = travelsChart([], g, { palette, title: "Chart", label: () => "Ashford", holdings: holdingsKnown(s) });
		expect(count(svg, "glyph--holding")).toBe(1);
		expect(svg).toContain(`class="bastionland-travels-chart__afar" data-hex="${hexKey(town)}" data-tags="holding"`);
		expect(svg).toContain("<title>Ashford</title>");
		expect(svg).not.toContain("data-action=\"pickTravelsHex\"");
		// A seat in the accent colour.
		expect(svg).toContain(`fill="${palette.accent}"`);
	});

	it("draws a Holding once when its hex is on the chart already", () => {
		const s = sources();
		const svg = travelsChart(views(s), g, { palette, title: "Chart", label: (view) => view.key, holdings: holdingsKnown(s) });
		expect(count(svg, "glyph--holding")).toBe(1);
		expect(svg).not.toContain("bastionland-travels-chart__afar");
	});
});

describe("routeOf and routeStretches", () => {
	it("follows the arrivals in the order they were, once for each time", () => {
		const journey = recordVisits(recordVisits(emptyJourney(), [hex(1, 1), hex(1, 2)]), [hex(1, 1)]);
		expect(routeOf(journey).map(hexKey)).toEqual(["1,1", "1,2", "1,1"]);
		expect(routeOf(null)).toEqual([]);
	});

	it("breaks the way wherever the Company went further than the next hex", () => {
		const stretches = routeStretches(g, [hex(1, 1), hex(1, 2), hex(1, 3), hex(5, 5), hex(5, 6), hex(9, 9)]);
		expect(stretches).toHaveLength(2);
		expect(stretches.map((points) => points.split(" ").length)).toEqual([3, 2]);
	});
});

describe("legendGlyph", () => {
	it("draws a small mark for every kind the key lists", () => {
		for (const kind of LEGEND_KINDS) {
			const svg = legendGlyph(kind, palette);
			expect(svg).toMatch(/^<svg [^>]*aria-hidden="true"/);
			expect(svg).toMatch(/<(path|polygon|circle|line) /);
		}
	});
});

describe("where the Company stands on the chart", () => {
	it("marks the Company's hex, and only it", () => {
		const svg = chart();
		expect(count(svg, "is-here")).toBe(1);
		expect(svg).toMatch(new RegExp(`class="[^"]*is-here[^"]*" data-hex="${hexKey(wild)}"`));
	});
});

describe("chartScrollBy", () => {
	const pane = { top: 100, bottom: 500 };

	it("leaves a hex already in view where it is", () => {
		expect(chartScrollBy({ top: 120, bottom: 180 }, pane)).toBe(0);
	});

	it("brings a hex below the pane up to the middle", () => {
		expect(chartScrollBy({ top: 800, bottom: 860 }, pane)).toBe(530);
	});

	it("brings a hex above the pane, or cut off at its edge, down to the middle", () => {
		expect(chartScrollBy({ top: -200, bottom: -140 }, pane)).toBe(-470);
		expect(chartScrollBy({ top: 470, bottom: 530 }, pane)).toBe(200);
	});
});

describe("haloPoints", () => {
	it("draws the ring round another hex just as the chart draws it round the one chosen", () => {
		const svg = chart({ selected: hexKey(wild) });
		const outline = /data-hex="5,5"[^>]*><title>[^<]*<\/title><polygon class="bastionland-travels-chart__hex" points="([^"]+)"/.exec(svg)[1];
		const ring = /class="bastionland-travels-chart__halo" points="([^"]+)"/.exec(svg)[1];
		const pairs = (text) => text.split(" ").map((pair) => pair.split(",").map(Number));
		pairs(haloPoints(outline)).forEach(([x, y], index) => {
			expect(x).toBeCloseTo(pairs(ring)[index][0], 0);
			expect(y).toBeCloseTo(pairs(ring)[index][1], 0);
		});
	});
});

describe("zooming the chart", () => {
	const whole = { x: -10, y: -10, width: 400, height: 300 };

	it("reads and writes a viewBox", () => {
		expect(parseChartBox("-10 -10 400 300")).toEqual(whole);
		expect(parseChartBox("0,0, 4,3")).toEqual({ x: 0, y: 0, width: 4, height: 3 });
		expect(parseChartBox("0 0 0 3")).toBeNull();
		expect(parseChartBox(null)).toBeNull();
		expect(chartBoxText({ x: 1.23456, y: 0, width: 2, height: 1.5 })).toBe("1.235 0 2 1.5");
	});

	it("zooms about the pointer, which stays put on the page", () => {
		const at = { x: 90, y: 140 };
		const box = zoomChartBox(whole, whole, 2, at);
		expect(box.width).toBe(200);
		expect(box.height).toBe(150);
		// The pointer is as far across the box, and down it, as it was across the whole.
		expect((at.x - box.x) / box.width).toBeCloseTo((at.x - whole.x) / whole.width);
		expect((at.y - box.y) / box.height).toBeCloseTo((at.y - whole.y) / whole.height);
		expect(chartZoomed(whole, box)).toBe(true);
	});

	it("goes no further out than the whole chart, nor closer than its limit", () => {
		expect(zoomChartBox(whole, whole, 0.5, { x: 0, y: 0 })).toEqual(whole);
		expect(chartZoomed(whole, whole)).toBe(false);
		const close = zoomChartBox(whole, whole, 1000, { x: 100, y: 100 });
		expect(close.width).toBeCloseTo(whole.width / CHART_MAX_ZOOM);
		expect(close.height / close.width).toBeCloseTo(whole.height / whole.width);
	});

	it("keeps a box on the chart and to its shape", () => {
		expect(clampChartBox(whole, { x: 1000, y: -1000, width: 100, height: 999 })).toEqual({ x: 290, y: -10, width: 100, height: 75 });
		expect(clampChartBox(whole, { x: 5, y: 5, width: 9999, height: 1 })).toEqual(whole);
	});

	it("drags the drawing with the pointer, as far as its edges", () => {
		const box = { x: 100, y: 100, width: 100, height: 75 };
		expect(panChartBox(whole, box, 20, -10)).toEqual({ x: 80, y: 110, width: 100, height: 75 });
		expect(panChartBox(whole, box, 500, 0).x).toBe(-10);
	});

	it("moves to hold a point only when it's out of view", () => {
		const box = { x: 100, y: 100, width: 100, height: 75 };
		expect(chartBoxHolding(whole, box, { x: 150, y: 120 })).toBe(box);
		expect(chartBoxHolding(whole, box, { x: 300, y: 200 })).toEqual({ x: 250, y: 162.5, width: 100, height: 75 });
	});

	it("turns the wheel into steps, a trackpad's into part of one", () => {
		expect(wheelZoomFactor(-100)).toBeCloseTo(1.2);
		expect(wheelZoomFactor(100)).toBeCloseTo(1 / 1.2);
		expect(wheelZoomFactor(-3, 1)).toBeCloseTo(1.2);
		expect(wheelZoomFactor(-10)).toBeGreaterThan(1);
		expect(wheelZoomFactor(-10)).toBeLessThan(1.2);
		expect(wheelZoomFactor(0)).toBe(1);
		// A wheel spun freely goes a step a turn at most.
		expect(wheelZoomFactor(-100000)).toBeCloseTo(1.2);
		expect(wheelZoomFactor(100000)).toBeCloseTo(1 / 1.2);
	});
});
