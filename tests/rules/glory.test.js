import { describe, expect, it } from "vitest";
import { changeGlory, nextRank, rankForGlory } from "../../module/rules/glory.js";

describe("changeGlory", () => {
	it("adds Glory and names a Rank newly reached", () => {
		expect(changeGlory(2, 1)).toEqual({ from: 2, to: 3, rank: "gallant" });
		expect(changeGlory(3, 1)).toEqual({ from: 3, to: 4, rank: null });
	});

	it("names the Rank a Knight falls back to, and never goes below 0", () => {
		expect(changeGlory(6, -1)).toEqual({ from: 6, to: 5, rank: "gallant" });
		expect(changeGlory(0, -1)).toEqual({ from: 0, to: 0, rank: null });
	});
});

describe("rankForGlory", () => {
	it.each([
		[0, "errant"],
		[2, "errant"],
		[3, "gallant"],
		[5, "gallant"],
		[6, "tenant"],
		[9, "dominant"],
		[11, "dominant"],
		[12, "radiant"],
		[30, "radiant"]
	])("%i Glory is Knight-%s", (glory, rank) => {
		expect(rankForGlory(glory)).toBe(rank);
	});

	it("treats missing Glory as Knight-Errant", () => {
		expect(rankForGlory(undefined)).toBe("errant");
	});
});

describe("nextRank", () => {
	it("counts the Glory still needed", () => {
		expect(nextRank(4)).toEqual({ key: "tenant", needed: 2 });
	});

	it("is null for a Knight-Radiant", () => {
		expect(nextRank(12)).toBeNull();
	});
});
