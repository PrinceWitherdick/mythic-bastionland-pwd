import { t } from "../chat/cards.js";
import { GOODS_ACTOR_KINDS, GOODS_ITEM_KINDS } from "../rules/arms-and-goods.js";
import { SYSTEM_ID } from "../system-id.js";
import { markSetupDone } from "../world-setup.js";

/** The world compendiums filled from Arms & Goods, by what they hold, and the tint of their world folders. */
export const GOODS_PACKS = Object.freeze({
	items: Object.freeze({ name: "bastionland-arms-and-goods", type: "Item", kinds: GOODS_ITEM_KINDS, label: "goods.itemsPack", color: "#8a6d3b" }),
	actors: Object.freeze({ name: "bastionland-beasts-and-hirelings", type: "Actor", kinds: GOODS_ACTOR_KINDS, label: "goods.actorsPack", color: "#5f7a4f" })
});

/** The world setup step that gives a world its folders of Arms & Goods. */
export const GOODS_FOLDERS_STEP = "goodsFolders";

/**
 * A world setup step: give the world its folders of Arms & Goods on the first
 * load after the compendiums have been filled. A GM who deletes the folders
 * keeps them deleted, until Import Book Art is run again.
 * @returns {Promise<boolean>} False while there are no compendiums to copy yet.
 */
export async function seedGoodsFolders() {
	if (!Object.values(GOODS_PACKS).some(({ name }) => game.packs.get(`world.${name}`))) return false;
	const { items, actors } = await copyGoodsToWorld();
	if (items || actors) ui.notifications.info(t("goods.foldersSeeded", { items, actors }));
	return true;
}

/**
 * Copy both Arms & Goods compendiums into the Items and Actors directories,
 * under a folder named for each compendium with a subfolder per kind, as in
 * the compendium. Anything already there by name is left as it is, so a GM's
 * edits survive and running it again only adds what's missing. GMs only.
 * @returns {Promise<{items: number, actors: number}>} How many documents were added.
 */
export async function copyGoodsToWorld() {
	const counts = { items: 0, actors: 0 };
	if (!game.user.isGM) return counts;

	for (const [group, { name, type, label, color }] of Object.entries(GOODS_PACKS)) {
		const pack = game.packs.get(`world.${name}`);
		if (!pack) continue;
		try {
			counts[group] = await copyPack(pack, { type, name: t(label), color });
		} catch (error) {
			console.error(`${SYSTEM_ID} | Couldn't copy ${pack.collection} into the world`, error);
		}
	}
	await markSetupDone(GOODS_FOLDERS_STEP);
	return counts;
}

/**
 * @param {object} pack
 * @param {{type: string, name: string, color: string}} root The world folder to copy into.
 * @returns {Promise<number>} How many documents were added.
 */
async function copyPack(pack, { type, name, color }) {
	const documents = await pack.getDocuments();
	if (!documents.length) return 0;

	const rootId = findFolder(type, name, null)?.id
		?? (await foundry.utils.getDocumentClass("Folder").create({ type, name, color, folder: null, sort: 0 })).id;

	// A world folder for each of the compendium's top folders, the missing ones made together.
	const kinds = [...pack.folders].filter((folder) => !folder.folder);
	const missing = kinds.filter((folder) => !findFolder(type, folder.name, rootId));
	if (missing.length) {
		await foundry.utils.getDocumentClass("Folder").createDocuments(missing.map((folder) => ({ type, name: folder.name, color, folder: rootId, sort: folder.sort })));
	}
	const worldFolderIds = new Map(kinds.map((folder) => [folder.id, findFolder(type, folder.name, rootId)?.id ?? rootId]));

	const collection = game.collections.get(type);
	const present = new Set(collection.filter((document) => document.folder).map((document) => `${document.folder.id}.${document.name}`));
	const data = [];
	for (const document of documents) {
		const folder = worldFolderIds.get(document.folder?.id) ?? rootId;
		if (present.has(`${folder}.${document.name}`)) continue;
		data.push({ ...collection.fromCompendium(document, { clearSort: false }), folder });
	}
	if (!data.length) return 0;

	await foundry.utils.getDocumentClass(type).createDocuments(data);
	return data.length;
}

/**
 * @param {string} type
 * @param {string} name
 * @param {string|null} parentId
 * @returns {Folder|undefined} The world folder by that type, name and parent.
 */
function findFolder(type, name, parentId) {
	return game.folders.find((folder) => folder.type === type && folder.name === name && (folder.folder?.id ?? null) === parentId);
}
