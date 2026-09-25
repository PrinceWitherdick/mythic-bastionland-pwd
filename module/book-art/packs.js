/**
 * @typedef {object} PackFolder
 * @property {string} name
 * @property {object[]} documents
 * @property {number} [sort] Its place among its siblings, else the order given.
 * @property {PackFolder[]} [folders] Folders inside it.
 */

/**
 * @param {PackFolder} folder
 * @returns {boolean} Whether it holds anything, however deep.
 */
const holdsDocuments = (folder) => folder.documents.length > 0 || (folder.folders ?? []).some(holdsDocuments);

/**
 * @param {PackFolder[]} folders
 * @returns {PackFolder[]} Those holding anything, each given its place.
 */
const placed = (folders) => folders
	.map((folder, index) => ({ ...folder, sort: folder.sort ?? (index + 1) * 100 }))
	.filter(holdsDocuments);

/**
 * Empty a world compendium, creating it first if needed, then fill it folder by folder.
 * @param {{name: string, type: string, label: string, ownership?: object}} metadata
 *   `ownership` is set only when the compendium is created, so a GM's own choice stays.
 * @param {PackFolder[]} folders
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

	// A level at a time, since a folder inside another needs its parent's id.
	const documents = [];
	let level = placed(folders).map((folder) => ({ folder, parent: null }));
	while (level.length) {
		const created = await folderClass.createDocuments(level.map(({ folder, parent }) => ({ name: folder.name, type, sort: folder.sort, folder: parent })), operation);
		level = level.flatMap(({ folder }, index) => {
			const id = created[index].id;
			documents.push(...folder.documents.map((data) => ({ ...data, folder: id })));
			return placed(folder.folders ?? []).map((child) => ({ folder: child, parent: id }));
		});
	}
	if (documents.length) await documentClass.createDocuments(documents, operation);
}
