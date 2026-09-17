import { afterEach, describe, expect, it, vi } from "vitest";
import { GOODS_FOLDERS_STEP, GOODS_PACKS, copyGoodsToWorld, seedGoodsFolders } from "../../module/book-art/goods-folders.js";
import { SYSTEM_ID } from "../../module/system-id.js";

/**
 * A world as the folder copier sees it, with both Arms & Goods compendiums filled.
 * @returns {object} The fakes, for inspecting what was created.
 */
function installWorld({ isGM = true, packs = true, worldFolders = [], worldDocuments = {} } = {}) {
	const user = { id: "gm", isGM };
	const folders = [...worldFolders];
	const created = { Item: [], Actor: [] };
	const setSetting = vi.fn();
	const info = vi.fn();
	let nextId = 0;
	const makeFolder = (data) => {
		const folder = { ...data, id: `f${nextId++}`, folder: data.folder ? { id: data.folder } : null };
		folders.push(folder);
		return folder;
	};

	const packFolder = (id, name, sort) => ({ id, name, sort, folder: null });
	const compendium = (type, packFolders, documents) => ({
		collection: `world.${type}`,
		folders: packFolders,
		getDocuments: vi.fn(async () => documents.map(([name, folderId]) => ({ name, type, folder: packFolders.find((folder) => folder.id === folderId) ?? null })))
	});
	const itemsPack = compendium("Item", [packFolder("pw", "bastionland.goods.folders.weapons", 100), packFolder("pa", "bastionland.goods.folders.armour", 200)], [["Sword", "pw"], ["Mail", "pa"]]);
	const actorsPack = compendium("Actor", [packFolder("pb", "bastionland.goods.folders.beasts", 100)], [["Horse", "pb"]]);

	const collection = (type) => ({
		filter: (test) => (worldDocuments[type] ?? []).filter(test),
		fromCompendium: (document, options) => ({ name: document.name, type: document.type, clearSort: options.clearSort })
	});
	const collections = { Item: collection("Item"), Actor: collection("Actor") };

	globalThis.game = {
		user,
		packs: new Map(packs ? [[`world.${GOODS_PACKS.items.name}`, itemsPack], [`world.${GOODS_PACKS.actors.name}`, actorsPack]] : []),
		folders,
		collections: { get: (type) => collections[type] },
		settings: { get: () => ({}), set: setSetting },
		i18n: { localize: (key) => key, format: (key) => key }
	};
	globalThis.ui = { notifications: { info } };
	globalThis.foundry = {
		utils: {
			getDocumentClass: (type) => type === "Folder"
				? { create: async (data) => makeFolder(data), createDocuments: async (data) => data.map(makeFolder) }
				: { createDocuments: async (data) => created[type].push(...data) }
		}
	};
	return { folders, created, setSetting, info, itemsPack };
}

afterEach(() => {
	for (const key of ["game", "ui", "foundry"]) delete globalThis[key];
});

describe("copyGoodsToWorld", () => {
	it("copies each compendium into a tinted folder with a subfolder per kind", async () => {
		const { folders, created, setSetting } = installWorld();
		await expect(copyGoodsToWorld()).resolves.toEqual({ items: 2, actors: 1 });

		const root = folders.find((folder) => folder.type === "Item" && !folder.folder);
		expect(root).toMatchObject({ name: "bastionland.goods.itemsPack", color: GOODS_PACKS.items.color });
		const weapons = folders.find((folder) => folder.name === "bastionland.goods.folders.weapons");
		expect(weapons).toMatchObject({ type: "Item", folder: { id: root.id }, sort: 100, color: GOODS_PACKS.items.color });
		expect(created.Item).toContainEqual({ name: "Sword", type: "Item", clearSort: false, folder: weapons.id });
		expect(created.Actor).toEqual([expect.objectContaining({ name: "Horse" })]);
		expect(folders.find((folder) => folder.type === "Actor" && !folder.folder).name).toBe("bastionland.goods.actorsPack");
		expect(setSetting).toHaveBeenCalledWith(SYSTEM_ID, "worldSetupDone", { [GOODS_FOLDERS_STEP]: true });
	});

	it("reuses the world's folders and leaves what's already in them alone", async () => {
		const root = { id: "root", type: "Item", name: "bastionland.goods.itemsPack", folder: null };
		const weapons = { id: "weapons", type: "Item", name: "bastionland.goods.folders.weapons", folder: { id: "root" } };
		const { folders, created } = installWorld({
			worldFolders: [root, weapons],
			worldDocuments: { Item: [{ name: "Sword", folder: weapons }, { name: "Mail", folder: null }] }
		});

		await expect(copyGoodsToWorld()).resolves.toEqual({ items: 1, actors: 1 });
		expect(created.Item.map((item) => item.name)).toEqual(["Mail"]);
		expect(folders.filter((folder) => folder.name === "bastionland.goods.folders.weapons")).toHaveLength(1);
	});

	it("does nothing for players", async () => {
		const { created, setSetting, itemsPack } = installWorld({ isGM: false });
		await expect(copyGoodsToWorld()).resolves.toEqual({ items: 0, actors: 0 });
		expect(itemsPack.getDocuments).not.toHaveBeenCalled();
		expect(created.Item).toHaveLength(0);
		expect(setSetting).not.toHaveBeenCalled();
	});
});

describe("seedGoodsFolders", () => {
	it("copies the compendiums and says what it added", async () => {
		const { created, info } = installWorld();
		await expect(seedGoodsFolders()).resolves.toBe(true);
		expect(created.Item).toHaveLength(2);
		expect(info).toHaveBeenCalledWith("bastionland.goods.foldersSeeded");
	});

	it("waits for the compendiums", async () => {
		const { created, setSetting } = installWorld({ packs: false });
		await expect(seedGoodsFolders()).resolves.toBe(false);
		expect(created.Item).toHaveLength(0);
		expect(setSetting).not.toHaveBeenCalled();
	});
});
