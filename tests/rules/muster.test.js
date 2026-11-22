import { describe, expect, it } from "vitest";
import { absentFrom, musterRow, notYetFighting } from "../../module/rules/muster.js";

describe("absentFrom", () => {
	it("leaves out those with a Token on the Scene already, and the Slain", () => {
		const company = [{ id: "a" }, { id: "b" }, { id: "c", slain: true }, { id: "d" }];
		expect(absentFrom(company, ["b", null, "x"]).map(({ id }) => id)).toEqual(["a", "d"]);
		expect(absentFrom(company, ["a", "b", "d"])).toEqual([]);
	});
});

describe("musterRow", () => {
	it("stands them side by side a step apart, centred on the point", () => {
		expect(musterRow({ x: 500, y: 300 }, [1], 100)).toEqual([{ x: 500, y: 300 }]);
		expect(musterRow({ x: 500, y: 300 }, [1, 1], 100)).toEqual([{ x: 450, y: 300 }, { x: 550, y: 300 }]);
		expect(musterRow({ x: 500, y: 300 }, [1, 1, 1], 100).map(({ x }) => x)).toEqual([400, 500, 600]);
	});

	it("gives a large Token room, so it doesn't stand on its neighbours", () => {
		// A 2x2 beast between two Knights: 100 + 200 + 100 wide, centred on 500.
		expect(musterRow({ x: 500, y: 300 }, [1, 2, 1], 100).map(({ x }) => x)).toEqual([350, 500, 650]);
		expect(musterRow({ x: 500, y: 300 }, [2, 1], 100).map(({ x }) => x)).toEqual([450, 600]);
	});

	it("stands nobody when there's nobody to stand", () => {
		expect(musterRow({ x: 0, y: 0 }, [], 100)).toEqual([]);
	});
});

describe("notYetFighting", () => {
	it("keeps the Tokens that aren't in the Combat yet", () => {
		expect(notYetFighting([{ id: "t1" }, { id: "t2" }], ["t2", null])).toEqual([{ id: "t1" }]);
	});
});
