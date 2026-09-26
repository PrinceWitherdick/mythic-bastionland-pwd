import { describe, expect, it } from "vitest";
import { clampVirtue, healsWound, isSavePassed, typedD20, VIRTUE_MAX } from "../../module/rules/virtues.js";

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

describe("typedD20", () => {
	it.each([
		[1, 1],
		[20, 20],
		["14", 14],
		[0, null],
		[21, null],
		[7.5, null],
		["", null],
		[null, null],
		[undefined, null],
		["abc", null]
	])("reads %p as %p", (value, face) => {
		expect(typedD20(value)).toBe(face);
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

describe("healsWound", () => {
	const knight = (value, wounded = true) => ({ wounded, virtues: { vig: { value, max: 12 } } });
	const vig = (value) => ({ system: { virtues: { vig: { value } } } });

	it("clears Wounded once an update brings VIG back to whole", () => {
		expect(healsWound(knight(8), vig(12))).toBe(true);
		expect(healsWound(knight(8), vig(10))).toBe(false);
		expect(healsWound(knight(12), { system: { notes: "" } })).toBe(true);
	});

	it("leaves a mark being set, or one never made, alone", () => {
		expect(healsWound(knight(12), { system: { wounded: true } })).toBe(false);
		expect(healsWound(knight(8, false), vig(12))).toBe(false);
		expect(healsWound(knight(8), { name: "Eve" })).toBe(false);
	});
});
