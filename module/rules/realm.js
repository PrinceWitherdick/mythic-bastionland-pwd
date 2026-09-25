/**
 * What a Realm holds (Creating a Realm p14), and the checks every Realm tool
 * shares. Plain data and functions, so they can be tested without Foundry.
 * Names for each key live under `bastionland.realm`.
 */
import { isDie, isTableRoll, rollLabel, spreadPages } from "./book-art.js";
import { hexDistance, hexIndex, hexKey, inRealm, parseEdgeKey, sameHex } from "./realm-geometry.js";

export const REALM_VERSION = 1;

/** The flag key a Realm's Scene and documents carry under the system's scope. */
export const REALM_FLAG = "realm";

/** Terrain in the Realm Sheet's d12 order. */
export const TERRAIN = Object.freeze([
	"marsh", "heath", "crag", "peaks", "forest", "valley", "hills", "meadow", "bog", "lake", "glade", "plains"
]);

/** The d12 result for Lake. */
export const LAKE = TERRAIN.indexOf("lake") + 1;

export const HOLDING_STYLES = Object.freeze(["castle", "town", "fortress", "tower"]);

export const LANDMARK_TYPES = Object.freeze(["dwelling", "sanctum", "monument", "hazard", "curse", "ruin"]);

export const HOLDING_COUNT = 4;

export const MYTH_COUNT = 6;

export const OMEN_COUNT = 6;

/**
 * River pieces, each drawn from the hex's south edge: straight across, a gentle bend, a sharp bend, a spring,
 * and the forks where a branch meets the river. realm-rivers.js says which edges each reaches.
 */
export const RIVER_SHAPES = Object.freeze(["straight", "bend", "sharp", "end", "fork-left", "fork-right", "fork-wide", "fan"]);

/** "A typical Realm has 3 or 4 of each type of Landmark." */
export const LANDMARKS_PER_TYPE = Object.freeze({ min: 3, max: 4 });

/** The GM's Realm tools, in the order the controls list them. Names live under `bastionland.realm.tools`. */
export const REALM_TOOLS = Object.freeze(["inspect", "terrain", "wilderness", "reroll", "appearance", "picture"]);

/**
 * What the paint tool lays, all picked from its one palette: a terrain, the
 * river, a Barrier along an edge, a Holding or a Landmark. Names live under
 * `bastionland.realm.brushes`.
 */
export const REALM_BRUSHES = Object.freeze(["terrain", "river", "barrier", "holding", "landmark"]);

/** Each Realm tool's icon, and each brush's, which the paint tool lays. */
export const REALM_TOOL_ICONS = Object.freeze({
	inspect: "fa-solid fa-magnifying-glass",
	terrain: "fa-solid fa-paintbrush",
	river: "fa-solid fa-water",
	barrier: "fa-solid fa-road-barrier",
	holding: "fa-solid fa-chess-rook",
	landmark: "fa-solid fa-monument",
	wilderness: "fa-solid fa-tree",
	reroll: "fa-solid fa-dice",
	appearance: "fa-solid fa-palette",
	picture: "fa-solid fa-image"
});

/** The Realm tools that act at once rather than waiting for a click on the map. */
export const REALM_BUTTONS = Object.freeze(["wilderness", "reroll", "appearance", "picture"]);

/** Why part of a Realm needs a second look. */
export const REALM_PROBLEMS = Object.freeze([
	"terrain", "offMap", "crowded", "river", "edge", "duplicate", "number", "roll", "omen", "style", "type", "seat"
]);

/**
 * "Place a number of Barriers equal to one sixth of your total Hexes."
 * @param {{cols: number, rows: number}} g
 * @returns {number}
 */
export const barrierCount = (g) => Math.floor((g.cols * g.rows) / 6);

/** @typedef {{col: number, row: number}} Hex */

/**
 * @typedef {object} Realm
 * @property {number} cols
 * @property {number} rows
 * @property {string|null} seed
 * @property {number[]} terrain   One entry per hex in `hexIndex` order: 1-12, or 0 where unset.
 * @property {Hex[][]} rivers      Each from one end to the other, each hex beside the one before. One that starts or ends on a
 *   hex of another joins it there. The book makes no one of them the navigable one.
 * @property {{id: string|null, hex: Hex, style: string, seat: boolean, name: string}[]} holdings
 * @property {{id: string|null, hex: Hex, number: number, d6: number, d12: number, omen: number, revealed: boolean}[]} myths
 * @property {{id: string|null, hex: Hex, type: string, name: string, seer: {d6: number, d12: number}|null,
 *   revealed: boolean}[]} landmarks  `seer` is the roll for a Sanctum's Seer on the Knights table (p26).
 * @property {{id: string|null, edge: string, revealed: boolean}[]} barriers
 * @property {import("./realm-setup.js").RealmSetup} [setup] How it was set up, where that wasn't the book's way.
 * @property {import("./realm-map.js").RealmPicture} [picture] The pictures a Realm traced from a map drawn on paper
 *   is drawn by, in place of the system's own ink.
 */

/**
 * @param {{cols: number, rows: number}} g
 * @param {string|null} [seed]
 * @returns {Realm}
 */
export function emptyRealm(g, seed = null) {
	return {
		cols: g.cols,
		rows: g.rows,
		seed,
		terrain: new Array(g.cols * g.rows).fill(0),
		rivers: [],
		holdings: [],
		myths: [],
		landmarks: [],
		barriers: []
	};
}

/**
 * @param {Realm} realm
 * @param {object} g
 * @param {Hex} hex
 * @returns {number} 1-12, or 0 off the Realm or where unset.
 */
export const terrainAt = (realm, g, hex) => (inRealm(g, hex) ? realm.terrain[hexIndex(g, hex)] ?? 0 : 0);

/**
 * @param {Realm} realm
 * @param {Hex} hex
 * @returns {{holding: object|null, myth: object|null, landmark: object|null}}
 */
export function featureAt(realm, hex) {
	const on = (list) => list.find((item) => sameHex(item.hex, hex)) ?? null;
	return { holding: on(realm.holdings), myth: on(realm.myths), landmark: on(realm.landmarks) };
}

/**
 * What someone looking at a hex can see of it. Players see a Myth or Landmark
 * only once it's revealed, and nothing of the hex the GM has hidden by hand.
 * @param {Realm} realm
 * @param {object} g
 * @param {Hex} hex
 * @param {object} [options]
 * @param {boolean} [options.showHidden] For GMs.
 * @param {{terrain?: boolean, holding?: boolean, seat?: boolean}} [options.hiddenByHand] The hex's Tiles the GM has hidden, from hiddenByHand.
 * @returns {{hex: Hex, terrain: string|null, terrainRevealed: boolean, holding: {style: string, name: string, seat: boolean, revealed: boolean}|null,
 *   myth: {number: number, revealed: boolean}|null, landmark: {type: string, name: string, revealed: boolean}|null}}
 */
export function hexSummary(realm, g, hex, { showHidden = false, hiddenByHand = {} } = {}) {
	const { holding, myth, landmark } = featureAt(realm, hex);
	const terrain = terrainAt(realm, g, hex);
	const hand = { terrain: Boolean(hiddenByHand.terrain), holding: Boolean(hiddenByHand.holding), seat: Boolean(holding?.seat && hiddenByHand.seat) };
	return {
		hex,
		terrain: terrain && (showHidden || !hand.terrain) ? TERRAIN[terrain - 1] ?? null : null,
		terrainRevealed: !hand.terrain,
		holding:
			holding && (showHidden || !hand.holding)
				? { style: holding.style, name: holding.name ?? "", seat: Boolean(holding.seat) && (showHidden || !hand.seat), revealed: !hand.holding && !hand.seat }
				: null,
		myth: myth && (showHidden || myth.revealed) ? { number: myth.number, revealed: Boolean(myth.revealed) } : null,
		landmark: landmark && (showHidden || landmark.revealed) ? { type: landmark.type, name: landmark.name ?? "", revealed: Boolean(landmark.revealed) } : null
	};
}

/**
 * @param {{d6: number, d12: number}} roll A Myth's roll on the Myths table (p27).
 * @returns {{roll: string, page: number}}
 */
export const mythReference = ({ d6, d12 }) => ({ roll: rollLabel(d6, d12), page: spreadPages(d6, d12).myth });

/**
 * @param {{d6: number, d12: number}} roll A Sanctum's roll on the Knights table (p26), whose page shows the Seer.
 * @returns {{roll: string, page: number}}
 */
export const seerReference = ({ d6, d12 }) => ({ roll: rollLabel(d6, d12), page: spreadPages(d6, d12).knight });

/**
 * Everything about a Realm that doesn't fit the rules above, for the Hex
 * panel to point out. Nothing here is fatal: the map still works.
 * @param {Realm} realm
 * @param {object} g
 * @returns {{kind: string, reason: string, key: string}[]} `key` names the hex, edge or number concerned.
 */
export function validateRealm(realm, g) {
	const problems = [];
	const report = (kind, reason, key) => problems.push({ kind, reason, key: String(key) });

	// Terrain left to draw by hand may not all be drawn yet.
	const unpainted = realm.setup?.roll?.terrain === false;
	realm.terrain.forEach((terrain, index) => {
		if (unpainted && terrain === 0) return;
		if (!isDie(terrain, TERRAIN.length)) report("terrain", "terrain", hexKey({ col: (index % g.cols) + 1, row: Math.floor(index / g.cols) + 1 }));
	});

	for (const course of realm.rivers) {
		const seen = new Set();
		course.forEach((hex, index) => {
			const key = hexKey(hex);
			if (!inRealm(g, hex)) report("river", "offMap", key);
			else if (seen.has(key)) report("river", "duplicate", key);
			else if (index > 0 && hexDistance(g, course[index - 1], hex) !== 1) report("river", "river", key);
			seen.add(key);
		});
	}

	const featuresOnHex = new Map();
	const place = (kind, hex) => {
		const key = hexKey(hex);
		if (!inRealm(g, hex)) report(kind, "offMap", key);
		featuresOnHex.set(key, (featuresOnHex.get(key) ?? 0) + 1);
	};

	for (const holding of realm.holdings) {
		place("holding", holding.hex);
		if (!HOLDING_STYLES.includes(holding.style)) report("holding", "style", hexKey(holding.hex));
	}
	const seats = realm.holdings.filter((holding) => holding.seat).length;
	if (realm.holdings.length && seats !== 1) report("holding", "seat", seats);

	const numbers = new Set();
	for (const myth of realm.myths) {
		place("myth", myth.hex);
		if (!isDie(myth.number, MYTH_COUNT)) report("myth", "number", myth.number);
		else if (numbers.has(myth.number)) report("myth", "duplicate", myth.number);
		numbers.add(myth.number);
		if (!isTableRoll(myth)) report("myth", "roll", myth.number);
		if (!Number.isInteger(myth.omen) || myth.omen < 0 || myth.omen > OMEN_COUNT) report("myth", "omen", myth.number);
	}

	for (const landmark of realm.landmarks) {
		place("landmark", landmark.hex);
		if (!LANDMARK_TYPES.includes(landmark.type)) report("landmark", "type", hexKey(landmark.hex));
		if (landmark.seer && !isTableRoll(landmark.seer)) report("landmark", "roll", hexKey(landmark.hex));
	}

	for (const [key, count] of featuresOnHex) {
		if (count > 1) report("hex", "crowded", key);
	}

	const edges = new Set();
	for (const { edge } of realm.barriers) {
		const hexes = parseEdgeKey(g, edge);
		if (!hexes || !hexes.every((hex) => inRealm(g, hex))) report("barrier", "edge", edge);
		else if (edges.has(edge)) report("barrier", "duplicate", edge);
		edges.add(edge);
	}

	return problems;
}
