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
import { parentheticals } from "./text.js";
import { cadencesTurned, isCalendar } from "./time.js";

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
 * @returns {{index: number, column: string, roll: number, entry: string}[]} Only the columns rolled.
 */
export function tableResults(stored) {
	if (!hasTable(stored)) return [];
	return stored.columns.flatMap((column, index) => {
		const roll = stored.rolls?.[index] ?? 0;
		const entry = stored.rows[roll - 1]?.[index];
		return entry ? [{ index, column, roll, entry }] : [];
	});
}

/**
 * When a few Knights roll on their table again, by what their possession says:
 * "restock each new Season", "rolling each night", "one dose each day". The
 * earliest named wins, should one aside name two.
 */
const RENEWALS = Object.freeze([
	["season", /\b(?:each new|each|every|the next) Season\b/i],
	["night", /\beach night\b/i],
	["day", /\beach day\b/i]
]);

/** How often a table can come round again. */
export const RENEWAL_CADENCES = Object.freeze(RENEWALS.map(([cadence]) => cadence));

/** "(see below)" and nothing else, left when the rest of the aside was read into tags and notes. */
const ONLY_POINTER = /^\s*(?:see|as) below\s*$/i;

/** A clause that sets a condition, kept with the clause after it: "If smashed, find a new flask…". */
const CONDITION = /^(?:if|when|unless|once)\b/i;

/**
 * The first time named in some text.
 * @param {string} text
 * @returns {{cadence: string, index: number, end: number}|null}
 */
function renewalIn(text) {
	const found = RENEWALS.map(([cadence, pattern]) => ({ cadence, match: pattern.exec(text) }))
		.filter(({ match }) => match)
		.sort((a, b) => a.match.index - b.match.index)[0];
	return found ? { cadence: found.cadence, index: found.match.index, end: found.match.index + found.match[0].length } : null;
}

/**
 * The words saying when, from the start of their clause to the time they name:
 * "restock each new Season" out of "see below, restock each new Season". A
 * condition just before is kept with them.
 * @param {string} text
 * @param {{index: number, end: number}} at
 * @returns {string}
 */
function renewalClause(text, { index, end }) {
	const stop = text.lastIndexOf(". ", index);
	const start = Math.max(text.lastIndexOf("(", index) + 1, stop >= 0 ? stop + 2 : 0);
	const parts = text.slice(start, end).split(/,\s*/).map((part) => part.trim()).filter(Boolean);
	const condition = parts.findLastIndex((part) => CONDITION.test(part));
	return parts.slice(condition >= 0 ? condition : parts.length - 1).join(", ");
}

/**
 * @typedef {object} Renewal When a Knight rolls on their table again.
 * @property {string} cadence   One of RENEWAL_CADENCES.
 * @property {string} clause    The book's words for it, such as "restock each new Season".
 * @property {"name"|"description"} source Where the possession says it.
 * @property {string} [paragraph] The note that says it, as stored, when the source is the description.
 */

/**
 * Whether the possession a Knight's table sits under says to roll on it again,
 * and when. Only its own "see below" aside counts, so a note about another
 * thing in the same line, such as salt restocked each Season beside a table
 * about a miniature, doesn't. An aside that was read into the item's notes,
 * leaving just "(see below)", is looked for there.
 * @param {{name: string, system?: {description?: string}}|null|undefined} item
 * @returns {Renewal|null}
 */
export function tableRenewal(item) {
	const name = String(item?.name ?? "");
	const aside = parentheticals(name).find((group) => pointsBelow(group.inner));
	if (!aside) return null;
	const inName = renewalIn(aside.inner);
	if (inName) return { cadence: inName.cadence, clause: renewalClause(aside.inner, inName), source: "name" };
	if (!ONLY_POINTER.test(aside.inner)) return null;
	for (const [paragraph, inner] of String(item.system?.description ?? "").matchAll(/<p>(.*?)<\/p>/gs)) {
		const text = inner.replace(/<[^>]*>/g, "");
		const found = renewalIn(text);
		if (found) return { cadence: found.cadence, clause: renewalClause(text, found), source: "description", paragraph };
	}
	return null;
}

/**
 * When a Knight's table comes round again, found through the possession it sits under.
 * @param {{type: string, system: object, items?: {contents: object[]}}|null} actor
 * @returns {Renewal|null}
 */
export function knightRenewal(actor) {
	const id = knightTableItemId(actor);
	return id ? tableRenewal(actor.items.contents.find((item) => item.id === id)) : null;
}

/**
 * The words for when as they read mid-sentence: "restock each new Season".
 * @param {string} text
 * @returns {string}
 */
export const clauseMidSentence = (text) => (/^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text);

/**
 * A possession's shown gloss split where it says when, so the die can sit
 * right there inside its aside: "(restock each new Season" and ")".
 * @param {string} gloss As the row shows it, without "see below".
 * @param {Renewal} renewal
 * @returns {{before: string, after: string}|null} Null when the gloss doesn't say it.
 */
export function splitAtRenewal(gloss, renewal) {
	const text = String(gloss ?? "");
	const [, pattern] = RENEWALS.find(([cadence]) => cadence === renewal?.cadence) ?? [];
	const last = pattern ? [...text.matchAll(new RegExp(pattern.source, "gi"))].at(-1) : null;
	if (!last) return null;
	const end = last.index + last[0].length;
	return { before: text.slice(0, end), after: text.slice(end) };
}

/**
 * Whether a table's time has come round again since it was last rolled: a
 * new Season, a later Day, or a Night other than the one it was rolled in
 * (see cadencesTurned).
 * A table with no record of when it was rolled isn't counted due, since
 * there's no knowing.
 * @param {string} cadence One of RENEWAL_CADENCES.
 * @param {object|null|undefined} rolledAt The calendar when it was last rolled.
 * @param {object} now
 * @returns {boolean}
 */
export function renewalDue(cadence, rolledAt, now) {
	return isCalendar(rolledAt) && cadencesTurned(rolledAt, now).includes(cadence);
}
