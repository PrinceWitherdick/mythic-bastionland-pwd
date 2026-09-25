import { afterEach, describe, expect, it, vi } from "vitest";
import { NPC_PACK, fillNpcPack, seedNpcPack } from "../../module/book-art/npc-pack.js";

// Names here are invented so no book text lives in the repository.

const index = {
	seers: [{ d6: 1, d12: 2, roll: "1-02", page: 30, name: "The Glass Seer", stats: { vig: 8, cla: 13, spi: 16, guard: 3 }, lines: [] }],
	knights: [],
	myths: [{ roll: "2-04", name: "The Heron", cast: [{ name: "Wade, the Grey Heron", stats: { vig: 12, cla: 14, spi: 9, guard: 4 }, lines: [] }] }],
	cityQuest: { cast: [{ name: "Ada, the Gatewarden", stats: { vig: 10, cla: 11, spi: 12, guard: 3 }, lines: [] }] }
};

/**
 * A world with the old Seers compendium in it, and none yet for the NPCs.
 * @returns {object} The fakes, for inspecting what was made and deleted.
 */
function installWorld({ hasNpcPack = false } = {}) {
	let nextId = 0;
	const folders = [];
	const documents = [];
	const oldSeers = { title: "Seers", deleteCompendium: vi.fn(async () => {}) };
	const npcPack = { collection: `world.${NPC_PACK.name}`, folders: [], getIndex: async () => ({ size: 0 }), configure: vi.fn(async () => {}) };
	const packs = new Map([["world.bastionland-seers", oldSeers]]);
	if (hasNpcPack) packs.set(`world.${NPC_PACK.name}`, npcPack);
	const createCompendium = vi.fn(async () => {
		packs.set(`world.${NPC_PACK.name}`, npcPack);
		return npcPack;
	});

	globalThis.game = { packs, i18n: { localize: (key) => key, format: (key) => key } };
	globalThis.ui = { notifications: { info: vi.fn() } };
	globalThis.foundry = {
		documents: { collections: { CompendiumCollection: { createCompendium } } },
		utils: {
			getDocumentClass: (type) => type === "Folder"
				? { createDocuments: async (data) => data.map((folder) => (folders.push({ ...folder, id: `f${nextId++}` }), folders.at(-1))) }
				: { createDocuments: async (data) => documents.push(...data) }
		}
	};
	return { folders, documents, oldSeers, npcPack, createCompendium };
}

afterEach(() => {
	for (const key of ["game", "ui", "foundry"]) delete globalThis[key];
});

describe("fillNpcPack", () => {
	it("puts the Seers, the Myths' Casts and the City Quest's in one compendium, each in their own folder", async () => {
		const world = installWorld();
		await expect(fillNpcPack(index)).resolves.toEqual({ seers: 1, cast: 2 });

		expect(world.createCompendium).toHaveBeenCalledWith({ name: NPC_PACK.name, label: "bastionland.npcPack.label", type: "Actor" });
		expect(world.npcPack.configure).toHaveBeenCalledWith({ ownership: { ...NPC_PACK.ownership } });
		const named = (name) => world.folders.find((folder) => folder.name === name);
		const top = world.folders.filter((folder) => folder.folder === null).map((folder) => folder.name);
		expect(top).toEqual(["bastionland.npcPack.folders.seers", "bastionland.npcPack.folders.myths", "bastionland.cityQuest.title"]);
		// The Myths go by d6 and then by Myth; the Seers by d6.
		const heron = named("The Heron");
		expect(world.folders.find((folder) => folder.id === heron.folder).folder).toBe(named("bastionland.npcPack.folders.myths").id);
		expect(world.documents.map((actor) => [actor.name, world.folders.find((folder) => folder.id === actor.folder).name])).toEqual([
			["Ada", "bastionland.cityQuest.title"],
			["The Glass Seer", "bastionland.npcPack.d6.1"],
			["Wade", "The Heron"]
		]);
	});

	it("deletes the Seers compendium it replaces, once it's filled", async () => {
		const world = installWorld();
		await fillNpcPack(index);
		expect(world.oldSeers.deleteCompendium).toHaveBeenCalledOnce();
	});

	it("makes nothing, and deletes nothing, from an index with no NPCs", async () => {
		const world = installWorld();
		await expect(fillNpcPack({ seers: [], myths: [] })).resolves.toEqual({ seers: 0, cast: 0 });
		expect(world.createCompendium).not.toHaveBeenCalled();
		expect(world.oldSeers.deleteCompendium).not.toHaveBeenCalled();
	});
});

describe("seedNpcPack", () => {
	it("leaves a world that already has the compendium alone", async () => {
		const world = installWorld({ hasNpcPack: true });
		await expect(seedNpcPack()).resolves.toBe(true);
		expect(world.folders).toEqual([]);
	});
});
