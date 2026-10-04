import { describe, expect, it } from "vitest";
import { hexCentre, realmGeometry } from "../../module/rules/realm-geometry.js";
import {
	DEFAULT_VISITED_MARK_COLOURS,
	DEFAULT_VISITED_MARK_STYLE,
	VISITED_MARK_STYLES,
	strokesPath,
	visitedMarkColours,
	visitedMarkPen,
	visitedMarkStrokes,
	visitedMarkStyle
} from "../../module/rules/visited-mark-style.js";

const g = realmGeometry({ cols: 12, rows: 12 });
const hex = { col: 4, row: 4 };
const centre = hexCentre(g, hex);
const away = ({ x, y }) => Math.hypot(x - centre.x, y - centre.y);

describe("the visited marks", () => {
	it("offers the pencilled ring, a tick, a cross and the hex's edge, and ticks unless told otherwise", () => {
		expect(VISITED_MARK_STYLES).toEqual(["pencil", "tick", "cross", "edge"]);
		expect(visitedMarkStyle("cross")).toBe("cross");
		expect(DEFAULT_VISITED_MARK_STYLE).toBe("tick");
		expect(visitedMarkStyle("smudge")).toBe("tick");
		expect(visitedMarkStyle(undefined)).toBe("tick");
	});

	it("keeps a colour for each mark, the default where one stored isn't a colour", () => {
		expect(visitedMarkColours(null)).toEqual(DEFAULT_VISITED_MARK_COLOURS);
		expect(visitedMarkColours({ tick: "#ABCDEF", cross: "red", edge: 7 })).toEqual({
			...DEFAULT_VISITED_MARK_COLOURS,
			tick: "#abcdef"
		});
	});

	it("draws the tick and the cross in the middle of the hex, and the edge just inside its border", () => {
		for (const style of ["tick", "cross"]) {
			for (const { points } of visitedMarkStrokes(g, hex, style)) {
				for (const point of points) expect(away(point)).toBeLessThan(g.radius * 0.5);
			}
		}
		expect(visitedMarkStrokes(g, hex, "cross")).toHaveLength(2);
		const [edge] = visitedMarkStrokes(g, hex, "edge");
		expect(edge.closed).toBe(true);
		expect(edge.points).toHaveLength(6);
		for (const point of edge.points) {
			expect(away(point)).toBeLessThan(g.radius);
			expect(away(point)).toBeGreaterThan(g.radius * 0.9);
		}
	});

	it("keeps the pencilled ring as it was, dashes round the inside of the hex", () => {
		const strokes = visitedMarkStrokes(g, hex, "pencil");
		expect(strokes.length).toBeGreaterThanOrEqual(6);
		for (const { points, closed } of strokes) {
			expect(closed).toBe(false);
			for (const point of points) expect(away(point)).toBeGreaterThan(g.radius * 0.6);
		}
	});

	it("draws the new marks heavier than the pencil, with a halo under the tick and the cross alone", () => {
		const pencil = visitedMarkPen(g, "pencil");
		for (const style of ["tick", "cross", "edge"]) {
			const pen = visitedMarkPen(g, style);
			expect(pen.width).toBeGreaterThan(pencil.width);
			expect(pen.alpha).toBeGreaterThan(pencil.alpha);
			expect(Boolean(pen.halo)).toBe(style !== "edge");
		}
		expect(pencil.halo).toBeNull();
	});

	it("writes strokes as an SVG path, closing those that go all the way round", () => {
		const path = strokesPath([
			{ points: [{ x: 0, y: 0 }, { x: 1.25, y: 2 }], closed: false },
			{ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], closed: true }
		]);
		expect(path).toBe("M0 0 L1.3 2 M0 0 L1 0 L0 1 Z");
	});
});
