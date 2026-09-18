import { describe, expect, it } from "vitest";
import { SHIELD_OUTLINE_PATH, SHIELD_PATH } from "../../module/rules/heraldry.js";
import { BADGE_SHARE, heraldryBadge, pathSteps } from "../../module/rules/token-heraldry.js";

describe("heraldryBadge", () => {
	it("sits at a Token's top right, sized to its shorter side, hanging a little past the corner", () => {
		const badge = heraldryBadge({ x: 0, y: 0, width: 200, height: 100 });
		expect(badge.height).toBeCloseTo(100 * BADGE_SHARE);
		expect(badge.outline.y).toBeLessThan(0);
		expect(badge.outline.x + badge.width).toBeGreaterThan(200);
		expect(badge.outline.x).toBeLessThan(200 - badge.width / 2);
		expect(badge.outline.y + badge.height).toBeGreaterThan(badge.height / 2);
	});

	it("follows a picture narrower than its Token, sized by the Token", () => {
		const badge = heraldryBadge({ x: 30, y: 0, width: 40, height: 100 }, 100);
		expect(badge.height).toBeCloseTo(100 * BADGE_SHARE);
		expect(badge.outline.x + badge.width).toBeGreaterThan(70);
		expect(badge.outline.x + badge.width).toBeLessThan(75);
	});

	it("draws the shield's outline to the box it gives", () => {
		const badge = heraldryBadge({ x: 0, y: 0, width: 100, height: 100 });
		const steps = pathSteps(SHIELD_OUTLINE_PATH, badge.scale, badge.outline.x, badge.outline.y);
		for (const [, ...points] of steps) {
			for (let i = 0; i < points.length; i += 2) {
				expect(points[i]).toBeLessThanOrEqual(badge.outline.x + badge.width + 1e-9);
				expect(points[i + 1]).toBeLessThanOrEqual(badge.outline.y + badge.height + 1e-9);
			}
		}
	});

	it("lays the painting over the field with its margin all round", () => {
		const badge = heraldryBadge({ x: 0, y: 0, width: 100, height: 100 });
		expect(badge.painting.x).toBeLessThan(badge.field.x);
		expect(badge.painting.y).toBeLessThan(badge.field.y);
		expect(badge.field.x).toBeGreaterThan(badge.outline.x);
	});
});

describe("pathSteps", () => {
	it("scales and moves every point, turning V into L", () => {
		expect(pathSteps("M0 7 Q68 -5 136 7 V68 Z", 0.5, 10, 20)).toEqual([
			["M", 10, 23.5],
			["Q", 44, 17.5, 78, 23.5],
			["L", 78, 54],
			["Z"]
		]);
	});

	it("reads both of the shield's paths", () => {
		expect(pathSteps(SHIELD_PATH, 1, 0, 0).at(-1)).toEqual(["Z"]);
		expect(pathSteps(SHIELD_OUTLINE_PATH, 1, 0, 0)[0]).toEqual(["M", 0, 8]);
	});

	it("refuses relative commands", () => {
		expect(() => pathSteps("m0 0 l1 1", 1, 0, 0)).toThrow();
	});
});
