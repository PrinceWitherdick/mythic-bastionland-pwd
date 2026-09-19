/**
 * The d6 table on every Knight's page (p28-170), such as the True Knight's
 * Symbol of the Truth. Most belong to a line of their Property that says
 * "see below"; the rest are about the Knight themself. A Knight rolls on it
 * once, when they're made, and keeps what it gave. Plain data and functions,
 * so they can be tested without Foundry.
 */
import { PROPERTY_TYPES } from "../config.js";
import { knightTypeFromName } from "./creation.js";
import { WHOLE_ASIDE, pointsBelow } from "./property.js";

export { pointsBelow };

/** "see below" opening an aside that says more: "(see below, restock each new Season)". */
const LEADING = /\(\s*(?:see|as) below(?: for [^,.)]*)?[,.]\s*/gi;

/** "see below" closing a clause: "(A1, can't fly, but see below)", ". See below for repair requirements)". */
const TRAILING = /(?:^|[,.]\s*|\s+)(?:but\s+)?(?:see|as) below(?: for [^,.)]*)?(?=[,.)]|$)/gi;

/**
 * A possession's name without its pointers to the table, for a sheet that
 * shows the table right under it. The rest of what the book says is kept.
 * @param {string} name Such as "Beloved steed (VIG 12, CLA 15, SPI 7, 4GD, see below)".
 * @returns {string} Such as "Beloved steed (VIG 12, CLA 15, SPI 7, 4GD)".
 */
export function withoutSeeBelow(name) {
	return String(name ?? "").replace(WHOLE_ASIDE, "").replace(LEADING, "(").replace(TRAILING, "").trim();
}

/**
 * A possession's name as a row shows it, split into its bold head and the gloss
 * after, without the pointers to the table. The aside is taken out of each part
 * apart, so "Unnatural body (see below), concealed beneath…" leaves no comma
 * hanging after the head.
 * @param {{nameHead: string, nameSep: string, nameRest: string}} parts From splitName.
 * @returns {{nameHead: string, nameSep: string, nameRest: string}}
 */
export function namePartsWithoutSeeBelow({ nameHead, nameSep, nameRest }) {
	const rest = withoutSeeBelow(nameRest).replace(/^[,.]\s*/, "");
	return { nameHead: withoutSeeBelow(nameHead), nameSep: rest ? nameSep : "", nameRest: rest };
}

/**
 * The possession the table belongs to: the first that says "see below".
 * @param {{id: string, name: string}[]} items
 * @returns {string|null} Its id, or null when the table is about the Knight themself.
 */
export function tableItemId(items) {
	return items.find((item) => pointsBelow(item.name))?.id ?? null;
}

/**
 * The item a Knight's table sits under, on their sheet and on its chat card
 * alike: their first Property, in sheet order, that says "see below".
 * @param {{type: string, system: object, items?: {contents: {id: string, name: string, type: string, sort: number}[]}}|null} actor
 * @returns {string|null} Null for a Squire, a Knight with no table, or a table about the Knight themself.
 */
export function knightTableItemId(actor) {
	const system = actor?.system;
	if (actor?.type !== "knight" || system?.isSquire || !hasTable(system.bookTable)) return null;
	return tableItemId((actor.items?.contents ?? [])
		.filter((item) => PROPERTY_TYPES.includes(item.type))
		.sort((a, b) => a.sort - b.sort));
}

/**
 * A Knight's entry in the art index, found by the name they're known by.
 * @param {object|null} index
 * @param {string} knightType Such as "True", for "Known as the True Knight".
 * @returns {object|null}
 */
export function knightEntryByType(index, knightType) {
	const type = String(knightType ?? "").trim().toLowerCase();
	if (!type) return null;
	return (index?.knights ?? []).find((entry) => entry.name && knightTypeFromName(entry.name).toLowerCase() === type) ?? null;
}

/**
 * @typedef {object} StoredTable What a Knight keeps of their table: all of it, so it reads without the book.
 * @property {string} knight    The Knight it was taken for, so a Knight chosen again gets theirs.
 * @property {number} page
 * @property {string} name
 * @property {string[]} columns
 * @property {string[][]} rows  Six, each with an entry per column.
 * @property {number[]} rolls   For each column, the row rolled from 1, or 0 until it's rolled.
 */

/**
 * @param {StoredTable|null|undefined} stored
 * @returns {boolean} Whether a Knight holds a table to roll on.
 */
export const hasTable = (stored) => Boolean(stored?.name && stored.columns?.length && stored.rows?.length);

/**
 * What a Knight's sheet fills in from the book on its own: their page's table, whenever
 * they hold none yet or hold another Knight's. Once theirs is in, it's left alone, rolls and all.
 * @param {import("./book-art.js").MythTable|null} table From the index or the rulebook.
 * @param {{knightType: string, bookTable?: StoredTable|null}} knight
 * @param {number} page
 * @returns {object} An Actor update, empty when there's nothing to fill.
 */
export function knightTableFill(table, { knightType, bookTable }, page) {
	const type = String(knightType ?? "").trim();
	if (!table || !type) return {};
	if (hasTable(bookTable) && bookTable.knight === type) return {};
	return {
		"system.bookTable": {
			knight: type,
			page,
			name: table.name,
			columns: [...table.columns],
			rows: table.rows.map((row) => [...row]),
			rolls: table.columns.map(() => 0)
		}
	};
}

/**
 * Set some columns' rows, leaving the others as they were.
 * @param {StoredTable} stored
 * @param {number[]} columns By index.
 * @param {number[]} rolls   A row from 1 for each, in the same order; 0 clears it.
 * @returns {number[]} Every column's roll.
 */
export function withRolls(stored, columns, rolls) {
	const next = stored.columns.map((_, index) => stored.rolls?.[index] ?? 0);
	columns.forEach((column, at) => {
		if (column >= 0 && column < next.length) next[column] = rolls[at];
	});
	return next;
}

/**
 * What a Knight's rolls gave, column by column.
 * @param {StoredTable|null|undefined} stored
 * @returns {{column: string, roll: number, entry: string}[]} Only the columns rolled.
 */
export function tableResults(stored) {
	if (!hasTable(stored)) return [];
	return stored.columns.flatMap((column, index) => {
		const roll = stored.rolls?.[index] ?? 0;
		const entry = stored.rows[roll - 1]?.[index];
		return entry ? [{ column, roll, entry }] : [];
	});
}
