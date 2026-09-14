import { describe, expect, it } from "vitest";
import { buildAttackPool, parseDice, summarizeAttack } from "../../module/rules/attack.js";

describe("parseDice", () => {
	it.each([
		["d8", [8]],
		["2d6", [6, 6]],
		["D10", [10]],
		["d6+d4", [6, 4]],
		[" 2d8 ", [8, 8]],
		["", []],
		["hefty", []],
		[undefined, []]
	])("reads %j as %j", (notation, expected) => {
		expect(parseDice(notation)).toEqual(expected);
	});

	it("caps runaway dice counts", () => {
		expect(parseDice("99d6")).toHaveLength(10);
	});
});

describe("buildAttackPool", () => {
	// The worked example on p8: mace, shield, and an ally's two daggers.
	it("rolls every weapon and shield die together", () => {
		const pool = buildAttackPool({ sources: ["d8", "d4", "d6", "d6"] });
		expect(pool).toEqual({ dice: [8, 4, 6, 6], impaired: false });
	});

	it("adds bonus dice such as Smite", () => {
		expect(buildAttackPool({ sources: ["d8"], bonus: [12] }).dice).toEqual([8, 12]);
	});

	it("rolls only a d4 when Impaired, ignoring bonus dice", () => {
		expect(buildAttackPool({ sources: ["2d10"], bonus: [12], impaired: true })).toEqual({ dice: [4], impaired: true });
	});

	it("treats an Attack with no weapon dice as unarmed and Impaired", () => {
		expect(buildAttackPool({ sources: [], bonus: [8] })).toEqual({ dice: [4], impaired: true });
	});
});

describe("summarizeAttack", () => {
	// p8: the dice show 7, 3, 1 and 5.
	it("takes the highest die and counts dice able to fund Gambits", () => {
		expect(summarizeAttack([7, 3, 1, 5])).toEqual({ highest: 7, gambitDice: 2, strongDice: 0 });
	});

	it("counts Strong Gambit dice only in melee", () => {
		expect(summarizeAttack([9, 8, 2])).toMatchObject({ strongDice: 2 });
		expect(summarizeAttack([9, 8, 2], { melee: false })).toMatchObject({ strongDice: 0 });
	});

	it("handles an empty roll", () => {
		expect(summarizeAttack([])).toEqual({ highest: 0, gambitDice: 0, strongDice: 0 });
	});
});
