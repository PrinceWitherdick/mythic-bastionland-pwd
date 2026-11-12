/**
 * What New Myth and New Knight share: a Journal entry made for something the
 * Referee writes, opened on its own sheet to be written, and deleted again if
 * it's closed with nothing written (OwnEntrySheet).
 */
import { SYSTEM_ID } from "../system-id.js";

/**
 * Make the entry and open it. Referees only, as each caller checks.
 * @param {object} made
 * @param {string} made.name         What it's called until it's named.
 * @param {Folder|null} made.folder  Where it's filed.
 * @param {string} made.sheetClass   The sheet it opens with, as Foundry names a registered one.
 * @param {string} made.flag         The flag it's kept under.
 * @param {object} made.data         What it holds, with nothing written.
 * @param {object} [made.ownership]  Who may see it, where that isn't Foundry's default.
 * @returns {Promise<JournalEntry|null>}
 */
export async function newOwnEntry({ name, folder, sheetClass, flag, data, ownership }) {
	const entry = await foundry.utils.getDocumentClass("JournalEntry").create({
		name,
		folder: folder?.id ?? null,
		...(ownership ? { ownership } : {}),
		flags: {
			core: { sheetClass },
			[SYSTEM_ID]: { [flag]: data }
		}
	});
	if (!entry) return null;
	entry.sheet.discardIfBlank = true;
	await entry.sheet.render({ force: true });
	return entry;
}
