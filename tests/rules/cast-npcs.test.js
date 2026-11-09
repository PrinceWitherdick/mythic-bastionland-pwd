import { describe, expect, it } from "vitest";
import { spreads } from "../../module/rules/book-art.js";
import { CITY_QUEST_PAGES } from "../../module/rules/city-quest.js";
import { fingerprint } from "../../module/rules/book-text.js";
import { FIGHTS_ON_CAST, WARBAND_CAST, castActor, castDetailUpdates, castEntryFor, castNotes, cityCastActors, countDocuments, documentsIn, eitherUpdates, fieldedAsWarband, fightsOnByBook, leaderLineUpdates, mythCastFolders, rangedUpdates } from "../../module/rules/cast-npcs.js";
import { CITY_CAST } from "../../module/rules/myth-cast.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// Names here are invented so no book text lives in the repository.

const words = {
	folder: (d6) => `Group ${d6}`,
	unnamedMyth: (roll) => `Myth ${roll}`,
	cityQuest: "The City Quest",
	castOf: (myth, page) => `Of the Cast of ${myth} (p${page}).`,
	attackName: "Attack"
};

const pageOf = (roll) => spreads().find((spread) => spread.roll === roll).mythPage;

const heron = {
	roll: "1-03",
	name: "The Heron",
	path: "mythic-bastionland-art/myths/1-03-heron.webp",
	cast: [
		{ name: "Wade, the Grey Heron", stats: { vig: 12, cla: 14, spi: 9, guard: 4 }, lines: ["A1 (feathers)", "Beak (d8)", "Stands very still."] },
		{ name: "The Stilt Tower", stats: { vig: null, cla: null, spi: null, guard: 8 }, lines: ["A3, counts as a structure"] }
	]
};
const moth = { roll: "1-01", name: "The Moth", cast: [{ name: "Dusk, a Moth", stats: { vig: 5, cla: 16, spi: 7, guard: 1 }, lines: [] }] };
const bell = { roll: "4-12", name: "The Bell", path: "mythic-bastionland-art/myths/4-12-bell.webp", cast: [{ name: "Clapper", stats: null, lines: ["Rings when nobody pulls it."] }] };
const quiet = { roll: "2-02", name: "The Quiet", cast: [] };
const index = {
	myths: [bell, heron, quiet, moth],
	cityQuest: { cast: [{ name: "Ada, the Gatewarden", stats: { vig: 10, cla: 11, spi: 12, guard: 3 }, lines: [] }] }
};

describe("castActor", () => {
	const of = { key: "1-03", name: "The Heron", page: 32, img: heron.path };

	it("makes an NPC from the printed stat block, wearing the Myth's picture", () => {
		const actor = castActor(heron.cast[0], of, 100, words);
		expect(actor).toMatchObject({
			name: "Wade",
			type: "npc",
			img: heron.path,
			prototypeToken: { texture: { src: heron.path } },
			system: { epithet: "the Grey Heron", virtues: { vig: { value: 12, max: 12 } }, guard: { value: 4, max: 4 }, armour: 1 },
			sort: 100
		});
		expect(actor.items).toEqual([expect.objectContaining({ type: "weapon", name: "Beak" })]);
	});

	it("marks them as the Myth's, so dragged into the world they join its Cast", () => {
		expect(castActor(heron.cast[0], of, 100, words).flags).toEqual({ [SYSTEM_ID]: { cast: { myth: "1-03", from: "Wade, the Grey Heron" } } });
	});

	it("notes their traits, then the Cast they're in and its page", () => {
		expect(castActor(heron.cast[0], of, 100, words).system.notes).toBe("<p>Stands very still.</p><p>Of the Cast of the Heron (p32).</p>");
	});

	it("adds what the book says about the whole Cast after it", () => {
		expect(castActor(heron.cast[0], { ...of, note: "All of them fear frogs." }, 100, words).system.notes)
			.toBe("<p>Stands very still.</p><p>Of the Cast of the Heron (p32).</p><p>All of them fear frogs.</p>");
	});

	it("makes a Structure of one with only GD that counts as one", () => {
		expect(castActor(heron.cast[1], of, 200, words)).toMatchObject({ type: "structure", system: { guard: { value: 8, max: 8 }, armour: 3 } });
	});

	it("leaves the picture to the default without one", () => {
		const actor = castActor(moth.cast[0], { key: "1-01", name: "The Moth", page: 30 }, 100, words);
		expect(actor).not.toHaveProperty("img");
		expect(actor).not.toHaveProperty("prototypeToken");
	});
});

describe("fieldedAsWarband", () => {
	const list = { "1-03": [fingerprint("Reed Spears")] };

	it("knows one listed under their Myth, by the name before the comma", () => {
		expect(fieldedAsWarband("1-03", "Reed Spears", list)).toBe(true);
		expect(fieldedAsWarband("1-03", "Reed  Spears", list)).toBe(true);
	});

	it("leaves another name, the same name in another Cast, and Casts with none listed", () => {
		expect(fieldedAsWarband("1-03", "Reed Bows", list)).toBe(false);
		expect(fieldedAsWarband("1-04", "Reed Spears", list)).toBe(false);
		expect(fieldedAsWarband(CITY_CAST, "Reed Spears", list)).toBe(false);
	});

	it("lists one each in the Catacomb, the Mist, the Tree and the Rock", () => {
		expect(Object.keys(WARBAND_CAST)).toEqual(["5-04", "6-01", "6-06", "6-12"]);
		for (const prints of Object.values(WARBAND_CAST)) {
			expect(prints).toEqual([[expect.any(Number), expect.stringMatching(/^[0-9a-z]{12}$/)]]);
		}
	});

	it("leaves the rest of a listed Myth's Cast as they're printed", () => {
		const of = { key: "5-04", name: "The Marsh", page: pageOf("5-04") };
		expect(castActor({ name: "Reed Spears, of the Marsh", stats: null, lines: [] }, of, 100, words).system.scale).toBe("individual");
	});
});

describe("mythCastFolders", () => {
	it("puts each Myth with a Cast in a folder of its own, inside one per d6, in roll order", () => {
		const folders = mythCastFolders(index, words);
		expect(folders.map((folder) => folder.name)).toEqual(["Group 1", "Group 4"]);
		const [first, fourth] = folders;
		expect(first.documents).toEqual([]);
		expect(first.folders.map((folder) => [folder.name, folder.sort])).toEqual([["The Moth", 100], ["The Heron", 300]]);
		expect(first.folders[1].documents.map((actor) => actor.name)).toEqual(["Wade", "The Stilt Tower"]);
		expect(fourth.folders.map((folder) => folder.name)).toEqual(["The Bell"]);
	});

	it("notes each Myth's own page", () => {
		const [first] = mythCastFolders(index, words);
		expect(first.folders[1].documents[0].system.notes).toContain(`(p${pageOf("1-03")})`);
	});

	it("keeps a Cast entry printed without stats, as the GM Toolkit offers it", () => {
		const [, fourth] = mythCastFolders(index, words);
		expect(fourth.folders[0].documents[0]).toMatchObject({ name: "Clapper", type: "npc", img: bell.path });
	});

	it("names a Myth whose name wasn't read by its roll", () => {
		const [first] = mythCastFolders({ myths: [{ ...moth, name: "" }] }, words);
		expect(first.folders[0].name).toBe("Myth 1-01");
	});

	it("has nothing without an index", () => {
		expect(mythCastFolders(null, words)).toEqual([]);
		expect(mythCastFolders({ myths: [quiet] }, words)).toEqual([]);
	});
});

describe("cityCastActors", () => {
	it("makes the City Quest's Cast, marked as the City Quest's", () => {
		const city = cityCastActors(index, words);
		expect(city).toEqual([expect.objectContaining({ name: "Ada", flags: { [SYSTEM_ID]: { cast: { myth: CITY_CAST, from: "Ada, the Gatewarden" } } } })]);
		expect(city[0].system.notes).toContain(`Of the Cast of the City Quest (p${CITY_QUEST_PAGES.cast}).`);
		expect(cityCastActors(null, words)).toEqual([]);
	});
});

describe("countDocuments", () => {
	it("counts every actor, however deep", () => {
		expect(countDocuments(mythCastFolders(index, words))).toBe(4);
		expect(countDocuments([{ documents: [{}], folders: mythCastFolders(index, words) }])).toBe(5);
	});
});

describe("documentsIn", () => {
	it("gathers every actor, however deep", () => {
		const folders = [{ documents: [{ name: "a" }], folders: [{ documents: [{ name: "b" }], folders: [{ documents: [{ name: "c" }] }] }] }];
		expect(documentsIn(folders).map(({ name }) => name)).toEqual(["a", "b", "c"]);
	});
});

describe("castNotes", () => {
	it("keys each Cast's note as a Cast actor's flag names its Cast, leaving out Casts without one", () => {
		const notes = castNotes({ myths: [{ ...heron, castNote: "All of them fear frogs." }, moth], cityQuest: { cast: [], castNote: "Sworn to the gate." } });
		expect([...notes]).toEqual([["1-03", "All of them fear frogs."], [CITY_CAST, "Sworn to the gate."]]);
		expect(castNotes(null).size).toBe(0);
	});
});

describe("castDetailUpdates", () => {
	const npc = (scale, notes) => ({ type: "npc", system: { scale, notes } });
	const swarm = { system: { scale: "swarm" } };

	it("gives a swarm brought in before its scale, and the Cast's note at the foot of the notes", () => {
		expect(castDetailUpdates(npc("individual", "<p>Bites.</p>"), swarm, "Bats & more.")).toEqual({
			"system.scale": "swarm",
			"system.notes": "<p>Bites.</p><p>Bats &amp; more.</p>"
		});
	});

	it("gives a Warband brought in before the book's word on it was kept", () => {
		expect(castDetailUpdates(npc("individual", ""), { system: { scale: "warband" } }, null)).toEqual({ "system.scale": "warband" });
		expect(castDetailUpdates(npc("swarm", ""), { system: { scale: "warband" } }, null)).toBeNull();
	});

	it("gives one of the Cast that fights on through a Mortal Wound that mark, once", () => {
		const corpse = { type: "npc", system: { scale: "individual", notes: "", fightsOn: false } };
		expect(castDetailUpdates(corpse, { system: { scale: "individual", fightsOn: true } }, null)).toEqual({ "system.fightsOn": true });
		expect(castDetailUpdates({ ...corpse, system: { ...corpse.system, fightsOn: true } }, { system: { scale: "individual", fightsOn: true } }, null)).toBeNull();
	});

	it("leaves a scale the GM has set, a note already there, and a Cast with none", () => {
		expect(castDetailUpdates(npc("warband", "<p>Bats &amp; more.</p>"), swarm, "Bats & more.")).toBeNull();
		expect(castDetailUpdates(npc("individual", ""), { system: { scale: "individual" } }, null)).toBeNull();
		expect(castDetailUpdates({ type: "structure", system: { notes: "" } }, swarm, "")).toBeNull();
	});
});

describe("eitherUpdates", () => {
	const weapon = (name, either = "", id = name) => ({ id, type: "weapon", name, system: { either } });

	it("marks the attacks printed with \"or\" on a Cast member brought in before", () => {
		const items = [weapon("Pound", "", "p1"), weapon("Sweep", "", "s1"), weapon("Bite", "", "b1"), { id: "m1", type: "armour", name: "Pound", system: {} }];
		const printed = [weapon("Pound", "Pound"), weapon("Sweep", "Pound"), weapon("Bite")];
		expect(eitherUpdates(items, printed)).toEqual([
			{ _id: "p1", "system.either": "Pound" },
			{ _id: "s1", "system.either": "Pound" }
		]);
	});

	it("leaves weapons already marked, renamed or taken away", () => {
		const printed = [weapon("Pound", "Pound"), weapon("Sweep", "Pound")];
		expect(eitherUpdates([weapon("Pound", "Pound", "p1"), weapon("Great sweep", "", "s1")], printed)).toEqual([]);
	});
});

describe("fightsOnByBook", () => {
	const list = { "1-03": [fingerprint("Wade")] };

	it("knows one listed under their Myth, by the name before the comma, and nobody else", () => {
		expect(fightsOnByBook("1-03", "Wade", list)).toBe(true);
		expect(fightsOnByBook("1-03", "Reed Spears", list)).toBe(false);
		expect(fightsOnByBook("1-04", "Wade", list)).toBe(false);
	});

	it("lists the Rotting Corpse alone, by fingerprint", () => {
		expect(Object.keys(FIGHTS_ON_CAST)).toEqual(["1-10"]);
		expect(FIGHTS_ON_CAST["1-10"]).toEqual([[expect.any(Number), expect.stringMatching(/^[0-9a-z]{12}$/)]]);
	});

	it("marks only a listed one as fighting on", () => {
		const of = { key: "1-10", name: "The Corpse", page: pageOf("1-10") };
		expect(castActor({ name: "Somebody Else, of the Grave", stats: null, lines: [] }, of, 100, words).system.fightsOn).toBeUndefined();
	});
});

describe("castEntryFor", () => {
	it("finds the stat block a Cast member was made from, in a Myth's Cast or the City Quest's", () => {
		expect(castEntryFor(index, { myth: "1-03", from: "Wade, the Grey Heron" })).toBe(heron.cast[0]);
		expect(castEntryFor(index, { myth: CITY_CAST, from: "Ada, the Gatewarden" })).toBe(index.cityQuest.cast[0]);
	});

	it("finds nothing for a name or a Myth the index doesn't hold", () => {
		expect(castEntryFor(index, { myth: "1-03", from: "Nobody" })).toBeNull();
		expect(castEntryFor(index, { myth: "6-06", from: "Wade, the Grey Heron" })).toBeNull();
		expect(castEntryFor(index, null)).toBeNull();
	});
});

describe("rangedUpdates", () => {
	const weapon = (name, ranged, id = name) => ({ id, type: "weapon", name, system: { ranged } });

	it("marks the bows a Cast member brought in before has, and nothing else", () => {
		const items = [weapon("Shortbow", false, "b1"), weapon("Axe", false, "a1"), weapon("Sling", true, "s1")];
		const printed = [weapon("Shortbow", true), weapon("Axe", false), weapon("Sling", true)];
		expect(rangedUpdates(items, printed)).toEqual([{ _id: "b1", "system.ranged": true }]);
	});
});

describe("leaderLineUpdates", () => {
	const entry = {
		name: "Lantern Militia, led by Odrin",
		stats: { vig: 10, cla: 10, spi: 7, guard: 3 },
		lines: ["Spear (d8 long)", "Ordin has a crossbow (2d8) and a grudge against the reeve."]
	};
	const printed = castActor(entry, { key: "6-01", name: "The Fog", page: pageOf("6-01") }, 100, words);
	const weapon = (name, damage, id) => ({ id, type: "weapon", name, system: { damage } });
	/** The Militia as the stat block was read before its leader's line was the leader's. */
	const before = (notes = "<p>a grudge against the reeve.</p><p>Of the Cast of the Fog (p1).</p>", items = [weapon("Spear", "d8", "s1"), weapon("Ordin has a crossbow", "2d8", "c1")]) =>
		({ type: "npc", system: { notes }, items });

	it("takes away the weapon read off the leader's line and keeps the line whole in its place", () => {
		expect(leaderLineUpdates(before(), entry, printed, { attackName: "Attack" })).toEqual({
			remove: ["c1"],
			update: { "system.notes": "<p>Ordin has a crossbow (2d8) and a grudge against the reeve.</p><p>Of the Cast of the Fog (p1).</p>" }
		});
	});

	it("adds the line where what was left of it is gone, and keeps a weapon the Referee changed", () => {
		const changed = before("<p>My own notes.</p>", [weapon("Ordin has a crossbow", "d10", "c1")]);
		expect(leaderLineUpdates(changed, entry, printed)).toEqual({
			remove: [],
			update: { "system.notes": "<p>My own notes.</p><p>Ordin has a crossbow (2d8) and a grudge against the reeve.</p>" }
		});
	});

	it("owes nothing once mended, nor to a group with no leader's line", () => {
		expect(leaderLineUpdates(before(printed.system.notes, [weapon("Spear", "d8", "s1")]), entry, printed)).toBeNull();
		expect(leaderLineUpdates(before(), { ...entry, name: "Lantern Militia" }, printed)).toBeNull();
		expect(leaderLineUpdates(before(), null, printed)).toBeNull();
	});
});
