import { describe, expect, it } from "vitest";
import { lastingOf, withLasting, withoutLasting } from "../../module/rules/lasting-dice.js";

describe("lasting dice", () => {
	it("keeps only real dice from what's stored", () => {
		expect(lastingOf([{ faces: 8, label: "Fury" }, { faces: 7, label: "Odd" }, { faces: "12" }, null])).toEqual([
			{ faces: 8, label: "Fury" },
			{ faces: 12, label: "" }
		]);
		expect(lastingOf(undefined)).toEqual([]);
	});

	it("adds dice on, so a die that grows with each blow is kept again", () => {
		const once = withLasting([], [{ faces: 8, label: "Bonus" }]);
		expect(withLasting(once, [{ faces: 8, label: "Bonus" }])).toEqual([{ faces: 8, label: "Bonus" }, { faces: 8, label: "Bonus" }]);
	});

	it("drops one by its place", () => {
		expect(withoutLasting([{ faces: 6, label: "A" }, { faces: 10, label: "B" }], 0)).toEqual([{ faces: 10, label: "B" }]);
	});
});
