import { forcedMove } from "../actions/company.js";
import { movesAsCompany } from "../actions/journey.js";
import { getRealm, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { t } from "../chat/cards.js";
import { barrierEdges, hexAt, sameHex } from "../rules/realm-geometry.js";
import { barriersMet, movePathProblem } from "../rules/realm-movement.js";
import { reportTurnedBack } from "./barrier-found.js";

/**
 * Whether a move goes where it goes whatever stands in its way: a GM's with
 * Foundry's Unconstrained Movement on, which lets Tokens through walls; one the
 * Company didn't choose, such as a blind drift, which goes where the rules put
 * it; and a move taken back with Undo, which goes back where it came from.
 * @param {object} movement The pending movement from `preMoveToken`.
 * @param {object} [operation] The update that moves it.
 * @returns {boolean}
 */
export const passesBarriers = (movement, operation) =>
	movement?.method === "undo" || Boolean(movement?.constrainOptions?.ignoreWalls) || forcedMove(operation);

/**
 * Whether a player is moving the Company with no Referee here: only the active
 * Referee's client writes the journey, the visits, the pace and the arrivals, so
 * the move would go on the map with none of them kept.
 * @param {TokenDocument} token
 * @returns {boolean}
 */
const travelsUnheard = (token) => !game.user?.isGM && !game.users?.activeGM && movesAsCompany(token);

/**
 * The hexes a move came through before the leg a Barrier barred, the first
 * being where it set off, so the Referee can follow it leg by leg.
 * @param {{col: number, row: number}[]} hexes The hex of the start and of each waypoint.
 * @param {{from: object, to: object}} barred
 * @returns {{col: number, row: number}[]}
 */
function hexesBefore(hexes, { from, to }) {
	// The legs before the barred one were all let through, so the first leg like it is the one.
	const leg = hexes.findIndex((hex, index) => index > 0 && sameHex(hexes[index - 1], from) && sameHex(hex, to));
	return leg > 0 ? hexes.slice(0, leg - 1) : [];
}

/**
 * Refuse a Token's move across a Barrier (p18) or off the edge of a Realm, and
 * a player's move of the Company while no Referee is here to keep its journey.
 * It runs on the mover's own client before the move is sent.
 * @param {TokenDocument} token
 * @param {object} movement The pending movement from `preMoveToken`.
 * @param {object} [operation] The update that moves it.
 * @returns {boolean} False to refuse the move.
 */
export function allowRealmMove(token, movement, operation) {
	const scene = token?.parent;
	if (!isRealmScene(scene)) return true;
	if (travelsUnheard(token)) {
		ui.notifications.warn(t("realm.movement.travelNeedsGM"));
		return false;
	}
	if (passesBarriers(movement, operation)) return true;
	const entry = getRealm(scene);
	if (!entry) return true;

	const waypoints = [movement.origin, ...(movement.passed?.waypoints ?? []), ...(movement.pending?.waypoints ?? [])].filter(Boolean);
	const points = waypoints.map((waypoint) => token.getCenterPoint(waypoint));
	const g = sceneGeometry(scene);
	const barriers = barrierEdges(entry.realm);
	const problem = movePathProblem(g, barriers, points);
	if (!problem) return true;

	ui.notifications.warn(t(`realm.movement.${problem.reason}`));
	// A hidden Barrier found by walking into it isn't hidden any more, and the
	// Company's attempt wastes the Phase.
	if (problem.reason === "barrier") {
		const hidden = barrierEdges(entry.realm, { revealed: false });
		reportTurnedBack(scene, {
			edges: barriersMet(g, barriers, problem.from, problem.to).filter((edge) => hidden.has(edge)),
			from: problem.from,
			to: problem.to,
			via: hexesBefore(points.map((point) => hexAt(g, point)), problem),
			company: movesAsCompany(token)
		});
	}
	return false;
}
