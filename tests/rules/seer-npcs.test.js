import { describe, expect, it } from "vitest";
import { seerActor, seerFolders } from "../../module/rules/seer-npcs.js";

// Names here are invented so no book text lives in the repository.

const words = {
	folder: (d6) => `Group ${d6}`,
	knighted: (knight, page) => `Knighted ${knight} (p${page}).`,
	attackName: "Attack"
};

const glass = {
	d6: 1,
	d12: 2,
	roll: "1-02",
	page: 30,
	name: "The Glass Seer",
	path: "mythic-bastionland-art/seers/1-02-glass-seer.webp",
	stats: { vig: 8, cla: 13, spi: 16, guard: 3 },
	lines: ["A1 (glass robes)", "Shard staff (d6)", "Sees through anything made by hands."]
};
const statue = {
	d6: 1,
	d12: 1,
	roll: "1-01",
	page: 28,
	name: "The Clay Seer",
	path: "mythic-bastionland-art/seers/1-01-clay-seer.webp",
	stats: { vig: null, cla: null, spi: null, guard: 6 },
	lines: ["A3, treat as a Structure", "Never moves."]
};
const void_ = { d6: 2, d12: 5, roll: "2-05", page: 60, name: "The Hollow Seer", stats: null, lines: ["Isn't there."] };
const hook = { d6: 2, d12: 1, roll: "2-01", page: 52, name: "The Hook Seer", stats: { vig: 10, cla: 9, spi: 12, guard: 2 }, lines: [] };
const index = {
	seers: [glass, void_, hook, statue],
	knights: [{ roll: "1-02", name: "The Lantern Knight" }, { roll: "1-01", name: "The Kiln Knight" }]
};

describe("seerActor", () => {
	it("makes an NPC from their stat block, pictured as the book pictures them", () => {
		const actor = seerActor(glass, { name: "The Lantern Knight" }, words);
		expect(actor).toMatchObject({
			name: "The Glass Seer",
			type: "npc",
			img: glass.path,
			prototypeToken: { texture: { src: glass.path } },
			system: { virtues: { vig: { value: 8, max: 8 }, cla: { value: 13, max: 13 }, spi: { value: 16, max: 16 } }, guard: { value: 3, max: 3 }, armour: 1 },
			sort: 102
		});
		expect(actor.items).toEqual([expect.objectContaining({ type: "weapon", name: "Shard staff", system: expect.objectContaining({ damage: "d6" }) })]);
	});

	it("notes their traits, then the Knight they knighted and on whose page they're printed", () => {
		const { system } = seerActor(glass, { name: "The Lantern Knight" }, words);
		expect(system.notes).toBe("<p>Sees through anything made by hands.</p><p>Knighted the Lantern Knight (p30).</p>");
		expect(seerActor(glass, null, words).system.notes).toBe("<p>Sees through anything made by hands.</p>");
	});

	it("makes a Structure of a Seer with only GD that counts as one", () => {
		expect(seerActor(statue, null, words)).toMatchObject({ type: "structure", system: { guard: { value: 6, max: 6 }, armour: 3 } });
	});

	it("leaves the picture to the default without one", () => {
		const actor = seerActor(hook, null, words);
		expect(actor).not.toHaveProperty("img");
		expect(actor).not.toHaveProperty("prototypeToken");
	});
});

describe("seerFolders", () => {
	it("puts the Seers with stat blocks in a folder per d6, in roll order", () => {
		const folders = seerFolders(index, words);
		expect(folders.map((folder) => folder.name)).toEqual(["Group 1", "Group 2"]);
		expect(folders.map((folder) => folder.documents.map((actor) => actor.name))).toEqual([["The Clay Seer", "The Glass Seer"], ["The Hook Seer"]]);
	});

	it("finds each Seer's Knight by their shared roll", () => {
		const [first] = seerFolders(index, words);
		expect(first.documents[0].system.notes).toContain("Knighted the Kiln Knight (p28).");
	});

	it("has nothing without an index", () => {
		expect(seerFolders(null, words)).toEqual([]);
		expect(seerFolders({ seers: [void_] }, words)).toEqual([]);
	});
});
