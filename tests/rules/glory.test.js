import { describe, expect, it } from "vitest";
import { nextRank, rankForGlory } from "../../module/rules/glory.js";

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
