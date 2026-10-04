import { t } from "../chat/cards.js";
import { ART_ROOT, INDEX_FILE } from "../rules/book-art.js";
import { BOOK_PRINTS, bookTextPages, findBookText, withBookText } from "../rules/book-text.js";
import { routed } from "../rules/rulebook.js";
import { rulebookPath } from "../rulebook/store.js";
import { SYSTEM_ID } from "../system-id.js";
import { ART_INDEX_HOOK, loadArtIndex } from "./art-index.js";
import { uploadFile } from "./files.js";
import { openPdfUrl, withPage } from "./pdf.js";

/**
 * The book's words for the rules text the system shows, laid over the
 * language file under the keys that show them; see module/rules/book-text.js.
 * Every client lays them from the art index as the world loads, and again
 * whenever Import PDF writes a new one. Before then each key shows its
 * fallback, which is laid as soon as the language file is loaded, so no
 * window ever shows a bare key.
 */

/** Called on a client once it has laid the book's words, for windows showing them. */
export const BOOK_TEXT_HOOK = `${SYSTEM_ID}.bookTextChanged`;

/** @type {Record<string, string>} The words read, by key. */
let read = {};

/** @type {Promise<object|null>|null} The index read as the world set up. */
let loading = null;

/**
 * Lay the words over every language tree a key is looked up in.
 * @param {Record<string, string>|undefined} texts
 */
function lay(texts) {
	read = texts && typeof texts === "object" ? texts : {};
	const i18n = globalThis.game?.i18n;
	for (const tree of [i18n?.translations, i18n?._fallback]) {
		if (tree && typeof tree === "object") withBookText(tree, read);
	}
}

/**
 * @param {string} [prefix] Only keys starting with this, such as "travelRules.".
 * @returns {boolean} Whether any of the book's words were read.
 */
export const bookTextRead = (prefix = "") => Object.keys(read).some((key) => key.startsWith(prefix));

/**
 * Find the rules text in an open PDF.
 * @param {object} pdf A pdf.js document.
 * @returns {Promise<{texts: Record<string, string>, missing: string[]}>}
 */
export async function readBookText(pdf) {
	const items = new Map();
	for (const number of bookTextPages()) {
		if (number > pdf.numPages) continue;
		try {
			items.set(number, await withPage(pdf, number, async (page) => (await page.getTextContent()).items));
		} catch (error) {
			console.error(`${SYSTEM_ID} | Couldn't read page ${number}`, error);
		}
	}
	return findBookText((number) => items.get(number));
}

/**
 * Lay the words from the art index as it stands.
 * @returns {Promise<object|null>} The index, or null when it couldn't be read.
 */
function refresh() {
	return loadArtIndex().then((index) => {
		lay(index?.bookText);
		Hooks.callAll(BOOK_TEXT_HOOK);
		return index;
	}).catch((error) => {
		console.error(`${SYSTEM_ID} | Couldn't lay the rules text`, error);
		return null;
	});
}

/**
 * A world imported before the rules text was read has its words found in the
 * rulebook it keeps for its reader, once, by the active GM, and written into
 * its index, rather than asking for the PDF again.
 * @param {object|null} index
 */
async function catchUp(index) {
	if (!index || index.bookText || !rulebookPath()) return;
	if (game.user !== game.users.activeGM || !game.user.can("FILES_UPLOAD")) return;
	let pdf;
	try {
		pdf = await openPdfUrl(routed(rulebookPath()));
		const { texts } = await readBookText(pdf);
		if (!Object.keys(texts).length) return;
		const file = new File([JSON.stringify({ ...index, bookText: texts }, null, "\t")], INDEX_FILE, { type: "application/json" });
		if (!(await uploadFile(ART_ROOT, file))) return;
		lay(texts);
		Hooks.callAll(ART_INDEX_HOOK);
		ui.notifications.info(t("bookArt.bookTextUpdated"));
	} catch (error) {
		console.warn(`${SYSTEM_ID} | Couldn't read the rules text from the rulebook`, error);
	} finally {
		pdf?.destroy();
	}
}

/**
 * Lay each key's fallback as soon as the language file is loaded, and the
 * book's words again whenever Import PDF writes a new index. Called during init.
 */
export function registerBookText() {
	Hooks.once("i18nInit", () => lay({}));
	Hooks.on(ART_INDEX_HOOK, () => refresh());
}

/** Lay the book's words from the art index. Called during setup, so they're there before any window draws. */
export function loadBookText() {
	loading = refresh();
	return loading;
}

/** Once the world is ready, catch up a world imported before the rules text was read. */
export async function catchUpBookText() {
	await catchUp(await (loading ?? loadBookText()));
}

/** How many passages the system knows how to find. */
export const BOOK_TEXT_TOTAL = Object.keys(BOOK_PRINTS).length;
