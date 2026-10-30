import { describe, expect, it } from "vitest";
import { ROUND_FLAG_PATH, isRoundPicture, newTokenShape, roundAfterShapeChange } from "../../module/rules/round-tokens.js";

const GRID = { GRIDLESS: 0, SQUARE: 1, HEX: 2 };
const SHAPE = { ELLIPSE_1: 0, ELLIPSE_2: 1, TRAPEZOID_1: 2, RECTANGLE_1: 4, RECTANGLE_2: 5 };

describe("isRoundPicture", () => {
	it("is round unless the tick is off", () => {
		expect(isRoundPicture({})).toBe(true);
		expect(isRoundPicture({ round: true })).toBe(true);
		expect(isRoundPicture({ round: false })).toBe(false);
	});

	it("leaves Foundry's Dynamic Ring and the Company's Token alone", () => {
		expect(isRoundPicture({ ringEnabled: true })).toBe(false);
		expect(isRoundPicture({ isCompany: true })).toBe(false);
	});

	it("keeps its flag under the system's flags", () => {
		expect(ROUND_FLAG_PATH).toBe("flags.mythic-bastionland-pwd.roundPicture");
	});
});

describe("newTokenShape", () => {
	it("makes a Token dropped on a hex or gridless Scene an Ellipse", () => {
		for (const gridType of [GRID.GRIDLESS, GRID.HEX]) {
			expect(newTokenShape({ gridType, shape: SHAPE.RECTANGLE_1 })).toBe(SHAPE.ELLIPSE_1);
			expect(newTokenShape({ gridType })).toBe(SHAPE.ELLIPSE_1);
		}
	});

	it("leaves a square grid's Tokens to Foundry", () => {
		expect(newTokenShape({ gridType: GRID.SQUARE, shape: SHAPE.RECTANGLE_1 })).toBeUndefined();
	});

	it("keeps a Shape someone chose", () => {
		expect(newTokenShape({ gridType: GRID.HEX, shape: SHAPE.TRAPEZOID_1 })).toBeUndefined();
		expect(newTokenShape({ gridType: GRID.HEX, shape: SHAPE.RECTANGLE_2 })).toBeUndefined();
		expect(newTokenShape({ gridType: GRID.HEX, shape: SHAPE.ELLIPSE_2 })).toBeUndefined();
	});

	it("keeps a copied Token square when its picture was made square", () => {
		expect(newTokenShape({ gridType: GRID.GRIDLESS, shape: SHAPE.RECTANGLE_1, round: false })).toBeUndefined();
	});
});

describe("roundAfterShapeChange", () => {
	it("does nothing when the Shape isn't changing", () => {
		expect(roundAfterShapeChange({}, {})).toBeUndefined();
		expect(roundAfterShapeChange({}, { round: false })).toBeUndefined();
	});

	it("shows the picture square for a Rectangle and round for an Ellipse", () => {
		expect(roundAfterShapeChange({}, { shape: SHAPE.RECTANGLE_1 })).toBe(false);
		expect(roundAfterShapeChange({}, { shape: SHAPE.RECTANGLE_2 })).toBe(false);
		expect(roundAfterShapeChange({ round: false }, { shape: SHAPE.ELLIPSE_1 })).toBe(true);
		expect(roundAfterShapeChange({}, { shape: SHAPE.TRAPEZOID_1 })).toBeUndefined();
	});

	it("follows the Shape when the Token Config sends the tick unchanged", () => {
		expect(roundAfterShapeChange({}, { shape: SHAPE.RECTANGLE_1, round: true })).toBe(false);
		expect(roundAfterShapeChange({ round: false }, { shape: SHAPE.ELLIPSE_1, round: false })).toBe(true);
	});

	it("keeps a tick changed in the same save", () => {
		expect(roundAfterShapeChange({}, { shape: SHAPE.RECTANGLE_1, round: false })).toBeUndefined();
		expect(roundAfterShapeChange({ round: false }, { shape: SHAPE.RECTANGLE_1, round: true })).toBeUndefined();
	});
});
