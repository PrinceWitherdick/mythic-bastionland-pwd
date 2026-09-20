import { describe, expect, it } from "vitest";
import { diceKey, findDiceText } from "../../module/rules/dice-text.js";

describe("findDiceText", () => {
	it("finds the die a terrain cluster rolls, where the book prints it", () => {
		const text = "As a general guide create clusters of d12 hexes of the same terrain type.";
		const [die, ...rest] = findDiceText(text);
		expect(rest).toEqual([]);
		expect(text.slice(die.index, die.index + die.length)).toBe("d12");
		expect(die).toMatchObject({ count: 1, faces: 12, formula: "1d12" });
	});

	it("finds each die in a run of text, in order", () => {
		const dice = findDiceText("Push through (lose d6 VIG) or roll 2d10 for the way back.");
		expect(dice.map((die) => die.formula)).toEqual(["1d6", "2d10"]);
		expect(dice[1]).toMatchObject({ count: 2, faces: 10, length: 4 });
	});

	it("leaves alone what only looks like a die", () => {
		// A letter or digit either side, a number of faces nothing is rolled on, and no die at all.
		for (const text of ["d12s", "Mid20 of the Realm", "3d", "d7 hexes", "1-in-6 Hexes", "Draw 4 Holdings"]) {
			expect(findDiceText(text), text).toEqual([]);
		}
	});

	it("reads nothing out of nothing", () => {
		expect(findDiceText("")).toEqual([]);
		expect(findDiceText(null)).toEqual([]);
	});
});

describe("diceKey", () => {
	it("tells two of the same die in one text apart", () => {
		expect(diceKey("1d12", 0)).not.toBe(diceKey("1d12", 1));
	});
});
