import { hexLabel } from "../actions/hex-names.js";
import { getCalendar } from "../actions/calendar.js";
import { recordBarriersMet } from "../actions/hex-shared.js";
import { movesAsCompany } from "../actions/journey.js";
import { editRealm, getRealm, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { keptFromMe } from "../actions/solo.js";
import { advancePhase } from "../actions/time.js";
import { askActiveGM } from "../ask-gm.js";
import { t, warn } from "../chat/cards.js";
import { queryAsker } from "../compat.js";
import { setBarrier } from "../rules/realm-edits.js";
import { hexAt, hexKey, inRealm, parseEdgeKey, sameHex } from "../rules/realm-geometry.js";
import { barriersMet, realmMoveProblem } from "../rules/realm-movement.js";
import { SYSTEM_ID } from "../system-id.js";

/** A player's Token turned back by a Barrier, told to the active GM. */
const TURNED_BACK_QUERY = `${SYSTEM_ID}.turnedBack`;

/** The system's socket channel, open since system.json asks for one. */
const SOCKET = `system.${SYSTEM_ID}`;

/** What the GM who reveals a Barrier found tells the other GMs. */
const BARRIER_FOUND = "barrierFound";

/**
 * Tell the Referee a Barrier turned a Token back (p18). A player can't change
 * the Realm or the calendar, so their client asks the active GM's: the hidden
 * Barriers it ran into are drawn for everyone from then on, and a Company's
 * attempt offers the Phase it wasted. A GM's own client offers the Phase
 * itself, and a GM's own move leaves a hidden Barrier hidden, save in solo play.
 * @param {Scene} scene
 * @param {object} turned
 * @param {string[]} turned.edges The hidden Barriers' edge keys.
 * @param {{col: number, row: number}|null} [turned.from] The hex the Token was turned back into, where the Barrier is noted.
 * @param {{col: number, row: number}|null} [turned.to] The hex it tried to reach.
 * @param {boolean} [turned.company] Whether the Token turned back was the Company's.
 */
export function reportTurnedBack(scene, { edges, from = null, to = null, company = false }) {
	if (game.user.isGM) {
		const attempt = company ? { from, to } : null;
		// Played alone, the Referee's own Company finds the Barrier as a player's would.
		if (keptFromMe() && edges.length) {
			foundBarriers(scene, edges, game.user.name, { company: attempt, from }).catch((error) => console.error(`${SYSTEM_ID} | Couldn't show the Barrier found`, error));
			return;
		}
		if (attempt) offerWastedPhase(scene, attempt);
		return;
	}
	if (!edges.length && !company) return;
	if (!game.users.activeGM) {
		warn("realm.movement.needsGM");
		return;
	}
	askActiveGM(TURNED_BACK_QUERY, { sceneId: scene.id, edges, from, to, company: Boolean(company) }, "Couldn't tell the Referee of the Barrier");
}

/** @returns {boolean} Whether a message's hex is one. */
const isHex = (hex) => Number.isInteger(hex?.col) && Number.isInteger(hex?.row);

/**
 * What a player's report of a Token turned back holds that's true, or null
 * where it can't be. The move it names must be one every way of which is
 * barred, set off from where a Token the asker may move stands, or a move
 * away from it that nothing bars; for the Company, a Token that moves as it.
 * Only the Barriers that move runs into are taken.
 * @param {Scene} scene
 * @param {User} user Who asked.
 * @param {{edges?: unknown, from?: unknown, to?: unknown, company?: unknown}} data
 * @returns {{edges: string[], from: {col: number, row: number}, company: {from: object, to: object}|null}|null}
 */
export function turnedBackFor(scene, user, data) {
	const g = sceneGeometry(scene);
	const from = isHex(data?.from) ? { col: data.from.col, row: data.from.row } : null;
	const to = isHex(data?.to) ? { col: data.to.col, row: data.to.row } : null;
	if (!Array.isArray(data?.edges) || !inRealm(g, from) || !inRealm(g, to)) return null;
	const barriers = new Set(getRealm(scene).realm.barriers.map((barrier) => barrier.edge));
	if (realmMoveProblem(g, barriers, from, to) !== "barrier") return null;

	const company = data.company === true;
	const setOff = (token) => {
		if (!token.testUserPermission?.(user, "OWNER") || (company && !movesAsCompany(token))) return false;
		const at = hexAt(g, token.getCenterPoint());
		return inRealm(g, at) && realmMoveProblem(g, barriers, at, from) === null;
	};
	if (!scene.tokens?.some(setOff)) return null;

	const met = new Set(barriersMet(g, barriers, from, to));
	const edges = [...new Set(data.edges)].filter((edge) => typeof edge === "string" && met.has(edge));
	if (!edges.length && !company) return null;
	return { edges, from, company: company ? { from, to } : null };
}

/**
 * A player's Token turned back by a Barrier, answered by the active GM: the
 * hidden Barriers it ran into are revealed under the asker's name, and a
 * Company's attempt offers the Phase it wasted. Nothing the player sends is
 * believed that the Realm and their Tokens don't bear out.
 * @param {{sceneId?: string, edges?: unknown, from?: unknown, to?: unknown, company?: unknown}} data
 * @param {object} [context]
 * @returns {Promise<boolean>}
 */
export async function onTurnedBackQuery(data = {}, context = {}) {
	const asker = queryAsker(context);
	if (!asker || !game.user.isGM) return false;
	const scene = game.scenes.get(data?.sceneId);
	if (!isRealmScene(scene)) return false;
	const turned = turnedBackFor(scene, asker, data);
	if (!turned) return false;
	await foundBarriers(scene, turned.edges, asker.name, { from: turned.from });
	// The player isn't kept waiting while the Referee answers the Phase's end.
	if (turned.company) offerWastedPhase(scene, turned.company).catch((error) => console.error(`${SYSTEM_ID} | Couldn't offer the Phase wasted`, error));
	return true;
}

/**
 * Say who found each Barrier, and between which hexes.
 * @param {Scene} scene
 * @param {string[]} edges
 * @param {string} name
 */
function tellFound(scene, edges, name) {
	const g = sceneGeometry(scene);
	for (const edge of edges) {
		const [from, to] = parseEdgeKey(g, edge);
		ui.notifications.info(t("realm.movement.found", { name, from: hexLabel(from, scene), to: hexLabel(to, scene) }));
	}
}

/**
 * On another GM's client: the Barriers the active GM revealed, told of as they
 * were on that GM's. Only those the Realm now shows revealed are told of,
 * whatever the message says.
 * @param {{action?: string, sceneId?: unknown, edges?: unknown, name?: unknown}} message
 */
export function onBarrierFound(message) {
	if (message?.action !== BARRIER_FOUND || !game.user.isGM || !Array.isArray(message.edges) || typeof message.name !== "string" || !message.name) return;
	const scene = game.scenes.get(message.sceneId);
	if (!isRealmScene(scene)) return;
	const revealed = new Set(getRealm(scene).realm.barriers.filter((barrier) => barrier.revealed).map((barrier) => barrier.edge));
	const edges = [...new Set(message.edges)].filter((edge) => typeof edge === "string" && revealed.has(edge));
	tellFound(scene, edges, message.name.slice(0, 100));
}

/**
 * Tell of each hidden Barrier found, reveal them, note them in the hex they
 * were met from, and offer the Phase a Company's attempt wasted. Only Barriers still hidden on that Realm are taken,
 * whatever the edges given say.
 * @param {Scene} scene
 * @param {unknown[]} edges
 * @param {string} name Who ran into them.
 * @param {object} [options]
 * @param {unknown} [options.company] Where the Company tried to go, when it was the Company.
 * @param {unknown} [options.from] The hex the Token was turned back into.
 * @returns {Promise<void>}
 */
async function foundBarriers(scene, edges, name, { company = null, from = null } = {}) {
	const hidden = new Set(getRealm(scene).realm.barriers.filter((barrier) => !barrier.revealed).map((barrier) => barrier.edge));
	const found = edges.filter((edge) => hidden.has(edge));

	tellFound(scene, found, name);
	// Found by travelling, so not for Undo on the map to hide again.
	if (found.length) {
		await editRealm(scene, (realm, g) => found.reduce((next, edge) => setBarrier(next, g, edge, "revealed"), realm));
		// Every other GM is told too. The socket doesn't bring it back to this client.
		game.socket?.emit(SOCKET, { action: BARRIER_FOUND, sceneId: scene.id, edges: found, name });
	}
	const g = sceneGeometry(scene);
	// Each is kept in the players' record of the hex they stood in, which its Journal entry and their Places show.
	const stood = isHex(from) ? from : isHex(company?.from) ? company.from : null;
	const byHex = new Map();
	for (const edge of found) {
		const ends = parseEdgeKey(g, edge);
		const hex = ends.find((end) => sameHex(end, stood)) ?? ends[0];
		const key = hexKey(hex);
		if (!byHex.has(key)) byHex.set(key, { hex, edges: [] });
		byHex.get(key).edges.push(edge);
	}
	if (byHex.size) await recordBarriersMet(scene, [...byHex.values()], name);
	if (isHex(company?.from) && isHex(company?.to)) await offerWastedPhase(scene, { from: company.from, to: company.to });
}

/** Whether the Referee is already being asked, so a Company that tries again meanwhile isn't asked twice. */
let offering = false;

/**
 * A try at crossing a Barrier loses the Phase, and the Wilderness Roll is made
 * all the same (p18). The Phase's end is offered with the
 * Company travelling and what turned it back said first; closing it lets the
 * Phase stand, since a Token can be dragged across one by mistake. GMs only.
 * @param {Scene} scene
 * @param {{from: {col: number, row: number}, to: {col: number, row: number}}} tried
 * @returns {Promise<boolean>} Whether the Phase was spent.
 */
export async function offerWastedPhase(scene, { from, to }) {
	if (!game.user.isGM || offering) return false;
	offering = true;
	try {
		const phase = t(`time.phases.${getCalendar().phase}`);
		const note = t("realm.movement.wasted.text", { from: hexLabel(from, scene), to: hexLabel(to, scene), phase });
		return Boolean(await advancePhase({ scene, mode: "travel", atBarrier: true, note }));
	} finally {
		offering = false;
	}
}

/**
 * Answer players' Tokens turned back, and hear of Barriers another GM
 * revealed. Called during init: Foundry hands the game its socket before init runs.
 */
export function registerTurnedBackQuery() {
	CONFIG.queries[TURNED_BACK_QUERY] = onTurnedBackQuery;
	game.socket?.on(SOCKET, onBarrierFound);
}
