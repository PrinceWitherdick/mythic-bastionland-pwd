import { knightVerseFromItems, mythTableFromItems, mythVerseFromItems, promptsFromItems } from "../rules/book-art.js";
import { routed } from "../rules/rulebook.js";
import { rulebookPath } from "../rulebook/store.js";
import { SYSTEM_ID } from "../system-id.js";
import { openPdfUrl, withPage } from "./pdf.js";

/**
 * The table on a Myth's or Knight's page, the verse under their name and the
 * prompts along its foot, read straight from the rulebook the world keeps for its reader, for
 * an index Import PDF wrote before it read them. Each page is read once a
 * session; nothing is written back.
 */

/**
 * @typedef {object} PageRead
 * @property {import("../rules/book-art.js").MythTable|null} table
 * @property {string[]|null} verse
 * @property {{label: string, value: string}[]|null} prompts
 */

/** @type {{path: string, document: Promise<object>}|null} The rulebook opened last. */
let opened = null;

/** @type {Map<string, Promise<PageRead|null>>} By book and page. */
const reads = new Map();

/** @type {Map<string, PageRead|null>} The reads that have finished, by book and page. */
const settled = new Map();

/**
 * @param {number} page
 * @returns {string|null} Where a page's table is kept, or null without a rulebook or a page.
 */
function tableKey(page) {
	const path = rulebookPath();
	return path && Number.isInteger(page) ? `${path}#${page}` : null;
}

/**
 * @param {string} path
 * @returns {Promise<object>} The rulebook, opened once until the world points at another.
 */
function openBook(path) {
	if (opened?.path !== path) {
		opened?.document.then((pdf) => pdf.destroy()).catch(() => {});
		opened = { path, document: openPdfUrl(routed(path)) };
		opened.document.catch(() => {
			if (opened?.path === path) opened = null;
		});
	}
	return opened.document;
}

/**
 * @param {number} page A Myth's or Knight's page.
 * @returns {Promise<PageRead|null>} Null without a rulebook, or when the page can't be read.
 */
function readPage(page) {
	const key = tableKey(page);
	if (!key) return Promise.resolve(null);
	if (!reads.has(key)) {
		reads.set(key, (async () => {
			let read = null;
			try {
				const pdf = await openBook(rulebookPath());
				const items = await withPage(pdf, page, async (read) => (await read.getTextContent()).items);
				// A Myth's verse is found by its Omens and a Knight's by their Property, so neither reads the other's.
				read = { table: mythTableFromItems(items), verse: mythVerseFromItems(items) ?? knightVerseFromItems(items), prompts: promptsFromItems(items) };
			} catch (error) {
				// Kept as unread, so the sheet doesn't try again on every redraw.
				console.warn(`${SYSTEM_ID} | Couldn't read page ${page} of the rulebook`, error);
			}
			settled.set(key, read);
			return read;
		})());
	}
	return reads.get(key);
}

/**
 * What a finished read of a page found, for a render that can't wait on it.
 * @param {number} page
 * @param {keyof PageRead} part
 * @returns {object|null|undefined} Undefined until a read has finished, which
 *   includes one not yet asked for; null when the page had none.
 */
function peek(page, part) {
	const key = tableKey(page);
	const read = key ? settled.get(key) : undefined;
	return read === undefined ? undefined : read?.[part] ?? null;
}

/**
 * The table read from the rulebook for a page, for a render that can't wait on it.
 * @param {number} page
 * @returns {import("../rules/book-art.js").MythTable|null|undefined} Undefined until a read has
 *   finished, which includes one not yet asked for; null when the page had none.
 */
export const peekTable = (page) => peek(page, "table");

/**
 * The verse read from the rulebook for a Myth's or Knight's page, for a render that can't wait on it.
 * @param {number} page
 * @returns {string[]|null|undefined} As peekTable.
 */
export const peekVerse = (page) => peek(page, "verse");

/**
 * One part of an index entry's page: the index's own, or else the one read
 * from the rulebook, for an index Import PDF wrote before it read that part.
 * @param {keyof PageRead} part
 * @param {object|null} index The art index.
 * @param {{page?: number}|null} entry The Myth's or Knight's entry in it.
 * @param {object} [options]
 * @param {number} [options.page]         The page to read, when there's no entry to give it.
 * @param {number} [options.versionFloor] An index at this version or later had that part read
 *   already, so a page without it has none. Without it the rulebook is read whatever the version.
 * @returns {Promise<unknown|null>} Null without a rulebook, or when the page can't be read.
 */
function partForEntry(part, index, entry, { page = entry?.page, versionFloor = Infinity } = {}) {
	if (entry?.[part]) return Promise.resolve(entry[part]);
	if ((index?.version ?? 0) >= versionFloor) return Promise.resolve(null);
	return readPage(page).then((read) => read?.[part] ?? null);
}

/**
 * The table on an index entry's page, as partForEntry.
 * @returns {Promise<import("../rules/book-art.js").MythTable|null>}
 */
export const tableForEntry = (index, entry, options) => partForEntry("table", index, entry, options);

/**
 * The verse under a Myth's or Knight's name, as partForEntry.
 * @returns {Promise<string[]|null>}
 */
export const verseForEntry = (index, entry, options) => partForEntry("verse", index, entry, options);

/**
 * The verse under a Myth's or Knight's name, for a render that can't wait on
 * it: as verseForEntry, but what's been read so far. The rulebook is read once,
 * however often the page is drawn meanwhile, and onRead is called when it has been.
 * @param {object|null} index As verseForEntry.
 * @param {{verse?: string[], page?: number}|null} entry As verseForEntry.
 * @param {object} options As verseForEntry's.
 * @param {(verse: string[]|null) => void} onRead
 * @returns {string[]|null} One entry a line, or null while it's read or where there's none.
 */
export function peekVerseForEntry(index, entry, { page = entry?.page, versionFloor = Infinity }, onRead) {
	if (entry?.verse) return entry.verse;
	if (!page || (index?.version ?? 0) >= versionFloor) return null;
	const read = peekVerse(page);
	if (read === undefined && canReadTablesFromRulebook()) verseForEntry(index, entry, { page }).then(onRead);
	return read ?? null;
}

/**
 * The prompts along the foot of a Myth's page, as partForEntry.
 * @returns {Promise<{label: string, value: string}[]|null>}
 */
export const promptsForEntry = (index, entry, options) => partForEntry("prompts", index, entry, options);

/** @returns {boolean} Whether there's a rulebook to read a table from. */
export const canReadTablesFromRulebook = () => Boolean(rulebookPath());
