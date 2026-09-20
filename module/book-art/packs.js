/**
 * Empty a world compendium, creating it first if needed, then fill it folder by folder.
 * @param {{name: string, type: string, label: string, ownership?: object}} metadata
 *   `ownership` is set only when the compendium is created, so a GM's own choice stays.
 * @param {{name: string, documents: object[]}[]} folders
 */
export async function fillPack({ name, type, label, ownership }, folders) {
	const { CompendiumCollection } = foundry.documents.collections;
	let pack = game.packs.get(`world.${name}`);
	if (!pack) {
		pack = await CompendiumCollection.createCompendium({ name, label, type });
		if (ownership) await pack.configure({ ownership: { ...ownership } });
	}
	const operation = { pack: pack.collection };
	const documentClass = foundry.utils.getDocumentClass(type);
	const folderClass = foundry.utils.getDocumentClass("Folder");

	const index = await pack.getIndex();
	if (index.size) await documentClass.deleteDocuments(index.map((entry) => entry._id), operation);
	const oldFolders = pack.folders.map((folder) => folder.id);
	if (oldFolders.length) await folderClass.deleteDocuments(oldFolders, operation);

	const filled = folders.map((folder, index) => ({ ...folder, sort: (index + 1) * 100 })).filter((folder) => folder.documents.length);
	if (!filled.length) return;
	const created = await folderClass.createDocuments(filled.map((folder) => ({ name: folder.name, type, sort: folder.sort })), operation);
	await documentClass.createDocuments(filled.flatMap((folder, index) => folder.documents.map((data) => ({ ...data, folder: created[index].id }))), operation);
}
