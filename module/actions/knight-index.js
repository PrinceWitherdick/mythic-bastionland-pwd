/**
 * The Knights and Seers to choose from: the book's, from the art index, and
 * the ones the Referee wrote that this user may see. Kept apart from
 * art-index.js, which own-knights.js mustn't import, and asked for only where
 * a Knight or Seer is looked up to be chosen or filled in, never where the
 * art index is written back or read for the book alone.
 */
import { loadArtIndex } from "../book-art/art-index.js";
import { withOwnKnights } from "../rules/own-knights.js";
import { ownKnightIndexEntries } from "./own-knights.js";

/**
 * @param {object|null} [index] The art index, when it's been loaded already.
 * @returns {Promise<object>} The art index with the written Knights and Seers after the book's.
 *   Without an import, there are only the written ones.
 */
export async function knightIndex(index) {
	return withOwnKnights(index === undefined ? await loadArtIndex() : index, ownKnightIndexEntries());
}
