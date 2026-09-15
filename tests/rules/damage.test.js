import { describe, expect, it } from "vitest";
import { applyDoom, resolveDamage } from "../../module/rules/damage.js";

describe("applyDoom", () => {
	it("turns a Mortal Wound into Slain", () => {
		const mortal = resolveDamage({ damage: 4, guard: 0, vigour: 6 });
		expect(applyDoom(mortal, 6)).toMatchObject({ vigour: 0, vigourLoss: 6, outcome: "slain", doom: true });
	});

	it("leaves every other outcome alone", () => {
		const wounded = resolveDamage({ damage: 1, guard: 0, vigour: 10 });
		expect(applyDoom(wounded, 10)).toBe(wounded);
	});
});

describe("resolveDamage", () => {
	it("subtracts Armour before touching GD", () => {
		const result = resolveDamage({ damage: 3, armour: 3, guard: 4, vigour: 10 });
		expect(result).toMatchObject({ dealt: 0, guard: 4, vigour: 10, outcome: "none" });
	});

	it("Evades while at least 1GD remains", () => {
		const result = resolveDamage({ damage: 3, guard: 4, vigour: 10 });
		expect(result).toMatchObject({ guard: 1, guardLoss: 3, vigour: 10, outcome: "evaded" });
	});

	it("gives a Scar when GD lands on exactly 0", () => {
		const result = resolveDamage({ damage: 4, guard: 4, vigour: 10 });
		expect(result).toMatchObject({ guard: 0, vigour: 10, outcome: "scar" });
	});

	// The worked example on p8: 7 bolstered to 8, less Armour 2, is 6 Damage.
	it("carries the excess over GD into VIG as a Wound", () => {
		const result = resolveDamage({ damage: 8, armour: 2, guard: 4, vigour: 12 });
		expect(result).toMatchObject({ dealt: 6, guard: 0, vigour: 10, vigourLoss: 2, outcome: "wounded" });
	});

	it("goes straight to VIG when GD is already 0", () => {
		const result = resolveDamage({ damage: 1, guard: 0, vigour: 10 });
		expect(result).toMatchObject({ vigour: 9, outcome: "wounded" });
	});

	// Getting Rules Wrong (p180): 4 VIG lost from 6 should have been Mortal.
	it("is a Mortal Wound when half or more of the remaining VIG is lost", () => {
		const result = resolveDamage({ damage: 4, guard: 0, vigour: 6 });
		expect(result).toMatchObject({ vigour: 2, outcome: "mortal" });
	});

	it("rounds the half-VIG threshold in the target's favour", () => {
		expect(resolveDamage({ damage: 3, guard: 0, vigour: 7 }).outcome).toBe("wounded");
		expect(resolveDamage({ damage: 4, guard: 0, vigour: 7 }).outcome).toBe("mortal");
	});

	it("Slays at 0 VIG and never takes VIG below 0", () => {
		const result = resolveDamage({ damage: 20, guard: 3, vigour: 5 });
		expect(result).toMatchObject({ guard: 0, vigour: 0, vigourLoss: 5, outcome: "slain" });
	});

	it("treats an Exposed target as having 0GD without spending their GD", () => {
		const result = resolveDamage({ damage: 2, guard: 5, vigour: 10, exposed: true });
		expect(result).toMatchObject({ guard: 5, guardLoss: 0, vigour: 8, outcome: "wounded" });
	});

	// Warfare (p11): individual Attacks don't harm a Warband, nor ordinary ones a structure.
	it("leaves a target the Attack can't harm untouched", () => {
		const result = resolveDamage({ damage: 12, guard: 3, vigour: 10, immune: true });
		expect(result).toEqual({ dealt: 0, guard: 3, vigour: 10, guardLoss: 0, vigourLoss: 0, outcome: "unharmed" });
	});
});
