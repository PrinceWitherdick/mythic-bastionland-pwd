import { chooseRulebookPdf, importBookArt } from "../book-art/importer.js";
import { openReader } from "./BookReader.js";
import { t } from "../chat/cards.js";
import { SYSTEM_ID } from "../system-id.js";
import { fetchRulebook, foundRulebook, hasRulebook, keepRulebook, setFoundRulebook } from "./store.js";

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

/** The import of a found book under way, which the Welcome and a load share rather than run twice. */
let importing = null;

/**
 * Import the book this world found kept by another, and settle what became of
 * it. Given up on, the world goes back to asking for the PDF, rather than
 * trying again on every load. An import that throws, as on a network hiccup,
 * is left pending, to be tried again next load. A second call while one runs
 * waits on that one.
 * @returns {Promise<object|null>} The art index, or null if nothing was read.
 */
export function importFoundRulebook() {
	importing ??= settleFoundRulebook().finally(() => {
		importing = null;
	});
	return importing;
}

/** @returns {Promise<object|null>} importFoundRulebook's import, run once. */
async function settleFoundRulebook() {
	const index = await importKeptRulebook();
	await setFoundRulebook(index ? "done" : "");
	return index;
}

/**
 * Import the book this world took up from another (findKeptRulebook), when
 * it is still pending, once world setup is done. Run on every load by the
 * active GM. A world the Welcome still greets leaves the import to it, where
 * the GM sees it happen. A failed import is logged, never thrown, so the
 * load carries on.
 * @param {() => boolean} isGreeted Whether the Welcome opens for this world.
 */
export async function adoptKeptRulebook(isGreeted) {
	if (!game.user?.isGM || !game.users.activeGM?.isSelf) return;
	if (!hasRulebook() || foundRulebook() !== "pending" || isGreeted()) return;
	ui.notifications.info(t("rulebook.adopted"));
	openReader()?.reload();
	try {
		await importFoundRulebook();
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't import the kept rulebook`, error);
	}
}
