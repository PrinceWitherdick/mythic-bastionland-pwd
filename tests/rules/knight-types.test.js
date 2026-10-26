import { describe, expect, it } from "vitest";
import { KNIGHT_TYPES, becomesNpcKnight, isCompanyKnight, isKnight, isNpcKnight, kindStamp } from "../../module/rules/knight-types.js";

describe("the kinds of Knight", () => {
	it("are the Company's Knight and the Referee's NPC Knight, both following the Knight's rules", () => {
		expect(KNIGHT_TYPES).toEqual(["knight", "npcKnight"]);
		expect(isKnight({ type: "knight" })).toBe(true);
		expect(isKnight({ type: "npcKnight" })).toBe(true);
		for (const type of ["npc", "domain", "structure", "gmToolkit", undefined]) expect(isKnight({ type })).toBe(false);
		expect(isKnight(null)).toBe(false);
	});

	it("tells the Referee's own apart", () => {
		expect(isNpcKnight({ type: "npcKnight" })).toBe(true);
		expect(isNpcKnight({ type: "knight" })).toBe(false);
		expect(isNpcKnight(undefined)).toBe(false);
		expect(isCompanyKnight({ type: "knight" })).toBe(true);
		expect(isCompanyKnight({ type: "npcKnight" })).toBe(false);
	});
});

describe("a Knight from before NPC Knights", () => {
	const knight = { type: "knight", isSquire: false, hasPlayerOwner: false, inNpcFolder: false };

	it("becomes an NPC Knight when kept in the NPCs folder, or marked as not riding with the Company", () => {
		expect(becomesNpcKnight({ ...knight, inNpcFolder: true })).toBe(true);
		expect(becomesNpcKnight({ ...knight, companyKnight: false })).toBe(true);
	});

	it("stays a Knight otherwise: one of the Company, a Squire, a player's, or already an NPC Knight", () => {
		expect(becomesNpcKnight(knight)).toBe(false);
		expect(becomesNpcKnight({ ...knight, companyKnight: true })).toBe(false);
		expect(becomesNpcKnight({ ...knight, inNpcFolder: true, isSquire: true })).toBe(false);
		expect(becomesNpcKnight({ ...knight, inNpcFolder: true, hasPlayerOwner: true })).toBe(false);
		expect(becomesNpcKnight({ ...knight, type: "npcKnight", inNpcFolder: true })).toBe(false);
	});
});

describe("the stamp of a change of kind", () => {
	it("is the time now, or one past the last when that is as late", () => {
		expect(kindStamp(0, 1000)).toBe(1000);
		expect(kindStamp(500, 1000)).toBe(1000);
		expect(kindStamp(1000, 1000)).toBe(1001);
		expect(kindStamp(2000, 1000)).toBe(2001);
		expect(kindStamp(undefined, 1000)).toBe(1000);
		expect(kindStamp("bad", 1000)).toBe(1000);
	});
});
