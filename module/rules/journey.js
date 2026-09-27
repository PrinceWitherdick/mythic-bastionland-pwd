/**
 * Where the Company has been on a Realm. A Hex the Company comes back to should
 * hold what it held the first time (p19), so the GM needs to find the hexes
 * already walked, and what was made of each, without hunting the map for them.
 * Each hex the Company comes into remembers how often it has, and when it first
 * and last did. Pure, so it can be tested without Foundry.
 */
import { normaliseWhen } from "./hex-lore.js";
import { hexDistance, hexKey, hexLine, parseHexKey, sameHex } from "./realm-geometry.js";

export const JOURNEY_VERSION = 1;

/**
 * How a Token's move is walked, as Foundry names it. Only these follow the
 * ground between where the Token set off and where it stopped; a Token placed
 * from its configuration, pasted, or moved by a script simply turns up at the
 * end, so only that hex counts.
 */
export const WALKED_METHODS = Object.freeze(["dragging", "keyboard"]);

/**
 * @typedef {import("./hex-lore.js").HexSpark["when"]} When
 */

/**
 * @typedef {object} Arrival
 * @property {When} when   The world's calendar then, or null when it wasn't known.
 * @property {number} order Counts up with each hex come into, across the whole Realm,
 *   so the hex reached last sorts first whatever the calendar says. Also names the
 *   arrival, so one can be forgotten on its own. A whole number, save for the
 *   arrivals read out of a record kept before each was.
 */

/**
 * @typedef {object} HexVisits
 * @property {number} count  How many times the Company has come into the hex.
 * @property {Arrival} first
 * @property {Arrival} last
 * @property {Arrival[]} arrivals Each time it came in, oldest first. Count, first and last
 *   are read from these, and kept beside them for anything reading the older record.
 */

/**
 * @typedef {object} Journey
 * @property {number} version
 * @property {number} next  The order the next hex come into takes.
 * @property {Record<string, HexVisits>} hexes Keyed by `hexKey`, such as "5,7".
 */

/** @returns {Journey} */
export const emptyJourney = () => ({ version: JOURNEY_VERSION, next: 1, hexes: {} });

/** @returns {number} A whole number of at least `least`, or `least` for anything else. */
const atLeast = (value, least) => (Number.isInteger(value) && value >= least ? value : least);

/**
 * @param {unknown} raw
 * @returns {Arrival|null}
 */
function normaliseArrival(raw) {
	if (!raw || typeof raw !== "object") return null;
	const order = Number.isFinite(raw.order) && raw.order >= 0 ? raw.order : 0;
	return { when: normaliseWhen(raw.when), order };
}

/**
 * A hex's visits from its arrivals, however few are left.
 * @param {Arrival[]} arrivals Oldest first.
 * @returns {HexVisits|null} Null once none are.
 */
function fromArrivals(arrivals) {
	if (!arrivals.length) return null;
	return { count: arrivals.length, first: arrivals[0], last: arrivals.at(-1), arrivals };
}

/**
 * The arrivals of a hex kept before each was: only the first and last are
 * known, so those between are put evenly between them, with no calendar.
 * @param {number} count
 * @param {Arrival} first
 * @param {Arrival} last
 * @returns {Arrival[]}
 */
function arrivalsBetween(count, first, last) {
	// One visit is the last: it is what the newest-first order and the next arrival go by.
	if (count === 1) return [last];
	// A record whose first and last share a moment still counted every visit, so they're
	// spread over the step before the last, where no other hex's whole-numbered arrival is.
	if (first.order >= last.order) {
		const lift = Math.max(0, (count - 1) / count - last.order);
		const orders = Array.from({ length: count }, (_, index) => last.order + lift - (count - 1 - index) / count);
		return orders.map((order, index) => ({ when: index === 0 ? first.when : index === count - 1 ? last.when : null, order }));
	}
	const step = (last.order - first.order) / (count - 1);
	const between = Array.from({ length: count - 2 }, (_, index) => ({ when: null, order: first.order + step * (index + 1) }));
	return [first, ...between, last];
}

/**
 * @param {unknown} raw
 * @returns {HexVisits|null} Null for a hex never come into.
 */
export function normaliseVisits(raw) {
	if (!raw || typeof raw !== "object") return null;
	if (Array.isArray(raw.arrivals)) {
		const arrivals = raw.arrivals.map(normaliseArrival).filter(Boolean).sort((a, b) => a.order - b.order);
		// Two arrivals can't share a moment in the Company's journey.
		return fromArrivals(arrivals.filter((arrival, index) => index === 0 || arrival.order !== arrivals[index - 1].order));
	}
	const count = atLeast(raw.count, 0);
	const first = normaliseArrival(raw.first);
	const last = normaliseArrival(raw.last) ?? first;
	if (!count || !first) return null;
	return fromArrivals(arrivalsBetween(count, first, last));
}

/**
 * A journey from whatever the Scene flag holds, however old or bad.
 * @param {unknown} raw
 * @returns {Journey}
 */
export function normaliseJourney(raw) {
	const journey = emptyJourney();
	if (!raw || typeof raw !== "object") return journey;
	const hexes = raw.hexes && typeof raw.hexes === "object" ? raw.hexes : {};
	let latest = 0;
	for (const [key, value] of Object.entries(hexes)) {
		if (!parseHexKey(key)) continue;
		const visits = normaliseVisits(value);
		if (!visits) continue;
		journey.hexes[key] = visits;
		latest = Math.max(latest, visits.last.order);
	}
	// Never behind a hex already come into, or the next one would sort among the old.
	journey.next = Math.max(atLeast(raw.next, 1), Math.floor(latest) + 1);
	return journey;
}

/**
 * @param {Journey} journey
 * @param {{col: number, row: number}} hex
 * @returns {HexVisits|null}
 */
export const visitsAt = (journey, hex) => journey?.hexes?.[hexKey(hex)] ?? null;

/**
 * The hexes a move comes into, in the order it comes into them: each hex it
 * reaches that isn't the one it was already in. A walked move goes in a
 * straight line from each step to the next, so it also comes into each hex that
 * line crosses on the way.
 * @param {({col: number, row: number}|null)[]} path The hex under each step of the move, null off the map.
 * @param {{col: number, row: number}|null} [from] The hex the move set off from.
 * @param {object} [options]
 * @param {object} [options.walkedAcross] The Realm's geometry, when the move was walked rather than put down at each step.
 * @returns {{col: number, row: number}[]}
 */
export function hexesEntered(path, from = null, { walkedAcross = null } = {}) {
	const entered = [];
	let here = from;
	for (const hex of path ?? []) {
		if (!hex || sameHex(hex, here)) continue;
		entered.push(...(walkedAcross && here ? hexLine(walkedAcross, here, hex) : [hex]));
		here = hex;
	}
	return entered;
}

/**
 * Count the Company coming into each hex given, one after another.
 * @param {Journey} journey
 * @param {{col: number, row: number}[]} hexes In the order they were come into.
 * @param {When} [when] The world's calendar.
 * @returns {Journey} Unchanged when there are no hexes.
 */
export function recordVisits(journey, hexes, when = null) {
	if (!hexes?.length) return journey;
	const stamp = normaliseWhen(when);
	const next = { version: JOURNEY_VERSION, next: journey.next, hexes: { ...journey.hexes } };
	for (const hex of hexes) {
		const key = hexKey(hex);
		const arrival = { when: stamp, order: next.next++ };
		next.hexes[key] = fromArrivals([...(next.hexes[key]?.arrivals ?? []), arrival]);
	}
	return next;
}

/**
 * Forget that the Company was ever in a hex, such as after the GM moved its
 * Token about while preparing.
 * @param {Journey} journey
 * @param {{col: number, row: number}} hex
 * @returns {Journey} Unchanged when the hex was never come into.
 */
export function forgetVisits(journey, hex) {
	const key = hexKey(hex);
	if (!journey.hexes[key]) return journey;
	const hexes = { ...journey.hexes };
	delete hexes[key];
	return { ...journey, hexes };
}

/**
 * Forget one time the Company came into a hex, such as a Token dragged across
 * it by mistake. Forgetting its last forgets the hex.
 * @param {Journey} journey
 * @param {{col: number, row: number}} hex
 * @param {number} order The arrival's.
 * @returns {Journey} Unchanged when the hex has no such arrival.
 */
export function forgetVisit(journey, hex, order) {
	const key = hexKey(hex);
	const before = journey.hexes[key];
	const arrivals = before?.arrivals.filter((arrival) => arrival.order !== order);
	if (!before || arrivals.length === before.arrivals.length) return journey;
	const hexes = { ...journey.hexes };
	const after = fromArrivals(arrivals);
	if (after) hexes[key] = after;
	else delete hexes[key];
	return { ...journey, hexes };
}

/**
 * @param {Journey} before
 * @param {Journey} after
 * @returns {string[]} The hexes whose visits differ, so each can be written on its own. recordVisits,
 * forgetVisit and forgetVisits replace only the entries they change, so an unchanged hex is the same object.
 */
export function changedHexes(before, after) {
	const keys = new Set([...Object.keys(before.hexes), ...Object.keys(after.hexes)]);
	return [...keys].filter((key) => before.hexes[key] !== after.hexes[key]);
}

/**
 * The hex the Company came into a hex from: the one come into just before its
 * latest arrival there, so long as it lies beside it. Going back the way you
 * came (p14) is a step back into it.
 * @param {Journey} journey
 * @param {object} g From realmGeometry.
 * @param {{col: number, row: number}} hex
 * @returns {{col: number, row: number}|null} Null when nothing was come into just before, or it lies further off.
 */
export function cameFrom(journey, g, hex) {
	const arrived = visitsAt(journey, hex)?.last.order;
	if (arrived === undefined) return null;
	let best = null;
	for (const [key, visits] of Object.entries(journey.hexes)) {
		const before = visits.arrivals.filter((arrival) => arrival.order < arrived).at(-1);
		if (before && (!best || before.order > best.order)) best = { key, order: before.order };
	}
	const from = best ? parseHexKey(best.key) : null;
	return from && hexDistance(g, from, hex) === 1 ? from : null;
}

/**
 * @param {Journey} journey
 * @returns {({hex: {col: number, row: number}, key: string} & HexVisits)[]} Every hex come into, the last reached first.
 */
export function visitedNewestFirst(journey) {
	return Object.entries(journey?.hexes ?? {})
		.map(([key, visits]) => ({ key, hex: parseHexKey(key), ...visits }))
		.sort((a, b) => b.last.order - a.last.order);
}
