/**
 * The hexes of a Realm the GM keeps an eye on, listed on the GM Toolkit's
 * Places page when it's set to Custom, in the order they were added. Kept in
 * a Scene flag of their own. Pure, so it can be tested without Foundry.
 */
import { hexKey, hexRecords, parseHexKey } from "./realm-geometry.js";

export const TRACKED_HEXES_VERSION = 1;

/** The Scene flag holding them. */
export const TRACKED_HEXES_FLAG = "trackedHexes";

/**
 * @typedef {object} TrackedHexes
 * @property {number} version
 * @property {Record<string, {added: number}>} hexes Keyed by `hexKey`, each with when it was added.
 */

/** @returns {TrackedHexes} */
export const emptyTrackedHexes = () => ({ version: TRACKED_HEXES_VERSION, hexes: {} });

/**
 * A store from whatever the Scene flag holds, however old or bad.
 * @param {unknown} raw
 * @returns {TrackedHexes}
 */
export function normaliseTrackedHexes(raw) {
	return {
		...emptyTrackedHexes(),
		hexes: hexRecords(raw, (value) => {
			const added = Number(value?.added);
			return Number.isFinite(added) ? { added } : null;
		})
	};
}

/**
 * @param {TrackedHexes|null|undefined} tracked
 * @param {{col: number, row: number}} hex
 * @returns {boolean} Whether the GM is keeping an eye on the hex.
 */
export const isTracked = (tracked, hex) => Boolean(tracked?.hexes?.[hexKey(hex)]);

/**
 * Keep an eye on a hex, or stop.
 * @param {TrackedHexes} tracked
 * @param {{col: number, row: number}} hex
 * @param {boolean} on
 * @param {number} [now] When it's added, which places it at the foot of the list.
 * @returns {TrackedHexes} Unchanged when the hex already was, or wasn't, kept.
 */
export function setTracked(tracked, hex, on, now = Date.now()) {
	if (isTracked(tracked, hex) === on) return tracked;
	const hexes = { ...tracked.hexes };
	if (on) hexes[hexKey(hex)] = { added: now };
	else delete hexes[hexKey(hex)];
	return { version: TRACKED_HEXES_VERSION, hexes };
}

/**
 * @param {TrackedHexes|null|undefined} tracked
 * @returns {{col: number, row: number}[]} The hexes kept, the first added first.
 */
export const trackedInOrder = (tracked) => Object.entries(tracked?.hexes ?? {})
	.sort(([, a], [, b]) => a.added - b.added)
	.map(([key]) => parseHexKey(key))
	.filter(Boolean);
