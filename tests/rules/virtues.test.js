import { describe, expect, it } from "vitest";
import { clampVirtue, isSavePassed, VIRTUE_MAX } from "../../module/rules/virtues.js";

describe("isSavePassed", () => {
	it("passes on a roll equal to the Virtue", () => {
		expect(isSavePassed(6, 6)).toBe(true);
	});

	it("fails on a roll above the Virtue", () => {
		expect(isSavePassed(7, 6)).toBe(false);
	});

	it("always fails at Virtue 0", () => {
		expect(isSavePassed(1, 0)).toBe(false);
	});

	it("still fails a natural 20 at the Virtue cap", () => {
		expect(isSavePassed(20, VIRTUE_MAX)).toBe(false);
	});
});

describe("clampVirtue", () => {
	it.each([
		[-3, 0],
		[0, 0],
		[12, 12],
		[19, 19],
		[25, 19],
		[7.8, 7],
		["abc", 0]
	])("clamps %s to %i", (input, expected) => {
		expect(clampVirtue(input)).toBe(expected);
	});
});
