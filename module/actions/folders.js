import { SYSTEM_ID } from "../system-id.js";

/** The colour of the Journal folders the system makes: the hexes', the Sites' and their entries'. */
export const JOURNAL_FOLDER_COLOR = "#5a5046";

/**
 * @param {string} type The documents it holds, such as "JournalEntry".
 * @param {string} key The flag that marks it.
 * @param {unknown} value What the flag holds.
 * @returns {Folder|null} The folder the flag marks, if there's one.
 */
export const findFlaggedFolder = (type, key, value) => game.folders?.find((folder) => folder.type === type && folder.getFlag(SYSTEM_ID, key) === value) ?? null;

/**
 * A folder found by one of the system's flags, so it's found again whatever
 * it's renamed to or moved under, and made the first time it's wanted.
 * @param {string} type The documents it holds, such as "JournalEntry".
 * @param {string} key The flag that marks it.
 * @param {unknown} value What the flag holds.
 * @param {object} data The rest of the folder made when there's none: its name, colour and so on.
 * @returns {Promise<Folder|null>} Null when it couldn't be made, so what goes in it goes at the top level instead.
 */
export async function flaggedFolder(type, key, value, data) {
	const existing = findFlaggedFolder(type, key, value);
	if (existing) return existing;
	try {
		return await foundry.utils.getDocumentClass("Folder").create({ ...data, type, flags: { [SYSTEM_ID]: { [key]: value } } });
	} catch (error) {
		console.warn(`${SYSTEM_ID} | Couldn't make the folder ${data.name}`, error);
		return null;
	}
}
