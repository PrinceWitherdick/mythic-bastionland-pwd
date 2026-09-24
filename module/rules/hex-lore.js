/**
 * What the GM has made of each hex of a Realm. The book asks the Referee to
 * fill the blanks in a Hex with Spark Table prompts (p19, p22-25), and a Hex
 * the Company comes back to ought to hold what it held the first time, so each
 * roll is kept where it was made, beside whatever the GM wrote down about the
 * place. Pure, so it can be tested without Foundry.
 */
import { hexKey, parseHexKey } from "./realm-geometry.js";
import { SPARK_TABLES_PER_PAGE } from "./spark-tables.js";
import { trimmedText } from "./text.js";

export const HEX_LORE_VERSION = 1;

/**
 * How many rolls one hex keeps. The whole Scene, flags and all, is sent to
 * every client each time any of it changes, so the list has an end: the oldest
 * roll drops off once a hex has this many.
 */
export const MAX_HEX_SPARKS = 24;

/**
 * What a GM's browser does when the Company comes to rest in a hex it wasn't
 * in a moment ago: open the Lay of the Land on it, or leave them to it.
 */
export const HEX_PROMPT_MODES = Object.freeze(["never", "open"]);

/**
 * Where the three stand on the Nature page (p22), which prints its nine tables
 * three to a row: the first of each row. No table name from the book ships with
 * the system, so they're found by their place on the page rather than by name,
 * and each roll keeps the name the GM's own import read there.
 */
const WILDERNESS_POSITIONS = Object.freeze([0, 3, 6]);

/**
 * @typedef {object} HexSpark
 * @property {string} id       So one roll can be struck out without disturbing the rest.
 * @property {string} page     A SPARK_PAGES key, such as "nature".
 * @property {string} table    The table's name as the GM's own book gave it, such as "Land".
 * @property {number[]} rolls  One d12 for each column.
 * @property {string[]} entries What those rolls landed on.
 * @property {string} prompt   The entries joined, the way the chat card reads them.
 * @property {{age: number, season: string, day: number, phase: string}|null} when
 *   The world's calendar when it was rolled, so a hex says when it was last thought about.
 */

/**
 * @typedef {object} HexRecord
 * @property {string} note      What's in the hex, in the GM's own words.
 * @property {HexSpark[]} sparks Oldest first.
 */

/**
 * @typedef {object} HexLore
 * @property {number} version
 * @property {Record<string, HexRecord>} hexes Keyed by `hexKey`, such as "5,7".
 */

/** @returns {HexLore} */
export const emptyLore = () => ({ version: HEX_LORE_VERSION, hexes: {} });

/** @returns {number[]} */
const wholeNumbers = (value) => (Array.isArray(value) ? value.filter((number) => Number.isInteger(number)) : []);

/**
 * A moment on the world's calendar as it was stored, or nothing if it doesn't read as one.
 * @param {unknown} raw
 * @returns {HexSpark["when"]}
 */
export function normaliseWhen(raw) {
	if (!raw || typeof raw !== "object") return null;
	const { age, season, day, phase } = raw;
	if (!Number.isInteger(age) || !Number.isInteger(day)) return null;
	if (typeof season !== "string" || typeof phase !== "string") return null;
	return { age, season, day, phase };
}

/**
 * @param {unknown} raw
 * @param {number} index Stands in for an id that somehow went missing, unique within its hex.
 * @returns {HexSpark|null} Null for a roll with no table or nothing rolled, which says nothing.
 */
function normaliseSpark(raw, index) {
	if (!raw || typeof raw !== "object") return null;
	const table = trimmedText(raw.table);
	const entries = (Array.isArray(raw.entries) ? raw.entries : []).map(trimmedText).filter(Boolean);
	if (!table || !entries.length) return null;
	return {
		id: trimmedText(raw.id) || String(index),
		page: trimmedText(raw.page),
		table,
		rolls: wholeNumbers(raw.rolls),
		entries,
		prompt: trimmedText(raw.prompt) || entries.join(" "),
		when: normaliseWhen(raw.when)
	};
}

/**
 * @param {unknown} raw
 * @returns {HexRecord|null} Null for a hex with nothing written and nothing rolled.
 */
export function normaliseRecord(raw) {
	if (!raw || typeof raw !== "object") return null;
	const sparks = (Array.isArray(raw.sparks) ? raw.sparks : []).map(normaliseSpark).filter(Boolean);
	const note = trimmedText(raw.note);
	return note || sparks.length ? { note, sparks } : null;
}

/**
 * A store from whatever the Scene flag holds, however old or bad.
 * @param {unknown} raw
 * @returns {HexLore}
 */
export function normaliseHexLore(raw) {
	const lore = emptyLore();
	const hexes = raw && typeof raw === "object" ? raw.hexes : null;
	if (!hexes || typeof hexes !== "object") return lore;
	for (const [key, value] of Object.entries(hexes)) {
		if (!parseHexKey(key)) continue;
		const record = normaliseRecord(value);
		if (record) lore.hexes[key] = record;
	}
	return lore;
}

/**
 * @param {HexLore} lore
 * @param {{col: number, row: number}} hex
 * @returns {HexRecord|null}
 */
export function loreAt(lore, hex) {
	return lore?.hexes?.[hexKey(hex)] ?? null;
}

/** @returns {HexRecord|null} A record worth keeping, or null once it says nothing. */
const worthKeeping = (record) => (record.note || record.sparks.length ? record : null);

/**
 * @param {HexLore} lore
 * @param {{col: number, row: number}} hex
 * @param {HexRecord|null} record
 * @returns {HexLore}
 */
function withRecord(lore, hex, record) {
	const key = hexKey(hex);
	const hexes = { ...lore.hexes };
	if (record) hexes[key] = record;
	else delete hexes[key];
	return { version: HEX_LORE_VERSION, hexes };
}

/**
 * Keep a roll made for a hex, after the rolls already made there.
 * @param {HexLore} lore
 * @param {{col: number, row: number}} hex
 * @param {HexSpark} spark
 * @returns {HexLore} Unchanged when the roll says nothing.
 */
export function recordSpark(lore, hex, spark) {
	const here = loreAt(lore, hex) ?? { note: "", sparks: [] };
	const added = normaliseSpark(spark, here.sparks.length);
	if (!added) return lore;
	return withRecord(lore, hex, { ...here, sparks: [...here.sparks, added].slice(-MAX_HEX_SPARKS) });
}

/**
 * Strike one roll out of a hex, leaving the rest as they were.
 * @param {HexLore} lore
 * @param {{col: number, row: number}} hex
 * @param {string} id
 * @returns {HexLore} Unchanged when no roll there has that id.
 */
export function forgetSpark(lore, hex, id) {
	const here = loreAt(lore, hex);
	if (!here) return lore;
	const sparks = here.sparks.filter((spark) => spark.id !== id);
	if (sparks.length === here.sparks.length) return lore;
	return withRecord(lore, hex, worthKeeping({ ...here, sparks }));
}

/**
 * Write what's in a hex. Rubbing out the last of the writing over a hex with no
 * rolls left forgets the hex, rather than leaving an empty record behind.
 * @param {HexLore} lore
 * @param {{col: number, row: number}} hex
 * @param {string} note
 * @returns {HexLore}
 */
export function setNote(lore, hex, note) {
	const here = loreAt(lore, hex) ?? { note: "", sparks: [] };
	return withRecord(lore, hex, worthKeeping({ ...here, note: trimmedText(note) }));
}

/**
 * The tables to roll in one go for a wilderness hex, from the Nature page.
 * @param {{tables: object[]}|null|undefined} page A page of the art index's spark payload.
 * @returns {{index: number, table: object}[]} Empty when the page was never read.
 *   The places below only mean anything on a page read whole, so a page missing
 *   some of its tables gives the first three it did read instead.
 */
export function wildernessSparkSet(page) {
	const tables = page?.tables ?? [];
	if (!tables.length) return [];
	const places = tables.length === SPARK_TABLES_PER_PAGE ? WILDERNESS_POSITIONS : [0, 1, 2];
	return places.filter((index) => tables[index]).map((index) => ({ index, table: tables[index] }));
}
