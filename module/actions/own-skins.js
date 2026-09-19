/**
 * Skins made from a GM's own pictures, kept in their own folders under
 * OWN_SKIN_ROOT. That is in Data, outside any world, so a skin made in one
 * world is there to pick in every world on the server.
 */
import { loadJson } from "../book-art/art-index.js";
import { ensureDirectories, filePicker, uploadFile } from "../book-art/files.js";
import { ART_ROOT } from "../rules/book-art.js";
import { OWN_SKIN_MANIFEST, OWN_SKIN_ROOT, ownSkinManifest, ownSkinSlug, readOwnSkin, sortOwnSkins } from "../rules/realm-skins.js";

/** @returns {Promise<string[]>} Each own skin's folder, removed ones included. */
async function skinFolders() {
	try {
		const { dirs = [] } = await filePicker().browse("data", OWN_SKIN_ROOT);
		return dirs.map((dir) => dir.replace(/\/$/, ""));
	} catch {
		// Not made yet: no skin has been saved on this server.
		return [];
	}
}

/**
 * @param {string} folder
 * @returns {Promise<object|null>}
 */
const readManifest = (folder) => loadJson(`${folder}/${OWN_SKIN_MANIFEST}`);

/**
 * Every own skin on the server, by name.
 * @returns {Promise<import("../rules/realm-skins.js").OwnSkin[]>}
 */
export async function loadOwnSkins() {
	const folders = await skinFolders();
	const skins = await Promise.all(folders.map(async (folder) => readOwnSkin(await readManifest(folder), folder)));
	return sortOwnSkins(skins.filter(Boolean));
}

/** @param {string} path */
const extensionOf = (path) => {
	const file = String(path).split(/[?#]/)[0].split("/").at(-1) ?? "";
	const dot = file.lastIndexOf(".");
	return dot > 0 ? file.slice(dot + 1).toLowerCase() : "png";
};

/**
 * Put a picture into a skin's folder, named for the picture it is.
 * @param {string} folder
 * @param {string} picture Such as "terrain-forest".
 * @param {File|string} source A file from the GM's computer, or a path on the server.
 * @returns {Promise<string|null>} Its path, or null if it couldn't be saved.
 */
async function savePicture(folder, picture, source) {
	let blob = source;
	let from = source.name;
	if (typeof source === "string") {
		// Already in this skin's folder, from when it was saved before.
		if (source.startsWith(`${folder}/`)) return source;
		try {
			const response = await fetch(foundry.utils.getRoute(source));
			if (!response.ok) return null;
			blob = await response.blob();
			from = source;
		} catch (error) {
			console.error(error);
			return null;
		}
	}
	return uploadFile(folder, new File([blob], `${picture}.${extensionOf(from)}`, { type: blob.type }));
}

/**
 * @param {string} folder A skin's folder.
 * @param {object} data What its manifest says.
 * @returns {Promise<string|null>} The manifest's path, or null if it couldn't be written.
 */
const writeManifest = (folder, data) => uploadFile(folder, new File([JSON.stringify(data, null, "\t")], OWN_SKIN_MANIFEST, { type: "application/json" }));

/**
 * Save a skin: its pictures are copied into its own folder, so it keeps them
 * whatever becomes of where they came from.
 * @param {object} skin
 * @param {string} skin.name
 * @param {string} skin.base
 * @param {string} skin.terrainFit
 * @param {Record<string, File|string>} skin.pictures By picture name.
 * @param {string} [skin.folder] The folder of the skin being changed; a new skin gets its own.
 * @returns {Promise<{skin: import("../rules/realm-skins.js").OwnSkin|null, failed: number}>}
 */
export async function saveOwnSkin({ name, base, terrainFit, pictures, folder }) {
	if (!folder) {
		const taken = (await skinFolders()).map((dir) => dir.split("/").at(-1));
		folder = `${OWN_SKIN_ROOT}/${ownSkinSlug(name, taken)}`;
	}
	await ensureDirectories([ART_ROOT, OWN_SKIN_ROOT, folder]);

	const saved = await Promise.all(Object.entries(pictures).map(async ([picture, source]) => [picture, await savePicture(folder, picture, source)]));
	const files = Object.fromEntries(saved.filter(([, path]) => path));
	const failed = saved.length - Object.keys(files).length;

	const manifest = ownSkinManifest({ name, base, terrainFit, files });
	const written = await writeManifest(folder, manifest);
	return { skin: written ? readOwnSkin(manifest, folder) : null, failed };
}

/**
 * Take a skin off every world's list. Foundry can't delete files, so its
 * folder stays, and Realms already drawn with it keep their pictures.
 * @param {import("../rules/realm-skins.js").OwnSkin} skin
 * @returns {Promise<boolean>} Whether it was taken off.
 */
export async function removeOwnSkin(skin) {
	return Boolean(await writeManifest(skin.folder, { removed: true, name: skin.name }));
}
