/**
 * Moving across a Realm. "Travel through a Barrier is not normally possible"
 * (p18), and nobody walks off the edge of the map. Pure, so it can be tested
 * without Foundry.
 */
import { edgeKey, hexAt, hexDistance, hexKey, inRealm, neighbours, sameHex } from "./realm-geometry.js";

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

	const distance = hexDistance(g, from, to);
	let reached = [from];
	for (let step = 1; step <= distance; step++) {
		const next = new Map();
		for (const hex of reached) {
			for (const { hex: beside } of neighbours(g, hex)) {
				if (hexDistance(g, beside, to) !== distance - step) continue;
				if (barriers.has(edgeKey(hex, beside))) continue;
				next.set(hexKey(beside), beside);
			}
		}
		if (!next.size) return "barrier";
		reached = [...next.values()];
	}
	return null;
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
