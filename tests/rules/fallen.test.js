import { describe, expect, it } from "vitest";
import { FALLEN_PATHS, fallenPaths, followersOf, knightHasFallen, squireOf } from "../../module/rules/fallen.js";

const knight = { uuid: "Actor.k1", id: "k1", squire: "Actor.s1", steed: "Actor.h1" };

const squire = { uuid: "Actor.s1", name: "Ned", type: "knight", isSquire: true, serves: "Actor.k1" };
const steed = { uuid: "Actor.h1", name: "Bayard", type: "npc", companionOf: "k1" };
const hireling = { uuid: "Actor.g1", name: "The Guide", type: "npc", companionOf: "k1" };
const stranger = { uuid: "Actor.x1", name: "A stranger", type: "npc" };
const world = [squire, steed, hireling, stranger];

describe("FALLEN_PATHS", () => {
	it("holds the three the book gives, in its order", () => {
		expect(FALLEN_PATHS).toEqual(["newKnight", "squire", "follower"]);
	});
});

describe("squireOf", () => {
	it("finds the Squire the sheet names", () => {
		expect(squireOf(knight, world)).toBe(squire);
	});

	it("finds one who serves them where the link was lost", () => {
		expect(squireOf({ ...knight, squire: "" }, world)).toBe(squire);
	});

	it("finds nobody for a Knight who rode alone", () => {
		expect(squireOf({ uuid: "Actor.k9", id: "k9" }, world)).toBeNull();
		expect(squireOf(null, world)).toBeNull();
	});
});

describe("followersOf", () => {
	it("gives those made from their Property, and whoever else serves them", () => {
		expect(followersOf(knight, world)).toEqual([hireling]);
	});

	it("leaves out the steed, which is a mount rather than somebody to play", () => {
		expect(followersOf(knight, world)).not.toContain(steed);
	});

	it("leaves out the Squire, who has a path of their own", () => {
		expect(followersOf(knight, world)).not.toContain(squire);
	});

	it("leaves out everybody else's people", () => {
		expect(followersOf(knight, world)).not.toContain(stranger);
	});

	it("gives none for no Knight", () => {
		expect(followersOf(null, world)).toEqual([]);
	});
});

describe("fallenPaths", () => {
	it("offers a new Knight, their Squire and a follower where all three are open", () => {
		expect(fallenPaths({ squire: true, followers: 2 })).toEqual(["newKnight", "squire", "follower"]);
	});

	it("leaves out what nobody was left", () => {
		expect(fallenPaths({ squire: false, followers: 0 })).toEqual(["newKnight"]);
		expect(fallenPaths({ squire: true, followers: 0 })).toEqual(["newKnight", "squire"]);
	});

	it("leaves out a new Knight where this user can't make actors", () => {
		expect(fallenPaths({ squire: true, followers: 1, canCreate: false })).toEqual(["squire", "follower"]);
	});
});

describe("knightHasFallen", () => {
	const played = { type: "knight", isSquire: false, hasPlayerOwner: true };

	it("is true for a played Knight who is Slain", () => {
		expect(knightHasFallen(played, "slain")).toBe(true);
	});

	it("is false for anything short of Slain", () => {
		for (const outcome of ["mortal", "wounded", "scar", "evaded", "none"]) expect(knightHasFallen(played, outcome)).toBe(false);
	});

	it("leaves a Squire's death to their Knight, and an NPC's to the Referee", () => {
		expect(knightHasFallen({ ...played, isSquire: true }, "slain")).toBe(false);
		expect(knightHasFallen({ ...played, type: "npc" }, "slain")).toBe(false);
		expect(knightHasFallen({ ...played, hasPlayerOwner: false }, "slain")).toBe(false);
	});
});
