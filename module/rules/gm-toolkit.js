/**
 * What the GM Toolkit shows, worked out from a Realm, what the GM has written
 * about its hexes, and where the Company has been. Pure, so it can be tested
 * without Foundry; the sheet puts words to it.
 */
import { visitedNewestFirst } from "./journey.js";
import { mythNoteFor } from "./myth-notes.js";
import { OMEN_COUNT } from "./realm.js";
import { hexKey, parseHexKey, sameHex } from "./realm-geometry.js";
import { headingText } from "./text.js";

/** The toolkit's pages, in the order its tab rail lists them. Names live under `bastionland.gmToolkit.tabs`. */
export const TOOLKIT_TABS = Object.freeze(["myths", "places", "time", "notes"]);

/** The pages about one Realm, which follow the Realm chosen at the top of the sheet. */
export const REALM_TABS = Object.freeze(["myths", "places"]);

/**
 * Where a Myth has got to. Omens come in order (p18), so the one met last is
 * the one playing out, and the one after it comes next.
 * @param {number} seen How many of its Omens have been met, 0-6.
 * @returns {{current: number|null, next: number|null}} Omen numbers, 1-6: `current` is null
 *   before the first is met, `next` once the last has been.
 */
export function omenStage(seen) {
	const count = Math.min(OMEN_COUNT, Math.max(0, Math.trunc(Number(seen) || 0)));
	return { current: count > 0 ? count : null, next: count < OMEN_COUNT ? count + 1 : null };
}

/** @returns {number} Lowest column first, then lowest row, as the hex readout numbers them. */
const byPlace = (a, b) => a.col - b.col || a.row - b.row;

/**
 * The places in a Realm a GM keeps notes on, each hex once, in both the ways
 * the Places page groups them, each group by column then row. By kind: its
 * Holdings; its Landmarks, less any in a Holding's hex; and every other hex the
 * Company has come into, or something has been written about or rolled for,
 * which is where the Myths' hexes and the Company's own discoveries turn up.
 * By visit: the hexes the Company has come into, then every other place.
 * `recent` is the visited hexes again, the last reached first.
 * @param {import("./realm.js").Realm} realm
 * @param {{hexes: Record<string, unknown>}} lore What the GM has written, from hex-lore.js.
 * @param {import("./journey.js").Journey} [journey] Where the Company has been, from journey.js.
 * @param {{hexes: Record<string, unknown>}} [shared] What the players were told and wrote, from hex-shared.js.
 * @returns {{holdings: object[], landmarks: object[], others: {col: number, row: number}[],
 *   visited: {col: number, row: number}[], unvisited: {col: number, row: number}[],
 *   recent: {col: number, row: number}[]}}
 */
export function realmPlaces(realm, lore, journey = null, shared = null) {
	const holdings = [...(realm?.holdings ?? [])].sort((a, b) => byPlace(a.hex, b.hex));
	// A hex holding both is listed once, as the Holding; its card still says what the Landmark asks.
	const landmarks = [...(realm?.landmarks ?? [])]
		.filter((landmark) => !holdings.some((holding) => sameHex(holding.hex, landmark.hex)))
		.sort((a, b) => byPlace(a.hex, b.hex));

	const named = [...holdings, ...landmarks].map((place) => place.hex);
	// A hex the players were told of, or wrote about, is a place to find again too.
	const keys = new Set([...Object.keys(lore?.hexes ?? {}), ...Object.keys(journey?.hexes ?? {}), ...Object.keys(shared?.hexes ?? {})]
		.map(parseHexKey).filter(Boolean).map(hexKey));
	const others = [...keys].map(parseHexKey)
		.filter((hex) => !named.some((place) => sameHex(place, hex)))
		.sort(byPlace);

	const recent = visitedNewestFirst(journey).map((visit) => visit.hex).filter(Boolean);
	const visited = [...recent].sort(byPlace);
	const unvisited = [...named, ...others].filter((hex) => !recent.some((seen) => sameHex(seen, hex))).sort(byPlace);
	return { holdings, landmarks, others, visited, unvisited, recent };
}

/** The orders the Places page can list its hexes in, the first taken until another is chosen. */
export const PLACE_ORDERS = Object.freeze(["visited", "kind"]);

/**
 * Whether a roll on the Myths table (p27) is a Myth the Realm already has. A
 * Realm never holds the same Myth twice.
 * @param {import("./realm.js").Realm} realm
 * @param {{d6: number, d12: number}} roll
 * @returns {boolean}
 */
export const mythRollTaken = (realm, { d6, d12 }) => (realm?.myths ?? []).some((myth) => myth.d6 === d6 && myth.d12 === d12);

/**
 * The Myths the group feels are resolved, each waiting for the Myth that takes
 * its place next Season (p27).
 * @param {import("./realm.js").Realm} realm
 * @param {import("./myth-notes.js").MythNotes} notes
 * @returns {object[]} Those Myths, by number.
 */
export const resolvedMyths = (realm, notes) => (realm?.myths ?? []).filter((myth) => mythNoteFor(notes, myth).resolved);

/** How an Omen points to the table printed beside it on its Myth's page. */
const SEE_OPPOSITE = /see opposite/i;

/**
 * An Omen's text in pieces, with each "see opposite" marked, so the toolkit can
 * make it open the Myth's table.
 * @param {string|null} text
 * @returns {{text: string, opposite: boolean}[]} Empty without text.
 */
export function omenParts(text) {
	if (!text) return [];
	return String(text).split(/(see opposite)/i).filter(Boolean).map((part) => ({ text: part, opposite: SEE_OPPOSITE.test(part) }));
}

/**
 * @param {string|null} text
 * @returns {boolean} Whether an Omen points to its Myth's table.
 */
export const pointsOpposite = (text) => SEE_OPPOSITE.test(text ?? "");

/**
 * Read a roll on a Myth's table: a d6 for each column rolled.
 * @param {import("./book-art.js").MythTable} table
 * @param {number[]} columns Which columns were rolled, by index.
 * @param {number[]} rolls   One d6 for each, in the same order.
 * @returns {{index: number, column: string, roll: number, entry: string|null}[]}
 */
export function readMythTable(table, columns, rolls) {
	return columns.map((index, at) => ({
		index,
		column: headingText(table.columns[index]),
		roll: rolls[at],
		entry: table.rows[rolls[at] - 1]?.[index] ?? null
	}));
}

/**
 * The columns a click on a d6 table rolls: the one whose heading was clicked,
 * or every column.
 * @param {{columns: string[]}} table
 * @param {number} asked A column's index, or NaN for all of them.
 * @returns {number[]}
 */
export const askedColumns = (table, asked) => table.columns.map((_, index) => index).filter((index) => Number.isNaN(asked) || index === asked);

/**
 * A d6 table as a window draws it, with the row taken in each column marked.
 * @param {{columns: string[], rows: string[][]}} table
 * @param {Record<number, number>|number[]} rolled The row taken in each column, from 1.
 * @param {(column: string) => string} tooltip Each heading's tip.
 */
export function tableView(table, rolled, tooltip) {
	return {
		columns: table.columns.map((printed, index) => {
			const label = headingText(printed);
			return { label, index, tooltip: tooltip(label) };
		}),
		rows: table.rows.map((entries, row) => ({
			number: row + 1,
			entries: entries.map((text, column) => ({ text, column, row: row + 1, rolled: rolled?.[column] === row + 1 }))
		}))
	};
}
