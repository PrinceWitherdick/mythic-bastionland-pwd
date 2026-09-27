import { describe, expect, it } from "vitest";
import { SCARS, scarForRoll, scarRaisesGuardNow, settlesByTending } from "../../module/rules/scars.js";

describe("SCARS", () => {
	it("has one entry for each result from 1 to 12", () => {
		expect(SCARS.map((scar) => scar.roll)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
	});
});

describe("scarForRoll", () => {
	it("finds the entry for a roll", () => {
		expect(scarForRoll(5)).toMatchObject({ key: "rupture", loss: { virtue: "vig", formula: "2d6" } });
	});

	it("returns null outside the table", () => {
		expect(scarForRoll(0)).toBeNull();
		expect(scarForRoll(13)).toBeNull();
	});
});

describe("scarRaisesGuardNow", () => {
	it("raises GD at once when max GD is at or under the threshold", () => {
		expect(scarRaisesGuardNow(scarForRoll(4), 4)).toBe(true);
		expect(scarRaisesGuardNow(scarForRoll(4), 5)).toBe(false);
	});

	it("never raises GD at once for Scars that wait on a later condition", () => {
		expect(scarRaisesGuardNow(scarForRoll(6), 1)).toBe(false);
	});
});

describe("settlesByTending", () => {
	it("waits a Gouge or a Tear on being stitched or patched up, until settled", () => {
		expect(settlesByTending({ roll: 6 })).toBe(true);
		expect(settlesByTending({ roll: 8 })).toBe(true);
		expect(settlesByTending({ roll: 8, resolved: true })).toBe(false);
		expect(settlesByTending({ roll: 10 })).toBe(false);
		expect(settlesByTending({ roll: 12 })).toBe(false);
	});
});
