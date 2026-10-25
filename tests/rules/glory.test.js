import { describe, expect, it } from "vitest";
import { GLORY_AWARDS, GLORY_BUTTONS, changeGlory, nextRank, rankForGlory, unworthyOf } from "../../module/rules/glory.js";

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

describe("unworthyOf", () => {
	it("names the Rank a post asks for where the Glory falls short of it (p6)", () => {
		expect(unworthyOf(2, "council")).toBe("gallant");
		expect(unworthyOf(3, "court")).toBeNull();
		expect(unworthyOf(5, "holding")).toBe("tenant");
		expect(unworthyOf(6, "holding")).toBeNull();
		expect(unworthyOf(8, "seat")).toBe("dominant");
		expect(unworthyOf(9, "seat")).toBeNull();
	});

	it("asks nothing of a post it doesn't know", () => {
		expect(unworthyOf(0, "warband")).toBeNull();
	});
});

describe("Glory for a Bridge", () => {
	it("is an award of its own, given from the Bridge's tick rather than a button", () => {
		expect(GLORY_AWARDS).toContain("bridge");
		expect(GLORY_BUTTONS).not.toContain("bridge");
		expect(GLORY_BUTTONS).not.toContain("myth");
		expect(GLORY_BUTTONS).toEqual(["tournament", "battle"]);
	});
});
