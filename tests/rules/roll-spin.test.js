import { describe, expect, it } from "vitest";
import { SPIN_FASTEST, SPIN_SLOWEST, spinDelays, spinPath, startRows, stepsFrom } from "../../module/rules/roll-spin.js";

describe("spinPath", () => {
	it("always ends on the row rolled", () => {
		for (let landing = 0; landing < 6; landing++) {
			const path = spinPath(landing, 6, 14);
			expect(path).toHaveLength(14);
			expect(path.at(-1)).toBe(landing);
		}
	});

	it("steps down the table in order, wrapping from the last row to the first", () => {
		expect(spinPath(2, 6, 10)).toEqual([5, 0, 1, 2, 3, 4, 5, 0, 1, 2]);
		expect(spinPath(0, 6, 3)).toEqual([4, 5, 0]);
		for (const steps of [14, 19]) {
			const path = spinPath(3, 6, steps);
			expect(path.every((row, index) => index === 0 || row === (path[index - 1] + 1) % 6)).toBe(true);
		}
	});

	it("goes straight to the row with nowhere else to go", () => {
		expect(spinPath(0, 1, 10)).toEqual([0]);
		expect(spinPath(4, 6, 0)).toEqual([4]);
	});
});

describe("spinDelays", () => {
	it("starts fast and slows to a stop", () => {
		const delays = spinDelays(14);
		expect(delays).toHaveLength(14);
		expect(delays[0]).toBe(SPIN_FASTEST);
		expect(delays.at(-1)).toBe(SPIN_SLOWEST);
		expect(delays.every((delay, index) => index === 0 || delay >= delays[index - 1])).toBe(true);
	});
});

describe("stepsFrom", () => {
	it("takes at least as many steps as asked, starting on the row asked", () => {
		for (let landing = 0; landing < 6; landing++) {
			for (let start = 0; start < 6; start++) {
				const steps = stepsFrom(landing, 6, 14, start);
				expect(steps).toBeGreaterThanOrEqual(14);
				expect(steps).toBeLessThan(20);
				const path = spinPath(landing, 6, steps);
				expect(path[0]).toBe(start);
				expect(path.at(-1)).toBe(landing);
			}
		}
		expect(spinPath(4, 6, stepsFrom(4, 6, 14))[0]).toBe(0);
	});
});

describe("startRows", () => {
	it("gives each column a row of its own", () => {
		for (const random of [() => 0, () => 0.99, Math.random]) {
			const starts = startRows(2, 6, random);
			expect(starts).toHaveLength(2);
			expect(starts[0]).not.toBe(starts[1]);
			expect(starts.every((row) => row >= 0 && row < 6)).toBe(true);
		}
	});

	it("shares rows only once every row is taken", () => {
		expect(new Set(startRows(3, 3)).size).toBe(3);
		expect(startRows(4, 2, () => 0)).toEqual([0, 1, 0, 0]);
	});
});
