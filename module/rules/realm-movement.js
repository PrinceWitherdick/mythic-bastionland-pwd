/**
 * Moving across a Realm. A Barrier can't be crossed by ordinary means (p18), and nobody walks off the edge of the map. Pure, so it can be tested
 * without Foundry.
 */
import { edgeKey, hexAt, hexDistance, hexKey, hexLine, inRealm, neighbours, sameHex } from "./realm-geometry.js";

/** Why a move is refused. Wording lives under `bastionland.realm.movement`. */
export const MOVE_PROBLEMS = Object.freeze(["offMap", "barrier"]);

/**
 * Whether a move between two hexes is allowed. A Knight who moves more than one
 * hex at once may take any of the shortest ways there, so the move is refused
 * only when every one of them crosses a Barrier. Going the long way round, a
 * hex at a time, is still allowed.
 * @param {object} g From realmGeometry.
 * @param {Set<string>} barriers Edge keys.
 * @param {{col: number, row: number}|null} from Null for a token not yet on the Realm.
 * @param {{col: number, row: number}|null} to
 * @returns {"offMap"|"barrier"|null}
 */
export function realmMoveProblem(g, barriers, from, to) {
	if (!inRealm(g, to)) return "offMap";
	if (!inRealm(g, from) || sameHex(from, to)) return null;
	return shortestWays(g, barriers, from, to).blocked ? "barrier" : null;
}

/**
 * The Barriers a move between two hexes runs into: each one across the
 * shortest ways there that the Company gets as far as, and so finds by trying.
 * @param {object} g From realmGeometry.
 * @param {Set<string>} barriers Edge keys.
 * @param {{col: number, row: number}|null} from
 * @param {{col: number, row: number}|null} to
 * @returns {string[]} Edge keys.
 */
export function barriersMet(g, barriers, from, to) {
	if (!inRealm(g, from) || !inRealm(g, to) || sameHex(from, to)) return [];
	return shortestWays(g, barriers, from, to).met;
}

/**
 * Walk every shortest way from one hex of a Realm to another, a hex at a time.
 * @returns {{blocked: boolean, met: string[]}} Whether every way is barred, and the Barriers found on the way.
 */
function shortestWays(g, barriers, from, to) {
	const distance = hexDistance(g, from, to);
	const met = new Set();
	// Each hex reached, by its key, with the hex it was first reached from.
	const cameFrom = new Map();
	let reached = [from];
	for (let step = 1; step <= distance; step++) {
		const next = new Map();
		for (const hex of reached) {
			for (const { hex: beside } of neighbours(g, hex)) {
				if (hexDistance(g, beside, to) !== distance - step) continue;
				const edge = edgeKey(hex, beside);
				if (barriers.has(edge)) {
					met.add(edge);
					continue;
				}
				const key = hexKey(beside);
				if (next.has(key)) continue;
				next.set(key, beside);
				cameFrom.set(key, hex);
			}
		}
		if (!next.size) return { blocked: true, met: [...met] };
		reached = [...next.values()];
	}
	const way = [];
	for (let hex = to; hex && !sameHex(hex, from); hex = cameFrom.get(hexKey(hex))) way.unshift(hex);
	return { blocked: false, met: [...met], way };
}

/**
 * The hexes a walked move between two hexes comes into: the straight line
 * where no Barrier crosses it, otherwise the first of the shortest ways round
 * that crosses none, since that is the way a move let past a Barrier went
 * (realmMoveProblem). Where every shortest way is barred, as a move the Company
 * didn't choose may be, the straight line still.
 * @param {object} g From realmGeometry.
 * @param {Set<string>|null} barriers Edge keys.
 * @param {{col: number, row: number}} from
 * @param {{col: number, row: number}} to
 * @returns {{col: number, row: number}[]} From the hex after `from` up to and including `to`.
 */
export function openWay(g, barriers, from, to) {
	const line = hexLine(g, from, to);
	if (!barriers?.size || line.every((hex, index) => !barriers.has(edgeKey(index ? line[index - 1] : from, hex)))) return line;
	return shortestWays(g, barriers, from, to).way ?? line;
}

/**
 * Check a whole move, waypoint by waypoint.
 * @param {object} g
 * @param {Set<string>} barriers Edge keys.
 * @param {{x: number, y: number}[]} points The centre of the token at the start and at each waypoint.
 * @returns {{reason: string, from: {col: number, row: number}|null, to: {col: number, row: number}|null}|null}
 *   The first refused step, or null when the move is allowed.
 */
export function movePathProblem(g, barriers, points) {
	for (let index = 1; index < points.length; index++) {
		const from = hexAt(g, points[index - 1]);
		const to = hexAt(g, points[index]);
		const reason = realmMoveProblem(g, barriers, from, to);
		if (reason) return { reason, from, to };
	}
	return null;
}
