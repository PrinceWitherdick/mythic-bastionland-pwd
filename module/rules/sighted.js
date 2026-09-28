/**
 * Seen from afar (p183, p197, p199). From a vantage point the Company can make
 * out that something stands in a neighbouring hex without knowing what it is:
 * "some sort of structure in amongst the hills, a little smoke rising from it".
 * The players' map shows an unnamed mark there, with the Referee's few words of
 * what they see, until the Company gets there.
 *
 * What can be seen this way is whatever stands hidden in the hex: a Landmark
 * not yet revealed, or a Holding the GM has hidden by hand. Myths are no
 * structure on the horizon, and are left to the Wilderness Roll. The marks are
 * kept in the Scene flag `sighted`, keyed by hex: `{"5,7": {note}}`, which every
 * client reads to draw them. Pure, so it can be tested without Foundry.
 */
import { featureAt } from "./realm.js";
import { hexKey, neighbours, parseHexKey } from "./realm-geometry.js";
import { trimmedText } from "./text.js";

/** The Scene flag the marks are kept in. */
export const SIGHTED_FLAG = "sighted";

/** How long the Referee's words for a mark may run: a glimpse, not a description. */
export const MAX_SIGHTED_NOTE = 120;

/**
 * @typedef {Record<string, {note: string}>} Sightings Keyed by `hexKey`.
 */

/**
 * @param {unknown} note
 * @returns {string} The Referee's words, trimmed and kept short.
 */
export const sightedNote = (note) => trimmedText(note).slice(0, MAX_SIGHTED_NOTE).trim();

/**
 * The marks from whatever the Scene flag holds, however old or bad.
 * @param {unknown} raw
 * @returns {Sightings}
 */
export function normaliseSighted(raw) {
	if (!raw || typeof raw !== "object") return {};
	return Object.fromEntries(Object.entries(raw)
		.filter(([key, value]) => parseHexKey(key) && value && typeof value === "object")
		.map(([key, value]) => [key, { note: sightedNote(value.note) }]));
}

/**
 * What stands hidden in a hex, which is what a vantage point can make out.
 * @param {import("./realm.js").Realm} realm
 * @param {{col: number, row: number}} hex
 * @param {(hex: {col: number, row: number}) => {holding: boolean}} handHidden What the GM hid there by hand.
 * @returns {{landmark: object|null, holding: object|null}|null} Null where nothing stands hidden.
 */
export function hiddenThere(realm, hex, handHidden) {
	const here = featureAt(realm, hex);
	const landmark = here.landmark && !here.landmark.revealed ? here.landmark : null;
	const holding = here.holding && handHidden(hex)?.holding ? here.holding : null;
	return landmark || holding ? { landmark, holding } : null;
}

/**
 * The neighbouring hexes a vantage point can see something standing in.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} hex Where the Company stands.
 * @param {(hex: {col: number, row: number}) => {holding: boolean}} handHidden
 * @returns {{direction: number, hex: {col: number, row: number}, landmark: object|null, holding: object|null}[]}
 */
export function sightable(realm, g, hex, handHidden) {
	return neighbours(g, hex).flatMap(({ direction, hex: next }) => {
		const hidden = hiddenThere(realm, next, handHidden);
		return hidden ? [{ direction, hex: next, ...hidden }] : [];
	});
}

/**
 * The marks to draw: each hex seen from afar where something still stands
 * hidden. A mark whose Landmark has been revealed since, by the Wilderness
 * Roll or by hand, has nothing left to stand for, so it isn't drawn.
 * @param {import("./realm.js").Realm} realm
 * @param {Sightings} sighted
 * @param {(hex: {col: number, row: number}) => {holding: boolean}} handHidden
 * @returns {{hex: {col: number, row: number}, note: string}[]}
 */
export function sightedMarks(realm, sighted, handHidden) {
	return Object.entries(sighted ?? {}).flatMap(([key, { note }]) => {
		const hex = parseHexKey(key);
		return hex && hiddenThere(realm, hex, handHidden) ? [{ hex, note }] : [];
	});
}

/**
 * @param {Sightings} sighted
 * @param {{col: number, row: number}} hex
 * @returns {{note: string}|null} The mark on a hex, if it was seen from afar.
 */
export const sightedAt = (sighted, hex) => sighted?.[hexKey(hex)] ?? null;

/**
 * What the Referee's choices from a vantage point change: each hex ticked is
 * marked with its words, and each unticked loses any mark it had.
 * @param {Sightings} sighted As it stands.
 * @param {{hex: {col: number, row: number}, marked: boolean, note?: string}[]} choices
 * @returns {{set: Sightings, drop: string[]}}
 */
export function sightingChanges(sighted, choices) {
	const set = {};
	const drop = [];
	for (const { hex, marked, note } of choices) {
		const key = hexKey(hex);
		if (marked) {
			const words = sightedNote(note);
			if (sighted?.[key]?.note !== words) set[key] = { note: words };
		} else if (sighted?.[key]) drop.push(key);
	}
	return { set, drop };
}
