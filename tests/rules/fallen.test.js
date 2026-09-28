import { describe, expect, it } from "vitest";
import {
	FALLEN_PATHS,
	companyGlory,
	fallenPaths,
	followersOf,
	knightHasFallen,
	replacementGlory,
	squireOf,
	successorOf
} from "../../module/rules/fallen.js";

const knight = { uuid: "Actor.k1", id: "k1", squire: "Actor.s1", steed: "Actor.h1" };

const squire = { uuid: "Actor.s1", name: "Ned", type: "knight", isSquire: true, serves: "Actor.k1" };
const steed = { uuid: "Actor.h1", name: "Bayard", type: "npc", companionOf: "k1" };
const hireling = { uuid: "Actor.g1", name: "The Guide", type: "npc", companionOf: "k1" };
const stranger = { uuid: "Actor.x1", name: "A stranger", type: "npc" };
const world = [squire, steed, hireling, stranger];

describe("FALLEN_PATHS", () => {
	it("holds the three p8 gives, with p195's successor after a new Knight", () => {
		expect(FALLEN_PATHS).toEqual(["newKnight", "successor", "squire", "follower"]);
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

	it("leaves out their successor, who has a path of their own", () => {
		expect(followersOf(knight, world, undefined, hireling)).toEqual([]);
	});
});

describe("successorOf", () => {
	const heir = { uuid: "Actor.k2", name: "Sir Ban", type: "knight", players: ["ann"] };
	const fallen = { ...knight, successor: "Actor.k2", players: ["ann"] };

	it("finds the Knight their sheet names to follow them", () => {
		expect(successorOf(fallen, [...world, heir])).toBe(heir);
	});

	it("finds a Squire named, even another Knight's", () => {
		const page = { uuid: "Actor.s9", name: "Pip", type: "knight", isSquire: true, serves: "Actor.k7" };
		expect(successorOf({ ...fallen, successor: "Actor.s9" }, [...world, page])).toBe(page);
	});

	it("finds one nobody plays yet", () => {
		const unplayed = { ...heir, players: [] };
		expect(successorOf(fallen, [unplayed])).toBe(unplayed);
	});

	it("leaves one another player plays to them", () => {
		expect(successorOf(fallen, [{ ...heir, players: ["bea"] }])).toBeNull();
		expect(successorOf(fallen, [{ ...heir, players: ["ann", "bea"] }])).toBeNull();
	});

	it("finds nobody where none is named, or the one named is gone or no Knight", () => {
		expect(successorOf(knight, [...world, heir])).toBeNull();
		expect(successorOf(fallen, world)).toBeNull();
		expect(successorOf({ ...fallen, successor: "Actor.g1" }, world)).toBeNull();
		expect(successorOf({ ...fallen, successor: fallen.uuid }, [{ ...heir, uuid: fallen.uuid }])).toBeNull();
		expect(successorOf(null, world)).toBeNull();
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

	it("offers a named successor after a new Knight", () => {
		expect(fallenPaths({ squire: true, followers: 1, successor: true })).toEqual(["newKnight", "successor", "squire", "follower"]);
		expect(fallenPaths({ squire: false, followers: 0, successor: true, canCreate: false })).toEqual(["successor"]);
	});
});

describe("companyGlory", () => {
	const rider = (glory, extra = {}) => ({ glory, played: true, ...extra });

	it("gives the least and the most Glory among the Knights riding on", () => {
		expect(companyGlory([rider(4), rider(7), rider(5)])).toEqual({ lowest: 4, highest: 7 });
	});

	it("leaves out Squires, the Slain, Knights nobody plays and Knights not yet chosen", () => {
		const knights = [
			rider(5),
			rider(0, { isSquire: true }),
			rider(1, { slain: true }),
			rider(2, { played: false }),
			rider(0, { unchosen: true })
		];
		expect(companyGlory(knights)).toEqual({ lowest: 5, highest: 5 });
	});

	it("reads Glory as a whole number, never below 0", () => {
		expect(companyGlory([rider("3"), rider(-2), rider(undefined)])).toEqual({ lowest: 0, highest: 3 });
	});

	it("gives null where nobody rides on", () => {
		expect(companyGlory([rider(3, { slain: true })])).toBeNull();
		expect(companyGlory([])).toBeNull();
		expect(companyGlory(null)).toBeNull();
	});
});

describe("replacementGlory", () => {
	it("offers the Company's least Glory where somebody has more than the Start gives", () => {
		expect(replacementGlory({ lowest: 4, highest: 7 }, 0)).toEqual({ lowest: 4, highest: 7, suggested: 4 });
	});

	it("never suggests less than the Start gives", () => {
		expect(replacementGlory({ lowest: 1, highest: 5 }, 3)).toEqual({ lowest: 1, highest: 5, suggested: 3 });
	});

	it("offers nothing to a Company that has earned no more than its Start", () => {
		expect(replacementGlory({ lowest: 0, highest: 0 }, 0)).toBeNull();
		expect(replacementGlory({ lowest: 3, highest: 3 }, 3)).toBeNull();
		expect(replacementGlory({ lowest: 4, highest: 6 }, 6)).toBeNull();
		expect(replacementGlory(null, 0)).toBeNull();
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
