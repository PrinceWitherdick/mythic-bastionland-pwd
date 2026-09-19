import { describe, expect, it } from "vitest";
import { SPECIALIST_DICE, specialistDie } from "../../module/rules/attack.js";
import { isInTurmoil, isSameName } from "../../module/rules/dominion.js";
import { legacyGlory } from "../../module/rules/time.js";

describe("specialistDie", () => {
	it("offers the book's +d8 and +d10, and the +d6 some Knights' weapons carry", () => {
		expect(SPECIALIST_DICE).toEqual(["d6", "d8", "d10"]);
	});

	it("reads a specialist weapon's die", () => {
		expect(specialistDie({ specialist: { die: "d10", situation: "against the undead" } })).toBe("d10");
	});

	it("is null for an ordinary weapon, one made before specialists, or an unknown die", () => {
		expect(specialistDie({ specialist: { die: "", situation: "" } })).toBeNull();
		expect(specialistDie({ damage: "d8" })).toBeNull();
		expect(specialistDie({ specialist: { die: "d12" } })).toBeNull();
		expect(specialistDie(undefined)).toBeNull();
	});
});

describe("isInTurmoil", () => {
	it("lasts the Season the Holding was seized in", () => {
		expect(isInTurmoil("2-harvest", "2-harvest")).toBe(true);
	});

	it("ends once the Season turns, and never starts for a Holding not seized", () => {
		expect(isInTurmoil("2-harvest", "2-winter")).toBe(false);
		expect(isInTurmoil("", "2-harvest")).toBe(false);
	});
});

describe("isSameName", () => {
	it("ignores case and surrounding space", () => {
		expect(isSameName(" Sir Brand ", "sir brand")).toBe(true);
		expect(isSameName("Sir Brand", "Dame Wren")).toBe(false);
	});

	it("never matches a blank name", () => {
		expect(isSameName("", "")).toBe(false);
		expect(isSameName("  ", "")).toBe(false);
	});
});

describe("legacyGlory", () => {
	it("passes on half of the Knight's Glory, rounded down", () => {
		expect(legacyGlory(7)).toBe(3);
		expect(legacyGlory(8)).toBe(4);
		expect(legacyGlory(1)).toBe(0);
	});

	it("passes on nothing from no Glory, or from something unreadable", () => {
		expect(legacyGlory(0)).toBe(0);
		expect(legacyGlory(-3)).toBe(0);
		expect(legacyGlory(undefined)).toBe(0);
	});
});
