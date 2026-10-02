import { getCalendar } from "../actions/calendar.js";
import { recordBarriersMet } from "../actions/hex-shared.js";
import { editRealm, getRealm, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { keptFromMe } from "../actions/solo.js";
import { advancePhase } from "../actions/time.js";
import { t } from "../chat/cards.js";
import { setBarrier } from "../rules/realm-edits.js";
import { hexKey, parseEdgeKey, sameHex } from "../rules/realm-geometry.js";
import { SYSTEM_ID } from "../system-id.js";

/** The system's socket channel, open since system.json asks for one. */
const SOCKET = `system.${SYSTEM_ID}`;

/** What a player's client sends when a Barrier turns their Token back. */
const TURNED_BACK = "turnedBack";

/**
 * Tell the Referee a Barrier turned a Token back (p18). A player can't change
 * the Realm or the calendar, so their client asks the GMs': the hidden
 * Barriers it ran into are drawn for everyone from then on, and a Company's
 * attempt offers the Phase it wasted. Socket messages don't come back to the
 * sender, so a GM's own client offers the Phase itself, and a GM's own move
 * leaves a hidden Barrier hidden, save in solo play.
 * @param {Scene} scene
 * @param {object} turned
 * @param {string[]} turned.edges The hidden Barriers' edge keys.
 * @param {{col: number, row: number}|null} [turned.from] The hex the Token was turned back into, where the Barrier is noted.
 * @param {{from: object, to: object}|null} [turned.company] Where the Company tried to go, when it was the Company.
 */
export function reportTurnedBack(scene, { edges, from = null, company = null }) {
	if (game.user.isGM) {
		// Played alone, the Referee's own Company finds the Barrier as a player's would.
		if (keptFromMe() && edges.length) {
			foundBarriers(scene, edges, game.user.name, { company, from }).catch((error) => console.error(`${SYSTEM_ID} | Couldn't show the Barrier found`, error));
			return;
		}
		if (company) offerWastedPhase(scene, company);
		return;
	}
	if (!edges.length && !company) return;
	game.socket.emit(SOCKET, { action: TURNED_BACK, sceneId: scene.id, edges, userId: game.user.id, ...(from ? { from } : {}), ...(company ? { company } : {}) });
}

/**
 * @param {{col: number, row: number}} hex
 * @returns {string} "Column 5, Row 7"
 */
const hexName = (hex) => t("realm.hex", hex);

/** @returns {boolean} Whether a message's hex is one. */
const isHex = (hex) => Number.isInteger(hex?.col) && Number.isInteger(hex?.row);

/**
 * On a GM's client: tell them of each hidden Barrier found, and have the active
 * GM reveal them and be offered the Phase a Company's attempt wasted. Only
 * Barriers still hidden on that Realm are taken, whatever the message says.
 * @param {{action?: string, sceneId?: string, edges?: unknown, userId?: string, company?: unknown}} message
 * @returns {Promise<void>}
 */
export async function onTurnedBack(message) {
	if (message?.action !== TURNED_BACK || !game.user.isGM || !Array.isArray(message.edges)) return;
	const scene = game.scenes.get(message.sceneId);
	if (!isRealmScene(scene)) return;
	const name = game.users.get(message.userId)?.name ?? t("realm.movement.someone");
	await foundBarriers(scene, message.edges, name, { company: message.company, from: message.from, write: Boolean(game.users.activeGM?.isSelf) });
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
 * @param {boolean} [options.write] Whether this client reveals them and offers the Phase.
 * @returns {Promise<void>}
 */
async function foundBarriers(scene, edges, name, { company = null, from = null, write = true } = {}) {
	const hidden = new Set(getRealm(scene).realm.barriers.filter((barrier) => !barrier.revealed).map((barrier) => barrier.edge));
	const found = edges.filter((edge) => hidden.has(edge));

	const g = sceneGeometry(scene);
	for (const edge of found) {
		const [from, to] = parseEdgeKey(g, edge);
		ui.notifications.info(t("realm.movement.found", { name, from: hexName(from), to: hexName(to) }));
	}
	if (!write) return;
	if (found.length) await editRealm(scene, (realm, g) => found.reduce((next, edge) => setBarrier(next, g, edge, "revealed"), realm));
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
		const note = t("realm.movement.wasted.text", { from: hexName(from), to: hexName(to), phase });
		return Boolean(await advancePhase({ scene, mode: "travel", atBarrier: true, note }));
	} finally {
		offering = false;
	}
}

/** Listen for Tokens turned back. Called during init: Foundry hands the game its socket before init runs. */
export function listenForTurnedBack() {
	game.socket?.on(SOCKET, onTurnedBack);
}
