import { mythTableFromItems } from "../rules/book-art.js";
import { routed } from "../rules/rulebook.js";
import { rulebookPath } from "../rulebook/store.js";
import { SYSTEM_ID } from "../system-id.js";
import { openPdfUrl } from "./pdf.js";

/**
 * The table on a Myth's page, read straight from the rulebook the world keeps
 * for its reader, for an index Import PDF wrote before it read the tables.
 * Each page is read once a session; nothing is written back.
 */

/** @type {{path: string, document: Promise<object>}|null} The rulebook opened last. */
let opened = null;

/** @type {Map<string, Promise<import("../rules/book-art.js").MythTable|null>>} By book and page. */
const tables = new Map();

/** @type {Map<string, import("../rules/book-art.js").MythTable|null>} The reads that have finished, by book and page. */
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
 * @param {number} page A Myth's page.
 * @returns {Promise<import("../rules/book-art.js").MythTable|null>} Null without a rulebook, or when the page can't be read.
 */
export function mythTableFromRulebook(page) {
	const key = tableKey(page);
	if (!key) return Promise.resolve(null);
	if (!tables.has(key)) {
		tables.set(key, (async () => {
			let table = null;
			try {
				const pdf = await openBook(rulebookPath());
				const items = (await (await pdf.getPage(page)).getTextContent()).items;
				table = mythTableFromItems(items);
			} catch (error) {
				// Kept as unread, so the sheet doesn't try again on every redraw.
				console.warn(`${SYSTEM_ID} | Couldn't read the table on page ${page} of the rulebook`, error);
			}
			settled.set(key, table);
			return table;
		})());
	}
	return tables.get(key);
}

/**
 * The table read from the rulebook for a page, for a render that can't wait on it.
 * @param {number} page
 * @returns {import("../rules/book-art.js").MythTable|null|undefined} Undefined until a read has
 *   finished, which includes one not yet asked for; null when the page had none.
 */
export function peekTable(page) {
	const key = tableKey(page);
	return key ? settled.get(key) : undefined;
}

/**
 * The table on an index entry's page: the index's own, or else the one read
 * from the rulebook, for an index Import PDF wrote before it read tables.
 * @param {object|null} index The art index.
 * @param {{table?: object, page?: number}|null} entry The Myth's or Knight's entry in it.
 * @param {object} [options]
 * @param {number} [options.page]         The page to read, when there's no entry to give it.
 * @param {number} [options.versionFloor] An index at this version or later had its tables read
 *   already, so a page without one has none. Without it the rulebook is read whatever the version.
 * @returns {Promise<import("../rules/book-art.js").MythTable|null>}
 */
export function tableForEntry(index, entry, { page = entry?.page, versionFloor = Infinity } = {}) {
	if (entry?.table) return Promise.resolve(entry.table);
	if ((index?.version ?? 0) >= versionFloor) return Promise.resolve(null);
	return mythTableFromRulebook(page);
}

/** @returns {boolean} Whether there's a rulebook to read a table from. */
export const canReadTablesFromRulebook = () => Boolean(rulebookPath());
