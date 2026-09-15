import { describe, expect, it } from "vitest";
import { SEED_LENGTH, createRandom, randomSeed } from "../../module/rules/random.js";

describe("createRandom", () => {
	it("repeats itself for the same seed and not for another", () => {
		const draw = (seed) => {
			const random = createRandom(seed);
			return Array.from({ length: 20 }, () => random.float());
		};
		expect(draw("realm")).toEqual(draw("realm"));
		expect(draw("realm")).not.toEqual(draw("realms"));
		expect(draw("realm").every((value) => value >= 0 && value < 1)).toBe(true);
	});

	it("rolls every face of a die and nothing else", () => {
		const random = createRandom("dice");
		const seen = new Set(Array.from({ length: 600 }, () => random.die(12)));
		expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
	});

	it("shuffles without losing anything or changing the original", () => {
		const list = [1, 2, 3, 4, 5, 6, 7, 8];
		const shuffled = createRandom("cards").shuffle(list);
		expect([...shuffled].sort((a, b) => a - b)).toEqual(list);
		expect(list).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
	});

	it("picks by weight and never an item weighing nothing", () => {
		const random = createRandom("weights");
		const picks = Array.from({ length: 300 }, () => random.weighted(["never", "often", "sometimes"], (item) => ({ never: 0, often: 5, sometimes: 1 })[item]));
		expect(picks).not.toContain("never");
		expect(picks.filter((pick) => pick === "often").length).toBeGreaterThan(picks.filter((pick) => pick === "sometimes").length);
		expect(random.weighted(["a"], () => 0)).toBeUndefined();
		expect(random.pick([])).toBeUndefined();
	});
});

describe("randomSeed", () => {
	it("makes a short seed from easily read letters", () => {
		expect(randomSeed()).toMatch(new RegExp(`^[a-z2-9]{${SEED_LENGTH}}$`));
		expect(randomSeed(() => 0)).toBe("aaaaaa");
	});
});
