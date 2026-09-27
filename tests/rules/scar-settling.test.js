import { describe, expect, it } from "vitest";
import { awaitsRevengeOn, isDoomed, isScarPending, scarForRoll, scarRaisesGuardLater } from "../../module/rules/scars.js";

describe("Scars that settle later", () => {
	it("wait on Gouge, Tear, Mutilation and Humiliation until settled", () => {
		const waiting = [6, 8, 10, 12].map((roll) => ({ roll }));
		expect(waiting.every(isScarPending)).toBe(true);
		expect(isScarPending({ roll: 6, resolved: true })).toBe(false);
		expect(isScarPending({ roll: 3 })).toBe(false);
		expect(isScarPending({ roll: null })).toBe(false);
	});

	it("raise max GD only while it's at or under the entry's limit", () => {
		expect(scarRaisesGuardLater({ roll: 6 }, 6)).toBe(true);
		expect(scarRaisesGuardLater({ roll: 6 }, 7)).toBe(false);
		expect(scarRaisesGuardLater({ roll: 12 }, 12)).toBe(true);
		expect(scarRaisesGuardLater({ roll: 1 }, 0)).toBe(false);
	});

	it("settle Mutilation when the Season turns, and the rest when the Referee says", () => {
		expect(scarForRoll(10).bySeason).toBe(true);
		expect([6, 8, 12].some((roll) => scarForRoll(roll).bySeason)).toBe(false);
	});
});

describe("awaitsRevengeOn", () => {
	const chief = { uuid: "Actor.chief", name: "Bandit Chief" };

	it("names the foe who dealt a Humiliation, by UUID or by a name typed in", () => {
		expect(awaitsRevengeOn({ roll: 12, foe: "Actor.chief", foeName: "Bandit Chief" }, chief)).toBe(true);
		expect(awaitsRevengeOn({ roll: 12, foe: "", foeName: " bandit chief " }, chief)).toBe(true);
		expect(awaitsRevengeOn({ roll: 12, foe: "Actor.other", foeName: "Somebody Else" }, chief)).toBe(false);
	});

	it("waits on nobody once settled, when nobody is named, or for another Scar", () => {
		expect(awaitsRevengeOn({ roll: 12, foe: "Actor.chief", resolved: true }, chief)).toBe(false);
		expect(awaitsRevengeOn({ roll: 12, foe: "", foeName: "" }, { uuid: "", name: "" })).toBe(false);
		expect(awaitsRevengeOn({ roll: 6, foe: "Actor.chief", foeName: "Bandit Chief" }, chief)).toBe(false);
	});
});

describe("isDoomed", () => {
	const winter = { age: 2, season: "winter", day: 3, phase: "night" };

	it("holds for a Doom Scar taken this Season", () => {
		expect(isDoomed([{ roll: 11, season: "2-winter" }], winter)).toBe(true);
	});

	it("lifts once the Season turns, and never comes from other Scars", () => {
		expect(isDoomed([{ roll: 11, season: "2-harvest" }], winter)).toBe(false);
		expect(isDoomed([{ roll: 11, season: "" }], winter)).toBe(false);
		expect(isDoomed([{ roll: 10, season: "2-winter" }], winter)).toBe(false);
		expect(isDoomed([], winter)).toBe(false);
	});
});
