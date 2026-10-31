/**
 * Saving into Foundry's Data folder through the FilePicker, the same way a GM
 * uploads a file by hand.
 */

/** @returns {typeof FilePicker} The FilePicker class in use, which a module may have replaced. */
export const filePicker = () => foundry.applications.apps.FilePicker.implementation;

/**
 * Whether this user may browse files for a picture. Foundry's FilePicker
 * quietly stays shut without the Browse File Explorer permission, which plain
 * Players lack unless the Referee grants it, so buttons that open it are hidden.
 * @returns {boolean}
 */
export const canBrowseFiles = () => Boolean(globalThis.game?.user?.can("FILES_BROWSE"));

/**
 * Let the user choose a picture for one of a document's fields, starting at
 * the one it holds now. A user who may not browse files is told so, rather
 * than nothing happening.
 * @param {foundry.abstract.Document} document
 * @param {string} [field] The path the chosen picture is written to.
 * @param {string} [type] A FilePicker type, such as "image" for a picture that can't be a video.
 * @param {object} [also] Anything else written with the picture.
 * @returns {Promise<Application>|null} Null where the picker can't open.
 */
export function pickImageInto(document, field = "img", type = "imagevideo", also = {}) {
	if (!canBrowseFiles()) {
		ui.notifications.warn("bastionland.portrait.cantBrowse", { localize: true });
		return null;
	}
	const picker = new (filePicker())({
		type,
		current: foundry.utils.getProperty(document, field),
		callback: (path) => document.update({ [field]: path, ...also })
	});
	return picker.render({ force: true });
}

/**
 * Create folders in order, parents first. Foundry throws when a folder is
 * already there, which is the usual case after the first import, so errors
 * are ignored: a folder that really couldn't be made shows up as failed
 * uploads.
 * @param {string[]} dirs Paths under Data.
 */
export async function ensureDirectories(dirs) {
	for (const dir of dirs) {
		try {
			await filePicker().createDirectory("data", dir, {});
		} catch {
			// Already there, or the uploads into it will fail and say so.
		}
	}
}

/**
 * @param {string} dir Folder under Data.
 * @param {File} file
 * @returns {Promise<string|null>} The path the server saved the file at, or null if it refused.
 */
export async function uploadFile(dir, file) {
	try {
		const result = await filePicker().upload("data", dir, file, {}, { notify: false });
		return result?.path ?? null;
	} catch (error) {
		console.error(error);
		return null;
	}
}
