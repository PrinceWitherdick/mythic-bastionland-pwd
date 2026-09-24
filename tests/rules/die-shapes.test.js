import { describe, expect, it } from "vitest";
import { DIE_SHAPES, dieMask, dieShape } from "../../module/rules/die-shapes.js";

/** Every die the book's weapons, Feats and Saves roll. */
const BOOK_DICE = [4, 6, 8, 10, 12, 20];

describe("die profiles", () => {
	it("draws every die the book rolls", () => {
		for (const faces of BOOK_DICE) expect(dieShape(faces)).toBe(DIE_SHAPES[faces]);
	});

	it("gives each die a profile of its own", () => {
		const drawn = BOOK_DICE.map((faces) => dieMask(faces));
		expect(new Set(drawn).size).toBe(BOOK_DICE.length);
	});

	it("keeps every profile inside the square it is cut from, so the dice line up", () => {
		for (const faces of [...BOOK_DICE, 3, 7, 100]) {
			for (const [x, y] of dieShape(faces)) {
				expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
				expect(x).toBeGreaterThanOrEqual(0);
				expect(y).toBeGreaterThanOrEqual(0);
				expect(x).toBeLessThanOrEqual(100);
				expect(y).toBeLessThanOrEqual(100);
			}
		}
	});

	it("draws each die with corners enough to read it", () => {
		expect(dieShape(4)).toHaveLength(3);
		expect(dieShape(6)).toHaveLength(4);
		expect(dieShape(8)).toHaveLength(4);
		expect(dieShape(12)).toHaveLength(5);
		expect(dieShape(20)).toHaveLength(6);
	});

	it("falls back to a shape for a die the book never rolls", () => {
		expect(dieShape(7)).toHaveLength(7);
		// Past ten corners a polygon reads as a circle, so nothing gains by drawing more.
		expect(dieShape(100)).toHaveLength(10);
		expect(dieShape(0)).toBe(DIE_SHAPES[6]);
		expect(dieShape(undefined)).toBe(DIE_SHAPES[6]);
	});

	describe("the mask a card carries", () => {
		it("rounds the corners off, the way a die's are", () => {
			expect(dieMask(6)).toContain("stroke-linejoin%3D%27round%27");
		});

		it("holds nothing a style attribute or the server would baulk at", () => {
			for (const faces of BOOK_DICE) {
				const mask = dieMask(faces);
				expect(mask.startsWith("url(data:image/svg+xml,")).toBe(true);
				// Anything a url() can't hold unquoted, or Handlebars would escape, is encoded away.
				expect(/[<>"'=\s]/.test(mask.slice("url(".length, -1))).toBe(false);
			}
		});

		it("draws the shape inside the box once the rounding is laid on it", () => {
			const corners = [...dieMask(4).matchAll(/([ML])(-?[0-9.]+)%20(-?[0-9.]+)/g)].map((match) => [
				Number(match[2]),
				Number(match[3])
			]);
			expect(corners).toHaveLength(3);
			// The rule that rounds the corners is 13 wide, so half of it must still fit.
			for (const [x, y] of corners) {
				expect(Math.min(x, y)).toBeGreaterThanOrEqual(6.5);
				expect(Math.max(x, y)).toBeLessThanOrEqual(93.5);
			}
		});
	});
});
