import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
	BOOK_LAYOUT,
	DIRECTIONS,
	REALM_LAYOUTS,
	allHexes,
	directionNames,
	edgeAt,
	edgeDirection,
	edgeKey,
	edgeSegment,
	hexAt,
	hexCentre,
	hexDistance,
	hexIndex,
	hexKey,
	hexLine,
	hexTopLeft,
	hexVertices,
	inRealm,
	interiorEdges,
	neighbour,
	neighbours,
	normaliseLayout,
	parseEdgeKey,
	parseHexKey,
	realmGeometry
} from "../../module/rules/realm-geometry.js";

const g = realmGeometry();
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.01;

/** Every layout, as the book's 12 by 12 and as an odd-sized map, so no rule leans on the counts being even. */
const LAID = REALM_LAYOUTS.flatMap((layout) => [
	[`${layout} 12x12`, realmGeometry({ layout })],
	[`${layout} 7x9`, realmGeometry({ layout, cols: 7, rows: 9 })]
]);

describe("realmGeometry", () => {
	it("sizes a 12 by 12 Realm to fit its hexes exactly", () => {
		expect(g).toMatchObject({ size: 160, cols: 12, rows: 12, width: 1709, height: 2000, layout: BOOK_LAYOUT, columns: true, gridType: 5 });
		expect(g.radius).toBeCloseTo(92.376, 3);
		expect(Object.isFrozen(g)).toBe(true);
	});

	it("lays a Realm with pointed tops out in rows, on Foundry's row grids", () => {
		const rows = realmGeometry({ layout: "evenRows" });
		expect(rows).toMatchObject({ columns: false, gridType: 3, width: 2000, height: 1709, hexWidth: 160 });
		expect(rows.hexHeight).toBeCloseTo(184.752, 3);
		expect(realmGeometry({ layout: "oddRows" }).gridType).toBe(2);
		expect(realmGeometry({ layout: "oddColumns" }).gridType).toBe(4);
	});

	it("takes anything else for the book's layout", () => {
		expect(normaliseLayout("sideways")).toBe(BOOK_LAYOUT);
		expect(normaliseLayout(undefined)).toBe(BOOK_LAYOUT);
		expect(realmGeometry({ layout: "sideways" }).layout).toBe(BOOK_LAYOUT);
	});
});

describe("hex positions", () => {
	it.each([
		[1, 1, 92.376, 80],
		[2, 1, 230.94, 160],
		[3, 1, 369.504, 80],
		[12, 12, 1616.581, 1920]
	])("puts column %i, row %i at (%f, %f), even columns half a hex lower", (col, row, x, y) => {
		const centre = hexCentre(g, { col, row });
		expect(centre.x).toBeCloseTo(x, 2);
		expect(centre.y).toBeCloseTo(y, 2);
	});

	it.each([
		["oddColumns", 1, 1, 92.376, 160],
		["oddColumns", 2, 1, 230.94, 80],
		["evenRows", 1, 1, 80, 92.376],
		["evenRows", 1, 2, 160, 230.94],
		["evenRows", 12, 12, 1920, 1616.581],
		["oddRows", 1, 1, 160, 92.376],
		["oddRows", 1, 2, 80, 230.94]
	])("with %s, puts column %i, row %i at (%f, %f)", (layout, col, row, x, y) => {
		const centre = hexCentre(realmGeometry({ layout }), { col, row });
		expect(centre.x).toBeCloseTo(x, 2);
		expect(centre.y).toBeCloseTo(y, 2);
	});

	it.each(LAID)("keeps every hex inside the Scene (%s)", (_name, laid) => {
		for (const hex of allHexes(laid)) {
			for (const corner of hexVertices(laid, hex)) {
				expect(corner.x).toBeGreaterThanOrEqual(-0.5);
				expect(corner.x).toBeLessThanOrEqual(laid.width + 0.5);
				expect(corner.y).toBeGreaterThanOrEqual(-0.5);
				expect(corner.y).toBeLessThanOrEqual(laid.height + 0.5);
			}
		}
	});

	it.each(LAID)("finds each hex from its centre and from near its corners (%s)", (_name, laid) => {
		for (const hex of allHexes(laid)) {
			const centre = hexCentre(laid, hex);
			expect(hexAt(laid, centre)).toEqual(hex);
			for (const corner of hexVertices(laid, hex)) {
				expect(hexAt(laid, { x: centre.x + (corner.x - centre.x) * 0.9, y: centre.y + (corner.y - centre.y) * 0.9 })).toEqual(hex);
			}
		}
	});

	it("finds nothing off the Realm", () => {
		expect(hexAt(g, { x: 230.94, y: 10 })).toBeNull();
		expect(hexAt(g, { x: 92.376, y: 1990 })).toBeNull();
		expect(hexAt(g, { x: g.width + 50, y: 500 })).toBeNull();
		expect(hexAt(g, { x: -20, y: 500 })).toBeNull();
		expect(hexAt(g, { x: Number.NaN, y: 5 })).toBeNull();
		// The half hex Foundry draws at the start of each row set in.
		expect(hexAt(realmGeometry({ layout: "evenRows" }), { x: 10, y: 230.94 })).toBeNull();
	});

	it("gives the box Foundry's grid highlight expects", () => {
		expect(hexTopLeft(g, { col: 1, row: 1 })).toEqual({ x: 0, y: 0 });
		const second = hexTopLeft(g, { col: 2, row: 1 });
		expect(second.x).toBeCloseTo(138.564, 2);
		expect(second.y).toBeCloseTo(80, 5);
		const rows = realmGeometry({ layout: "evenRows" });
		const first = hexTopLeft(rows, { col: 1, row: 1 });
		expect(first.x).toBeCloseTo(0, 5);
		expect(first.y).toBeCloseTo(0, 5);
		const below = hexTopLeft(rows, { col: 1, row: 2 });
		expect(below.x).toBeCloseTo(80, 5);
		expect(below.y).toBeCloseTo(138.564, 2);
	});

	it("numbers hexes row by row", () => {
		const hexes = allHexes(g);
		expect(hexes).toHaveLength(144);
		expect(hexes.every((hex, index) => hexIndex(g, hex) === index)).toBe(true);
		expect(parseHexKey(hexKey({ col: 5, row: 7 }))).toEqual({ col: 5, row: 7 });
		expect(parseHexKey("five,seven")).toBeNull();
		expect(inRealm(g, { col: 13, row: 1 })).toBe(false);
	});
});

describe("neighbours", () => {
	it.each(LAID)("steps one hex in the named direction (%s)", (_name, laid) => {
		// Direction k runs out through the edge between corners k and k+1: south-east first with flat tops, east with pointed.
		const turn = laid.columns ? 30 : 0;
		for (const hex of allHexes(laid)) {
			const centre = hexCentre(laid, hex);
			DIRECTIONS.forEach((_, direction) => {
				const next = neighbour(laid, hex, direction);
				if (!next) return;
				const angle = (Math.PI / 180) * (60 * direction + turn);
				expect(near(hexCentre(laid, next), { x: centre.x + laid.size * Math.cos(angle), y: centre.y + laid.size * Math.sin(angle) })).toBe(true);
				expect(edgeDirection(laid, hex, next)).toBe(direction);
			});
		}
	});

	it("names the ways out by the way the hexes point", () => {
		expect(directionNames(g)).toEqual(DIRECTIONS);
		expect(directionNames(realmGeometry({ layout: "oddRows" }))).toEqual(["east", "southeast", "southwest", "west", "northwest", "northeast"]);
		const rows = realmGeometry({ layout: "evenRows" });
		expect(directionNames(rows)[edgeDirection(rows, { col: 4, row: 4 }, { col: 5, row: 4 })]).toBe("east");
	});

	it.each(LAID)("is mutual, with fewer neighbours at the edges (%s)", (_name, laid) => {
		for (const hex of allHexes(laid)) {
			for (const { hex: next } of neighbours(laid, hex)) {
				expect(neighbours(laid, next).some(({ hex: back }) => back.col === hex.col && back.row === hex.row)).toBe(true);
			}
		}
		expect(neighbours(laid, { col: 4, row: 4 })).toHaveLength(6);
	});

	it("counts the corners' neighbours by which lines are set off", () => {
		expect(neighbours(g, { col: 1, row: 1 })).toHaveLength(2);
		expect(neighbours(realmGeometry({ layout: "oddColumns" }), { col: 1, row: 1 })).toHaveLength(3);
		expect(neighbours(realmGeometry({ layout: "evenRows" }), { col: 1, row: 1 })).toHaveLength(2);
		expect(neighbours(realmGeometry({ layout: "oddRows" }), { col: 1, row: 1 })).toHaveLength(3);
	});

	it.each(LAID)("measures distance as the fewest steps (%s)", (_name, laid) => {
		const start = { col: 1, row: 1 };
		const steps = new Map([[hexKey(start), 0]]);
		const queue = [start];
		while (queue.length) {
			const hex = queue.shift();
			for (const { hex: next } of neighbours(laid, hex)) {
				if (steps.has(hexKey(next))) continue;
				steps.set(hexKey(next), steps.get(hexKey(hex)) + 1);
				queue.push(next);
			}
		}
		for (const hex of allHexes(laid)) expect(hexDistance(laid, start, hex)).toBe(steps.get(hexKey(hex)));
	});

	it("measures the book's Realm corner to corner", () => {
		expect(hexDistance(g, { col: 1, row: 1 }, { col: 12, row: 12 })).toBe(17);
	});

	it.each(LAID)("draws a line a neighbour at a time, the shortest way, ending where it's going (%s)", (_name, laid) => {
		const hexes = allHexes(laid);
		for (const from of hexes.filter((_, index) => index % 7 === 0)) {
			for (const to of hexes) {
				const line = hexLine(laid, from, to);
				expect(line).toHaveLength(hexDistance(laid, from, to));
				[from, ...line].slice(0, -1).forEach((hex, index) => expect(hexDistance(laid, hex, line[index])).toBe(1));
				if (line.length) expect(line.at(-1)).toEqual(to);
				for (const hex of line) expect(inRealm(laid, hex)).toBe(true);
			}
		}
	});

	it("draws a line down a column through each hex between", () => {
		expect(hexLine(g, { col: 3, row: 2 }, { col: 3, row: 5 }).map(hexKey)).toEqual(["3,3", "3,4", "3,5"]);
		expect(hexLine(g, { col: 4, row: 4 }, { col: 4, row: 4 })).toEqual([]);
	});
});

describe("edges", () => {
	it("lists every shared edge once", () => {
		const edges = interiorEdges(g);
		expect(edges).toHaveLength(385);
		expect(new Set(edges).size).toBe(385);
		expect(edgeKey({ col: 4, row: 4 }, { col: 3, row: 4 })).toBe(edgeKey({ col: 3, row: 4 }, { col: 4, row: 4 }));
		expect(parseEdgeKey(g, "1,1|3,1")).toBeNull();
	});

	it("tells neighbours apart by the layout", () => {
		// With flat tops a hex in a lowered column meets the next column's hexes level with it and one below; with
		// pointed tops a hex in a row set in meets the next row's hexes under it and one to the right.
		const rows = realmGeometry({ layout: "evenRows" });
		expect(parseEdgeKey(g, "3,5|4,4")).not.toBeNull();
		expect(parseEdgeKey(rows, "3,5|4,4")).toBeNull();
		expect(parseEdgeKey(rows, "4,4|5,3")).not.toBeNull();
		expect(parseEdgeKey(g, "4,4|5,3")).toBeNull();
	});

	it.each(LAID)("draws each edge along corners both hexes share (%s)", (_name, laid) => {
		for (const key of interiorEdges(laid)) {
			const [, b] = parseEdgeKey(laid, key);
			const { from, to } = edgeSegment(laid, key);
			const corners = hexVertices(laid, b);
			expect(corners.some((corner) => near(corner, from))).toBe(true);
			expect(corners.some((corner) => near(corner, to))).toBe(true);
		}
	});

	it.each(LAID)("picks the edge nearest the pointer, but nothing at a hex's heart (%s)", (_name, laid) => {
		for (const key of interiorEdges(laid)) {
			const [a] = parseEdgeKey(laid, key);
			const { from, to } = edgeSegment(laid, key);
			const centre = hexCentre(laid, a);
			const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
			const inside = { x: middle.x + (centre.x - middle.x) * 0.15, y: middle.y + (centre.y - middle.y) * 0.15 };
			expect(edgeAt(laid, inside)?.key).toBe(key);
		}
		expect(edgeAt(laid, hexCentre(laid, { col: 4, row: 4 }))).toBeNull();
	});

	it("picks nothing on the Realm's rim", () => {
		const corner = hexCentre(g, { col: 1, row: 1 });
		expect(edgeAt(g, { x: corner.x - 70, y: corner.y })).toBeNull();
		const rows = realmGeometry({ layout: "evenRows" });
		const first = hexCentre(rows, { col: 1, row: 1 });
		expect(edgeAt(rows, { x: first.x, y: first.y - 70 })).toBeNull();
	});
});

// Checked against Foundry's own grid when a copy is installed where this repository expects one.
const FOUNDRY_APP = process.env.FOUNDRY_APP ?? "Z:/Foundry/Foundry Virtual Tabletop/resources/app";
const hexagonal = join(FOUNDRY_APP, "common/grid/hexagonal.mjs");

/** How Foundry's HexagonalGrid is set up for each layout, and so which grid type a Realm's Scene is given. */
const FOUNDRY_GRIDS = Object.freeze({
	evenColumns: { columns: true, even: true },
	oddColumns: { columns: true, even: false },
	evenRows: { columns: false, even: true },
	oddRows: { columns: false, even: false }
});

describe.runIf(existsSync(hexagonal))("against Foundry's hex grids", () => {
	it.each(LAID)("agrees on every hex's centre and corners (%s)", async (_name, laid) => {
		Math.SQRT3 ??= Math.sqrt(3);
		Math.SQRT1_3 ??= 1 / Math.sqrt(3);
		const module = await import(pathToFileURL(hexagonal).href);
		const HexagonalGrid = module.default ?? module.HexagonalGrid;
		const grid = new HexagonalGrid({ size: laid.size, ...FOUNDRY_GRIDS[laid.layout] });
		expect(grid.type).toBe(laid.gridType);

		for (const hex of allHexes(laid)) {
			const centre = hexCentre(laid, hex);
			const offset = grid.getOffset(centre);
			expect(near(grid.getCenterPoint(offset), centre)).toBe(true);
			const box = grid.getTopLeftPoint(offset);
			expect(near(box, hexTopLeft(laid, hex))).toBe(true);
			const theirs = grid.getVertices(offset);
			for (const corner of hexVertices(laid, hex)) expect(theirs.some((point) => near(point, corner))).toBe(true);
		}
	});
});
