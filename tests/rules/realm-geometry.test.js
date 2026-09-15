import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
	DIRECTIONS,
	allHexes,
	edgeAt,
	edgeDirection,
	edgeKey,
	edgeSegment,
	hexAt,
	hexCentre,
	hexDistance,
	hexIndex,
	hexKey,
	hexTopLeft,
	hexVertices,
	inRealm,
	interiorEdges,
	neighbour,
	neighbours,
	parseEdgeKey,
	parseHexKey,
	realmGeometry
} from "../../module/rules/realm-geometry.js";

const g = realmGeometry();
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.01;

describe("realmGeometry", () => {
	it("sizes a 12 by 12 Realm to fit its hexes exactly", () => {
		expect(g).toMatchObject({ size: 160, cols: 12, rows: 12, width: 1709, height: 2000 });
		expect(g.radius).toBeCloseTo(92.376, 3);
		expect(Object.isFrozen(g)).toBe(true);
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

	it("keeps every hex inside the Scene", () => {
		for (const hex of allHexes(g)) {
			for (const corner of hexVertices(g, hex)) {
				expect(corner.x).toBeGreaterThanOrEqual(-0.5);
				expect(corner.x).toBeLessThanOrEqual(g.width + 0.5);
				expect(corner.y).toBeGreaterThanOrEqual(-0.5);
				expect(corner.y).toBeLessThanOrEqual(g.height + 0.5);
			}
		}
	});

	it("finds each hex from its centre and from near its corners", () => {
		for (const hex of allHexes(g)) {
			const centre = hexCentre(g, hex);
			expect(hexAt(g, centre)).toEqual(hex);
			for (const corner of hexVertices(g, hex)) {
				expect(hexAt(g, { x: centre.x + (corner.x - centre.x) * 0.9, y: centre.y + (corner.y - centre.y) * 0.9 })).toEqual(hex);
			}
		}
	});

	it("finds nothing off the Realm", () => {
		expect(hexAt(g, { x: 230.94, y: 10 })).toBeNull();
		expect(hexAt(g, { x: 92.376, y: 1990 })).toBeNull();
		expect(hexAt(g, { x: g.width + 50, y: 500 })).toBeNull();
		expect(hexAt(g, { x: -20, y: 500 })).toBeNull();
		expect(hexAt(g, { x: Number.NaN, y: 5 })).toBeNull();
	});

	it("gives the box Foundry's grid highlight expects", () => {
		expect(hexTopLeft(g, { col: 1, row: 1 })).toEqual({ x: 0, y: 0 });
		const second = hexTopLeft(g, { col: 2, row: 1 });
		expect(second.x).toBeCloseTo(138.564, 2);
		expect(second.y).toBeCloseTo(80, 5);
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
	it("steps one hex in the named direction", () => {
		for (const hex of allHexes(g)) {
			const centre = hexCentre(g, hex);
			DIRECTIONS.forEach((_, direction) => {
				const next = neighbour(g, hex, direction);
				if (!next) return;
				const angle = (Math.PI / 180) * (60 * direction + 30);
				expect(near(hexCentre(g, next), { x: centre.x + g.size * Math.cos(angle), y: centre.y + g.size * Math.sin(angle) })).toBe(true);
				expect(edgeDirection(hex, next)).toBe(direction);
			});
		}
	});

	it("is mutual, with fewer neighbours at the edges", () => {
		for (const hex of allHexes(g)) {
			for (const { hex: next } of neighbours(g, hex)) {
				expect(neighbours(g, next).some(({ hex: back }) => back.col === hex.col && back.row === hex.row)).toBe(true);
			}
		}
		expect(neighbours(g, { col: 1, row: 1 })).toHaveLength(2);
		expect(neighbours(g, { col: 6, row: 6 })).toHaveLength(6);
	});

	it("measures distance as the fewest steps", () => {
		const start = { col: 1, row: 1 };
		const steps = new Map([[hexKey(start), 0]]);
		const queue = [start];
		while (queue.length) {
			const hex = queue.shift();
			for (const { hex: next } of neighbours(g, hex)) {
				if (steps.has(hexKey(next))) continue;
				steps.set(hexKey(next), steps.get(hexKey(hex)) + 1);
				queue.push(next);
			}
		}
		for (const hex of allHexes(g)) expect(hexDistance(start, hex)).toBe(steps.get(hexKey(hex)));
		expect(hexDistance({ col: 1, row: 1 }, { col: 12, row: 12 })).toBe(17);
	});
});

describe("edges", () => {
	const edges = interiorEdges(g);

	it("lists every shared edge once", () => {
		expect(edges).toHaveLength(385);
		expect(new Set(edges).size).toBe(385);
		expect(edgeKey({ col: 4, row: 4 }, { col: 3, row: 4 })).toBe(edgeKey({ col: 3, row: 4 }, { col: 4, row: 4 }));
		expect(parseEdgeKey("1,1|3,1")).toBeNull();
	});

	it("draws each edge along corners both hexes share", () => {
		for (const key of edges) {
			const [, b] = parseEdgeKey(key);
			const { from, to } = edgeSegment(g, key);
			const corners = hexVertices(g, b);
			expect(corners.some((corner) => near(corner, from))).toBe(true);
			expect(corners.some((corner) => near(corner, to))).toBe(true);
		}
	});

	it("picks the edge nearest the pointer, but nothing at a hex's heart or the Realm's rim", () => {
		for (const key of edges) {
			const [a] = parseEdgeKey(key);
			const { from, to } = edgeSegment(g, key);
			const centre = hexCentre(g, a);
			const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
			const inside = { x: middle.x + (centre.x - middle.x) * 0.15, y: middle.y + (centre.y - middle.y) * 0.15 };
			expect(edgeAt(g, inside)?.key).toBe(key);
		}
		expect(edgeAt(g, hexCentre(g, { col: 6, row: 6 }))).toBeNull();
		const corner = hexCentre(g, { col: 1, row: 1 });
		expect(edgeAt(g, { x: corner.x - 70, y: corner.y })).toBeNull();
	});
});

// Checked against Foundry's own grid when a copy is installed where this repository expects one.
const FOUNDRY_APP = process.env.FOUNDRY_APP ?? "Z:/Foundry/Foundry Virtual Tabletop/resources/app";
const hexagonal = join(FOUNDRY_APP, "common/grid/hexagonal.mjs");

describe.runIf(existsSync(hexagonal))("against Foundry's HEXEVENQ grid", () => {
	it("agrees on every hex's centre and corners", async () => {
		Math.SQRT3 ??= Math.sqrt(3);
		Math.SQRT1_3 ??= 1 / Math.sqrt(3);
		const module = await import(pathToFileURL(hexagonal).href);
		const HexagonalGrid = module.default ?? module.HexagonalGrid;
		const grid = new HexagonalGrid({ size: g.size, columns: true, even: true });

		for (const hex of allHexes(g)) {
			const centre = hexCentre(g, hex);
			const offset = grid.getOffset(centre);
			expect(near(grid.getCenterPoint(offset), centre)).toBe(true);
			const theirs = grid.getVertices(offset);
			for (const corner of hexVertices(g, hex)) expect(theirs.some((point) => near(point, corner))).toBe(true);
		}
	});
});
