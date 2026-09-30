/**
 * Cruise (Travel, p18): 3 Hexes in a Phase, by boat or by steed along one of
 * the Realm's few proper roads. A boat goes by the Realm's rivers and lakes; a road
 * is marked hex by hex by the Referee, since the book leaves where roads run to
 * them. Neither passes a Barrier. Pure, so it can be tested without Foundry.
 */
import { LAKE, terrainAt } from "./realm.js";
import { allHexes, edgeKey, hexIndex, hexKey, inRealm, neighbours } from "./realm-geometry.js";

/** How far a Cruise goes in a Phase. */
export const CRUISE_HEXES = 3;

/**
 * The hexes a boat can go by: every hex a river runs through, and every lake.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @returns {Set<string>} By hexKey.
 */
export function waterways(realm, g) {
	const ways = new Set();
	for (const course of realm.rivers ?? []) for (const hex of course) if (inRealm(g, hex)) ways.add(hexKey(hex));
	for (const hex of allHexes(g)) if (terrainAt(realm, g, hex) === LAKE) ways.add(hexKey(hex));
	return ways;
}

/**
 * Every hex reachable from `from` within CRUISE_HEXES steps, going only by the
 * hexes given and never across a Barrier.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} from
 * @param {Set<string>} ways By hexKey. `from` must be one of them.
 * @returns {{hex: {col: number, row: number}, steps: number}[]} Nearest first, `from` left out.
 */
export function reachBy(realm, g, from, ways) {
	if (!ways.has(hexKey(from))) return [];
	const barriers = new Set((realm.barriers ?? []).map((barrier) => barrier.edge));
	const seen = new Map([[hexKey(from), 0]]);
	let edge = [from];
	const reached = [];
	for (let steps = 1; steps <= CRUISE_HEXES && edge.length; steps++) {
		const next = [];
		for (const hex of edge) {
			for (const { hex: beside } of neighbours(g, hex)) {
				const key = hexKey(beside);
				if (seen.has(key) || !ways.has(key) || barriers.has(edgeKey(hex, beside))) continue;
				seen.set(key, steps);
				reached.push({ hex: beside, steps });
				next.push(beside);
			}
		}
		edge = next;
	}
	return reached.sort((a, b) => a.steps - b.steps || hexIndex(g, a.hex) - hexIndex(g, b.hex));
}

/**
 * Where a Cruise can take the Company from a hex: by boat along rivers and
 * lakes, and by steed along the roads the Referee has marked.
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} from
 * @param {string[]} [roads] Road hexes, by hexKey.
 * @returns {{boat: {hex: object, steps: number}[], road: {hex: object, steps: number}[]}}
 */
export function cruiseReach(realm, g, from, roads = []) {
	return {
		boat: reachBy(realm, g, from, waterways(realm, g)),
		road: reachBy(realm, g, from, new Set(roads))
	};
}
