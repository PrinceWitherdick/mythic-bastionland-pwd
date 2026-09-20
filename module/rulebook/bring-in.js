import { chooseRulebookPdf, importBookArt } from "../book-art/importer.js";
import { openReader } from "./BookReader.js";
import { fetchRulebook, keepRulebook } from "./store.js";

/**
 * The one gesture behind every way a GM hands the system their PDF: the Welcome,
 * its chat card, Import PDF on the hotbar and the Rulebook button in the Journal
 * tab. A book brought in is both kept to read in Foundry and read for its art
 * and tables, so no way in leaves half the job undone.
 * @param {File} [given] The PDF, when the caller already has it. Without one the GM is asked for it.
 * @returns {Promise<object|null>} The art index, or null if nothing was brought in.
 */
export async function bringInRulebook(given) {
	// The copy goes first, as the import ends on a report the GM has to close.
	const file = given instanceof File ? given : await chooseRulebookPdf();
	if (!file) return null;
	if (await keepRulebook(file)) openReader()?.reload();
	return importBookArt(file);
}

/**
 * Read the art and tables from a book already kept on the server: one this
 * world found another had kept, or one a GM pointed the reader at. It is
 * fetched back rather than copied in again.
 * @returns {Promise<object|null>} The art index, or null if there was nothing to read.
 */
export async function importKeptRulebook() {
	const file = await fetchRulebook();
	return file ? importBookArt(file) : null;
}
