/**
 * Saving into Foundry's Data folder through the FilePicker, the same way a GM
 * uploads a file by hand.
 */

const filePicker = () => foundry.applications.apps.FilePicker.implementation;

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
