import { loadArtIndex } from "../book-art/art-index.js";
import { statLabels } from "../chat/cards.js";
import { seerAutoFill } from "../rules/creation.js";

/**
 * Quietly fill in a Knight's Seer from Import PDF's index, as seerAutoFill
 * allows, so every Knight's Seer page carries its picture and what the book
 * says without anyone asking. Does nothing before Import PDF.
 * @param {Actor} knight
 * @returns {Promise<boolean>} Whether anything was filled in.
 */
export async function fillSeerFromBook(knight) {
	if (!knight?.isOwner || knight.system.isSquire) return false;
	const index = await loadArtIndex();
	const update = seerAutoFill(index, knight.system, statLabels());
	if (foundry.utils.isEmpty(update)) return false;
	await knight.update(update);
	return true;
}
