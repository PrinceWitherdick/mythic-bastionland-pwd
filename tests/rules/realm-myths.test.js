import { describe, expect, it } from "vitest";
import { createRandom } from "../../module/rules/random.js";
import { freeMythRolls, mythRollKey, mythRolls, mythWithRoll, rollFreeMyth, rollMythsAgain } from "../../module/rules/realm-myths.js";

/** A Realm's Myths, numbered 1 up, each in a hex of its own. */
const fakeMyths = (rolls) => rolls.map(([d6, d12], index) => ({
	number: index + 1,
	hex: { col: index + 1, row: 3 },
	d6,
	d12,
	omen: 0,
	revealed: false
}));

const SIX = fakeMyths([[1, 1], [2, 5], [3, 12], [4, 7], [5, 2], [6, 9]]);

describe("the Myths table", () => {
	it("is the book's 72, d6 first then d12", () => {
		const rolls = mythRolls();
		expect(rolls).toHaveLength(72);
		expect(rolls[0]).toMatchObject({ d6: 1, d12: 1, roll: "1-01" });
		expect(rolls.at(-1)).toMatchObject({ d6: 6, d12: 12, roll: "6-12" });
	});

	it("leaves out the Myths a Realm already holds", () => {
		const free = freeMythRolls(SIX);
		expect(free).toHaveLength(72 - 6);
		for (const myth of SIX) expect(free.some((roll) => mythRollKey(roll) === mythRollKey(myth))).toBe(false);
	});

	it("says which of the Realm's Myths is on a roll", () => {
		expect(mythWithRoll(SIX, { d6: 3, d12: 12 })?.number).toBe(3);
		expect(mythWithRoll(SIX, { d6: 3, d12: 11 })).toBeNull();
	});
});

describe("rolling one Myth again", () => {
	it("never gives the Realm a Myth it has, the one being rolled again among them", () => {
		for (let seed = 0; seed < 200; seed++) {
			const rolled = rollFreeMyth(createRandom(`again${seed}`), SIX);
			expect(mythWithRoll(SIX, rolled)).toBeNull();
		}
	});

	it("gives the same Myth for the same seed, and different Myths over many rolls", () => {
		const once = rollFreeMyth(createRandom("myth1"), SIX);
		expect(rollFreeMyth(createRandom("myth1"), SIX)).toEqual(once);
		const many = new Set(Array.from({ length: 50 }, (_, index) => mythRollKey(rollFreeMyth(createRandom(`myth${index}`), SIX))));
		expect(many.size).toBeGreaterThan(1);
	});

	it("has nothing left to give where the Realm holds every Myth in the book", () => {
		const everything = mythRolls().map((roll, index) => ({ number: index + 1, ...roll }));
		expect(rollFreeMyth(createRandom("full"), everything)).toBeNull();
	});
});

describe("rolling them all again", () => {
	it("keeps each Myth under its own number and in its own hex", () => {
		const rolled = rollMythsAgain(createRandom("all"), SIX);
		expect(rolled.map((myth) => myth.number)).toEqual([1, 2, 3, 4, 5, 6]);
		expect(rolled.map((myth) => myth.hex)).toEqual(SIX.map((myth) => myth.hex));
		// Nothing else about a Myth changes: its Omens are the window's to reset.
		expect(rolled.every((myth) => myth.omen === 0 && myth.revealed === false)).toBe(true);
	});

	it("gives no two alike", () => {
		for (let seed = 0; seed < 100; seed++) {
			const rolled = rollMythsAgain(createRandom(`set${seed}`), SIX);
			expect(new Set(rolled.map(mythRollKey)).size).toBe(6);
		}
	});

	// The dice don't remember, and the book doesn't say they should.
	it("can turn up a Myth the Realm had before", () => {
		const before = new Set(SIX.map(mythRollKey));
		const seeds = Array.from({ length: 100 }, (_, index) => `same${index}`);
		expect(seeds.some((seed) => rollMythsAgain(createRandom(seed), SIX).some((myth) => before.has(mythRollKey(myth))))).toBe(true);
	});

	it("rolls nothing for a Realm with no Myths", () => {
		expect(rollMythsAgain(createRandom("none"), [])).toEqual([]);
	});
});
