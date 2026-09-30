/**
 * How a new Realm is set up: the size of its map, and what Creating a Realm
 * (p14) rolls onto it. The book's numbers make a typical Realm, and a Realm of
 * your own needn't keep to them, so a GM who ignores the rules
 * for setup gives their own. Either way, any part can be left off the roll to
 * draw by hand. Pure, so it can be tested without Foundry.
 */
import { HOLDING_COUNT, LANDMARK_TYPES, LANDMARKS_PER_TYPE, MYTH_COUNT, barrierCount } from "./realm.js";
import { realmGeometry } from "./realm-geometry.js";

/** The parts of a Realm that are rolled, in the order they're rolled. Each is also the Realm's key for it. */
export const SETUP_PARTS = Object.freeze(["terrain", "rivers", "holdings", "myths", "landmarks", "barriers"]);

/**
 * @typedef {object} RealmSetup
 * @property {boolean} ignoreRules Whether the numbers are the GM's own rather than the book's.
 * @property {number} cols
 * @property {number} rows
 * @property {Record<string, boolean>} roll For each of SETUP_PARTS, whether it's rolled or left to draw by hand.
 * @property {number} cluster The die a terrain cluster rolls for its size: "clusters of d12 hexes".
 * @property {number} lakes The most lake clusters: "a few large lakes".
 * @property {number} holdings
 * @property {number} myths
 * @property {{min: number, max: number, types: Record<string, number>}} landmarks Of each type, unless `types`
 *   gives a type a count of its own, as the Referee on p202 sets one Landmark per type and then an extra Hazard and Curse.
 * @property {number|null} barriers Null for one sixth of the hexes.
 */

const { cols: BOOK_COLS, rows: BOOK_ROWS } = realmGeometry();

/** @type {Readonly<RealmSetup>} A typical Realm (p14). */
export const BOOK_SETUP = Object.freeze({
	ignoreRules: false,
	cols: BOOK_COLS,
	rows: BOOK_ROWS,
	roll: Object.freeze(Object.fromEntries(SETUP_PARTS.map((part) => [part, true]))),
	cluster: 12,
	lakes: 3,
	holdings: HOLDING_COUNT,
	myths: MYTH_COUNT,
	landmarks: Object.freeze({ ...LANDMARKS_PER_TYPE, types: Object.freeze({}) }),
	barriers: null
});

/**
 * How far each number goes when the rules are ignored. These are what a Scene
 * and the Realm's pictures can hold, not rules: Myth pictures are numbered 1 to 6.
 */
export const SETUP_LIMITS = Object.freeze({
	cols: Object.freeze({ min: 3, max: 30 }),
	rows: Object.freeze({ min: 3, max: 30 }),
	cluster: Object.freeze({ min: 1, max: 99 }),
	lakes: Object.freeze({ min: 0, max: 99 }),
	holdings: Object.freeze({ min: 0, max: 99 }),
	myths: Object.freeze({ min: 0, max: MYTH_COUNT }),
	landmarks: Object.freeze({ min: 0, max: 99 }),
	barriers: Object.freeze({ min: 0, max: 999 })
});

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {{min: number, max: number}} limits
 * @returns {number} A whole number within the limits, or the fallback where there's none.
 */
export function within(value, fallback, { min, max }) {
	const number = value === "" || value === null || value === undefined ? NaN : Math.trunc(Number(value));
	return Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback));
}

/**
 * A setup with nothing missing. Unless the rules are ignored, every number is
 * the book's, whatever was given.
 * @param {Partial<RealmSetup>|null} [given] Omit for the book's.
 * @returns {RealmSetup}
 */
export function normaliseRealmSetup(given = null) {
	// A setup saved before every river was kept alike calls its rivers `river`.
	const asked = { ...given?.roll, rivers: given?.roll?.rivers ?? given?.roll?.river };
	const roll = Object.fromEntries(SETUP_PARTS.map((part) => [part, asked[part] !== false]));
	if (!given?.ignoreRules) return { ...BOOK_SETUP, roll, landmarks: { ...BOOK_SETUP.landmarks, types: {} } };

	const number = (key, value) => within(value, BOOK_SETUP[key], SETUP_LIMITS[key]);
	const fewest = within(given.landmarks?.min, BOOK_SETUP.landmarks.min, SETUP_LIMITS.landmarks);
	const most = within(given.landmarks?.max, BOOK_SETUP.landmarks.max, SETUP_LIMITS.landmarks);
	const barriers = given.barriers;
	return {
		ignoreRules: true,
		cols: number("cols", given.cols),
		rows: number("rows", given.rows),
		roll,
		cluster: number("cluster", given.cluster),
		lakes: number("lakes", given.lakes),
		holdings: number("holdings", given.holdings),
		myths: number("myths", given.myths),
		landmarks: { min: Math.min(fewest, most), max: Math.max(fewest, most), types: landmarkCounts(given.landmarks?.types) },
		barriers: barriers === null || barriers === undefined || barriers === "" ? null : within(barriers, 0, SETUP_LIMITS.barriers)
	};
}

/**
 * @param {unknown} types As given, by Landmark type.
 * @returns {Record<string, number>} The types given a count of their own, each within the limits; a blank leaves a type to the range.
 */
function landmarkCounts(types) {
	const given = types && typeof types === "object" ? types : {};
	return Object.fromEntries(LANDMARK_TYPES
		.filter((type) => !["", null, undefined].includes(given[type]) && Number.isFinite(Number(given[type])))
		.map((type) => [type, within(given[type], 0, SETUP_LIMITS.landmarks)]));
}

/**
 * @param {RealmSetup} setup
 * @returns {number} How many Barriers the setup places.
 */
export const setupBarriers = (setup) => setup.barriers ?? barrierCount(setup);

/**
 * @param {Partial<RealmSetup>|null} [setup]
 * @returns {boolean} Whether the setup rolls a typical Realm (p14), every part of it.
 */
export function isBookSetup(setup) {
	const own = normaliseRealmSetup(setup);
	const numbers = (value) => [value.cols, value.rows, value.cluster, value.lakes, value.holdings, value.myths,
		value.landmarks.min, value.landmarks.max, JSON.stringify(value.landmarks.types ?? {}), setupBarriers(value)].join();
	return SETUP_PARTS.every((part) => own.roll[part]) && numbers(own) === numbers(BOOK_SETUP);
}
