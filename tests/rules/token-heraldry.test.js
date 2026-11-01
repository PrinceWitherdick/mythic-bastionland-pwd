import { describe, expect, it } from "vitest";
import { BADGE_SHARE, heraldryBadge } from "../../module/rules/token-heraldry.js";

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

	it("lays the painting over the field with its margin all round", () => {
		const badge = heraldryBadge({ x: 0, y: 0, width: 100, height: 100 });
		expect(badge.painting.x).toBeLessThan(badge.field.x);
		expect(badge.painting.y).toBeLessThan(badge.field.y);
		expect(badge.field.x).toBeGreaterThan(badge.outline.x);
	});
});

describe("heraldryBadge sizes", () => {
	it("draws a Token's shield unless told another share", () => {
		const art = { x: 0, y: 0, width: 100, height: 100 };
		expect(heraldryBadge(art, 100, {})).toEqual(heraldryBadge(art));
		const small = heraldryBadge(art, 100, { share: 0.2 });
		expect(small.height).toBeCloseTo(20);
	});
});
