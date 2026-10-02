import { describe, expect, it } from "vitest";
import { clampVirtue, conditionsFor, downBy, endsMortalWound, healsWound, isSavePassed, revives, typedD20, VIRTUE_MAX } from "../../module/rules/virtues.js";

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

describe("conditionsFor", () => {
	const at = (vig, extra = {}) => conditionsFor({ virtues: { vig: { value: vig, max: 12 }, cla: { value: 9 }, spi: { value: 9 } }, fatigued: false, exposed: false, mortalWound: false, ...extra });

	it("leaves somebody at VIG 0 by Virtue Loss Exhausted, and the Slain only Slain (p8, p9)", () => {
		expect(at(0)).toMatchObject({ exhausted: true, slain: false });
		expect(at(0, { slain: true })).toMatchObject({ exhausted: false, slain: true });
		expect(at(5)).toMatchObject({ exhausted: false, slain: false });
	});
});

describe("downBy", () => {
	it("names why somebody can't act: Slain before Mortally Wounded", () => {
		expect(downBy({ slain: true, mortalWound: true })).toBe("slain");
		expect(downBy({ mortalWound: true })).toBe("mortalWound");
		expect(downBy({ fatigued: true })).toBeNull();
		expect(downBy(undefined)).toBeNull();
	});
});

describe("revives", () => {
	const vig = (value) => ({ system: { virtues: { vig: { value } } } });

	it("lifts Slain once an update brings VIG above 0", () => {
		expect(revives({ slain: true }, vig(4))).toBe(true);
		expect(revives({ slain: true }, vig(0))).toBe(false);
	});

	it("leaves the mark being set, one never made, or an update not touching VIG alone", () => {
		expect(revives({ slain: true }, { system: { slain: true, virtues: { vig: { value: 4 } } } })).toBe(false);
		expect(revives({ slain: false }, vig(4))).toBe(false);
		expect(revives({ slain: true }, { system: { notes: "" } })).toBe(false);
		expect(revives({ slain: true }, { name: "Eve" })).toBe(false);
	});
});

describe("endsMortalWound", () => {
	it("lifts a Mortal Wound once its bearer is marked Slain, however it's marked", () => {
		expect(endsMortalWound({ mortalWound: true }, { system: { slain: true } })).toBe(true);
	});

	it("leaves an update that says so itself, one not marking Slain, or no wound", () => {
		expect(endsMortalWound({ mortalWound: true }, { system: { slain: true, mortalWound: true } })).toBe(false);
		expect(endsMortalWound({ mortalWound: true }, { system: { slain: false } })).toBe(false);
		expect(endsMortalWound({ mortalWound: false }, { system: { slain: true } })).toBe(false);
		expect(endsMortalWound({ mortalWound: true }, { name: "Eve" })).toBe(false);
	});
});
