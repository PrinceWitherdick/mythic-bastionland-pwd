/**
 * Myths the Referee writes for themselves, to stand among a Realm's six in
 * place of one from the book's table (p27). One is kept on a Journal entry of
 * its own, so it can be used in any Realm, and lent from Realm to Realm or
 * world to world. It has what a Myth's page has: a verse under its name, six
 * Omens, a picture, and a table and a word on its Cast if the Referee wants them.
 *
 * A Myth of the Realm that is one of these carries the entry's id as `own`,
 * in place of its roll. Pure, so it can be tested without Foundry.
 */
import { isOwnMyth } from "./book-art.js";
import { OMEN_COUNT } from "./realm.js";

export { isOwnMyth };

export const OWN_MYTH_VERSION = 1;

/** Lines in the verse under the name, as the book sets two. */
export const VERSE_LINES = 2;

/** Rows in a Myth's table, one for each face of the d6. */
export const TABLE_ROWS = 6;

/** Columns in a Myth's table, each rolled on its own d6. */
export const TABLE_COLUMNS = 2;

/** Put before the entry's id where a Myth's roll would go, so a written Myth is never taken for a rolled one. */
const OWN_KEY = "own:";

/**
 * @typedef {object} OwnMyth
 * @property {number} version
 * @property {string[]} verse  VERSE_LINES lines, any of them blank.
 * @property {string[]} omens  OMEN_COUNT Omens in order, any of them blank.
 * @property {string} img      The picture's path, or "".
 * @property {{name: string, columns: string[], rows: string[][]}} table
 *   Always TABLE_ROWS rows of TABLE_COLUMNS entries, any of them blank.
 * @property {string} castNote
 */

/**
 * @param {unknown} value
 * @returns {string} Trimmed text, or "" for anything that isn't text.
 */
const textOf = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * Lines from an array or from a form's numbered fields, which arrive as
 * `{0: …, 1: …}`, always `count` of them.
 * @param {unknown} value
 * @param {number} count
 * @param {(item: unknown) => T} read
 * @returns {T[]}
 * @template T
 */
function listOf(value, count, read) {
	const source = value && typeof value === "object" ? value : {};
	return Array.from({ length: count }, (_, index) => read(source[index]));
}

/** @returns {OwnMyth} A Myth with nothing written yet. */
export const emptyOwnMyth = () => normaliseOwnMyth(null);

/**
 * A written Myth from whatever an entry's flag or a form holds, however old or bad.
 * @param {unknown} raw
 * @returns {OwnMyth}
 */
export function normaliseOwnMyth(raw) {
	const data = raw && typeof raw === "object" ? raw : {};
	const table = data.table && typeof data.table === "object" ? data.table : {};
	return {
		version: OWN_MYTH_VERSION,
		verse: listOf(data.verse, VERSE_LINES, textOf),
		omens: listOf(data.omens, OMEN_COUNT, textOf),
		img: textOf(data.img),
		table: {
			name: textOf(table.name),
			columns: listOf(table.columns, TABLE_COLUMNS, textOf),
			rows: listOf(table.rows, TABLE_ROWS, (row) => listOf(row, TABLE_COLUMNS, textOf))
		},
		castNote: textOf(data.castNote)
	};
}

/**
 * @param {OwnMyth} myth
 * @returns {boolean} Whether anything of the table is written.
 */
export const tableWritten = (myth) => Boolean(myth.table.name || myth.table.columns.some(Boolean) || myth.table.rows.some((row) => row.some(Boolean)));

/**
 * @param {OwnMyth} myth
 * @returns {boolean} Whether nothing at all is written or chosen, so an entry
 *   made for it and closed untouched can go again.
 */
export const isBlankOwnMyth = (myth) => !myth.img && !myth.castNote && !myth.verse.some(Boolean) && !myth.omens.some(Boolean) && !tableWritten(myth);

/**
 * @param {OwnMyth} before
 * @param {OwnMyth} after
 * @returns {boolean} Whether the two differ in anything kept.
 */
export const ownMythChanged = (before, after) => JSON.stringify(before) !== JSON.stringify(after);

/**
 * What the rest of the system reads a Myth from, shaped as Import PDF's index
 * shapes a Myth of the book, so the GM Toolkit, the Omen cards and the
 * picture's window show either alike. A blank Omen or verse line is left out,
 * and a table only once something of it is written.
 * @param {string} name The entry's name.
 * @param {OwnMyth} myth
 * @param {object} fallbacks What to call what the Referee left unnamed.
 * @param {string} fallbacks.table The table, unnamed.
 * @param {(number: number) => string} fallbacks.column A column without a heading, by its number from 1.
 * @returns {object} As an index entry: `{name, verse, omens, path, table, cast, castNote, prompts}`.
 */
export function ownMythEntry(name, myth, { table: tableName, column }) {
	const verse = myth.verse.filter(Boolean);
	return {
		own: true,
		name,
		verse: verse.length ? verse : null,
		omens: myth.omens.map((omen) => omen || null),
		path: myth.img || null,
		table: tableWritten(myth)
			? {
				name: myth.table.name || tableName,
				columns: myth.table.columns.map((heading, index) => heading || column(index + 1)),
				rows: myth.table.rows.map((row) => [...row])
			}
			: null,
		// Nobody is written up for the Cast: actors dropped on the Myth are its Cast.
		cast: [],
		castNote: myth.castNote || null,
		prompts: null
	};
}

/**
 * @param {{own?: unknown}|null|undefined} myth
 * @returns {string|null} What tells a written Myth from every other, where a
 *   rolled one is told by its roll, or null for one that isn't written.
 */
export const ownMythKey = (myth) => (isOwnMyth(myth) ? `${OWN_KEY}${myth.own}` : null);

/**
 * @param {{own?: unknown}[]} myths The Myths a Realm holds.
 * @param {string} id A written Myth's entry.
 * @returns {object|null} The Myth of the Realm that is that one, if it has it.
 */
export const mythWithOwn = (myths, id) => myths.find((myth) => isOwnMyth(myth) && myth.own === id) ?? null;
