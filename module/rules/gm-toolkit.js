/**
 * What the GM Toolkit shows, worked out from a Realm, what the GM has written
 * about its hexes, and where the Company has been. Pure, so it can be tested
 * without Foundry; the sheet puts words to it.
 */
import { mythNoteFor } from "./myth-notes.js";
import { LANDMARK_TYPES, OMEN_COUNT } from "./realm.js";
import { parseHexKey, sameHex } from "./realm-geometry.js";

/** The toolkit's pages, in the order its tab rail lists them. Names live under `bastionland.gmToolkit.tabs`. */
export const TOOLKIT_TABS = Object.freeze(["myths", "journey", "places", "time", "seasons", "notes"]);

/** The pages about one Realm, which follow the Realm chosen at the top of the sheet. */
export const REALM_TABS = Object.freeze(["myths", "journey", "places"]);

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

/** @returns {number} Top to bottom, then left to right, the way the Realm Sheet reads. */
const byPlace = (a, b) => a.row - b.row || a.col - b.col;

/**
 * The places in a Realm a GM keeps notes on: its Holdings, the Seat of Power
 * first; its Landmarks, by type in the book's order (p14); and every other hex
 * something has been written about or rolled for, which is where the Myths'
 * hexes and the Company's own discoveries turn up.
 * @param {import("./realm.js").Realm} realm
 * @param {{hexes: Record<string, unknown>}} lore What the GM has written, from hex-lore.js.
 * @returns {{holdings: object[], landmarks: object[], others: {col: number, row: number}[]}}
 */
export function realmPlaces(realm, lore) {
	const holdings = [...(realm?.holdings ?? [])]
		.sort((a, b) => Number(Boolean(b.seat)) - Number(Boolean(a.seat)) || byPlace(a.hex, b.hex));
	const typeOrder = (landmark) => {
		const index = LANDMARK_TYPES.indexOf(landmark.type);
		return index < 0 ? LANDMARK_TYPES.length : index;
	};
	const landmarks = [...(realm?.landmarks ?? [])].sort((a, b) => typeOrder(a) - typeOrder(b) || byPlace(a.hex, b.hex));

	const named = [...holdings, ...landmarks].map((place) => place.hex);
	const others = Object.keys(lore?.hexes ?? {})
		.map(parseHexKey)
		.filter((hex) => hex && !named.some((place) => sameHex(place, hex)))
		.sort(byPlace);
	return { holdings, landmarks, others };
}

/**
 * Whether a roll on the Myths table (p27) is a Myth the Realm already has. A
 * Realm never holds the same Myth twice.
 * @param {import("./realm.js").Realm} realm
 * @param {{d6: number, d12: number}} roll
 * @returns {boolean}
 */
export const mythRollTaken = (realm, { d6, d12 }) => (realm?.myths ?? []).some((myth) => myth.d6 === d6 && myth.d12 === d12);

/**
 * The Myths the group feels are resolved, each waiting for the new Myth that
 * replaces it in the next Season (p27).
 * @param {import("./realm.js").Realm} realm
 * @param {import("./myth-notes.js").MythNotes} notes
 * @returns {object[]} Those Myths, by number.
 */
export const resolvedMyths = (realm, notes) => (realm?.myths ?? []).filter((myth) => mythNoteFor(notes, myth).resolved);
