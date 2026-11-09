import { loadArtIndex } from "../book-art/art-index.js";
import { chooseRulebookPdf, importBookArt } from "../book-art/importer.js";
import { openReader } from "./BookReader.js";
import { t } from "../chat/cards.js";
import { serverNow } from "../actions/time-capture.js";
import { INDEX_VERSION } from "../rules/book-art.js";
import { SYSTEM_ID } from "../system-id.js";
import {
	fetchKeptRulebook,
	fetchRulebook,
	foundRulebook,
	hasRulebook,
	importedVersion,
	keepRulebook,
	missingRulebook,
	rereadingBy,
	rulebookPath,
	setFoundRulebook,
	setMissingRulebook,
	setRereadingBy
} from "./store.js";

/** How long a re-read is taken to be under way on another client, past which it's taken for one that died. */
const REREAD_STALE_MS = 15 * 60 * 1000;

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
 * @param {object} [options] As importBookArt's.
 * @returns {Promise<object|null>} The art index, or null if there was nothing to read.
 */
export async function importKeptRulebook(options) {
	const file = await fetchRulebook();
	return file ? importBookArt(file, options) : null;
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
 * @returns {Promise<boolean>} Whether it tried the import, so rereadOldImport needn't this load.
 */
export async function adoptKeptRulebook(isGreeted) {
	if (!game.user?.isGM || !game.users.activeGM?.isSelf) return false;
	if (!hasRulebook() || foundRulebook() !== "pending" || isGreeted()) return false;
	ui.notifications.info(t("rulebook.adopted"));
	openReader()?.reload();
	try {
		await importFoundRulebook();
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't import the kept rulebook`, error);
	}
	return true;
}

/**
 * Read the book again for a world whose last import came from an older Import
 * PDF, so what a newer one reads better, such as a Seer's text, reaches the
 * world without the Referee having to run it. Each world reads it for itself,
 * as its compendiums are its own. Only a world that has imported before: one
 * with a book, and the index an import wrote. Run on every load by the active
 * GM, after adoptKeptRulebook. A world the Welcome still greets, or whose found
 * book is still pending, is left to those. A failed import is logged, never
 * thrown, and tried again next load. One Referee reads it at a time, even as
 * another becomes the active GM. A kept book gone from the server is said
 * once, and not looked for again until the world keeps one anew.
 * @param {() => boolean} isGreeted Whether the Welcome opens for this world.
 */
export async function rereadOldImport(isGreeted) {
	if (!game.user?.isGM || !game.users.activeGM?.isSelf) return;
	if (!hasRulebook() || foundRulebook() === "pending" || isGreeted()) return;
	if (importedVersion() >= INDEX_VERSION || missingRulebook() === rulebookPath() || !(await loadArtIndex())) return;
	if (!(await takeReread())) return;
	try {
		const { file, missing } = await fetchKeptRulebook();
		if (!file) {
			if (!missing) return;
			await setMissingRulebook(rulebookPath());
			ui.notifications.warn(t("rulebook.rereadMissing"));
			return;
		}
		ui.notifications.info(t("rulebook.reread"));
		await importBookArt(file, { again: true });
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't read the rulebook again`, error);
	} finally {
		await letGoOfReread();
	}
}

/**
 * Mark the world as being read again by this Referee, unless another is at it.
 * @returns {Promise<boolean>} Whether this Referee may read it.
 */
async function takeReread() {
	const { user, at } = rereadingBy();
	if (user && user !== game.user.id && serverNow() - (Number(at) || 0) < REREAD_STALE_MS) return false;
	await setRereadingBy({ user: game.user.id, at: serverNow() });
	return true;
}

/** Clear this Referee's mark, once their re-read is over. */
async function letGoOfReread() {
	try {
		if (rereadingBy().user === game.user.id) await setRereadingBy({});
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't clear the rulebook's re-read mark`, error);
	}
}
