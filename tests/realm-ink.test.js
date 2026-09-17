import { describe, expect, it } from "vitest";
import { MYTH_COUNT } from "../module/rules/realm.js";
import { INK_CROWN, curvePath, drawInk, inkNumeral, inkPath } from "../scripts/lib/realm-ink.js";

const COLOURS = { ink: "#111111", paper: "#ffffff" };

const numbers = (d) => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);

describe("curvePath", () => {
	it("bends smoothly through points, and turns sharply at a sharp one", () => {
		expect(curvePath([{ x: 0, y: 0 }, { x: 20, y: 10 }, { x: 40, y: 0 }])).toMatch(/^M0 0C[\d. -]+C[\d. -]+$/);
		const square = curvePath([{ x: 0, y: 0, sharp: true }, { x: 30, y: 0, sharp: true }, { x: 30, y: 30, sharp: true }], true);
		expect(square).toBe("M0 0L30 0L30 30L0 0Z");
	});

	it("goes exactly through its points, so pieces drawn to meet do", () => {
		const d = curvePath([{ x: 12.3, y: 4.5, sharp: true }, { x: 50, y: 60 }, { x: 88.8, y: 7.1, sharp: true }]);
		expect(numbers(d).slice(0, 2)).toEqual([12.3, 4.5]);
		expect(numbers(d).slice(-2)).toEqual([88.8, 7.1]);
	});
});

describe("inkPath", () => {
	it("nudges each point only a little, the same way every time", () => {
		const d = inkPath("10,10 50,60 90,10");
		expect(inkPath("10,10 50,60 90,10")).toBe(d);
		const [x, y] = numbers(d);
		expect(Math.abs(x - 10)).toBeLessThanOrEqual(0.8);
		expect(Math.abs(y - 10)).toBeLessThanOrEqual(0.8);
	});

	it("bows a long straight line, as a hand would", () => {
		expect(inkPath("0,0! 60,0!")).toMatch(/^M[\d. -]+Q[\d. -]+$/);
		expect(inkPath("0,0! 4,0!")).toMatch(/^M[\d. -]+L[\d. -]+$/);
	});
});

describe("drawInk", () => {
	it("paints strokes, outlines and solids in the given colours, sharing an element where it can", () => {
		const svg = drawInk([
			["line", 4, "0,0 50,50"],
			["line", 4, "50,0 0,50"],
			["shape", 3, "10,10! 20,10! 20,20!"],
			["solid", "30,30 40,30 40,40"]
		], COLOURS);
		const paths = svg.match(/<path [^>]*\/>/g);
		expect(paths).toHaveLength(3);
		expect(paths[0]).toContain('stroke="#111111" stroke-width="4"');
		expect(paths[0].match(/M/g)).toHaveLength(2);
		expect(paths[1]).toContain('fill="#ffffff" stroke="#111111"');
		expect(paths[2]).toMatch(/^<path d="M[^"]+Z" fill="#111111"\/>$/);
	});

	it("refuses a part it doesn't know", () => {
		expect(() => drawInk([["splash", "0,0"]], COLOURS)).toThrow(/splash/);
	});

	it.each([
		...Array.from({ length: MYTH_COUNT }, (_, index) => [`Myth ${index + 1}`, inkNumeral(index + 1)]),
		["the crown", INK_CROWN]
	])("draws %s inside its box", (_name, parts) => {
		const svg = drawInk(parts, COLOURS);
		expect(svg).not.toMatch(/NaN|undefined|Infinity/);
		const all = [...svg.matchAll(/ d="([^"]+)"/g)].flatMap(([, d]) => numbers(d));
		expect(Math.min(...all)).toBeGreaterThanOrEqual(-2);
		expect(Math.max(...all)).toBeLessThanOrEqual(102);
	});
});
