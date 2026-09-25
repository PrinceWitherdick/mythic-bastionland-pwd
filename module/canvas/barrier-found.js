import { editRealm, getRealm, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { t } from "../chat/cards.js";
import { setBarrier } from "../rules/realm-edits.js";
import { parseEdgeKey } from "../rules/realm-geometry.js";
import { SYSTEM_ID } from "../system-id.js";

/** The system's socket channel, open since system.json asks for one. */
const SOCKET = `system.${SYSTEM_ID}`;

/** What a player's client sends when their Company runs into hidden Barriers. */
const BARRIERS_FOUND = "barriersFound";

/**
 * Tell the GMs a player's Company ran into Barriers nobody knew were there. A
 * player can't change the Realm, so their client asks the GMs': the Barriers
 * are drawn for everyone from then on, and each GM is told. Socket messages
 * don't come back to the sender, so this is for players alone; a GM's own move
 * leaves a hidden Barrier hidden.
 * @param {Scene} scene
 * @param {string[]} edges The hidden Barriers' edge keys.
 */
export function reportBarriersFound(scene, edges) {
	if (game.user.isGM || !edges.length) return;
	game.socket.emit(SOCKET, { action: BARRIERS_FOUND, sceneId: scene.id, edges, userId: game.user.id });
}

/**
 * @param {{col: number, row: number}} hex
 * @returns {string} "Column 5, Row 7"
 */
const hexName = (hex) => t("realm.hex", hex);

/**
 * On a GM's client: tell them of each Barrier found, and have the active GM
 * reveal them. Only Barriers still hidden on that Realm are taken, whatever
 * the message says.
 * @param {{action?: string, sceneId?: string, edges?: unknown, userId?: string}} message
 * @returns {Promise<void>}
 */
export async function onBarriersFound(message) {
	if (message?.action !== BARRIERS_FOUND || !game.user.isGM || !Array.isArray(message.edges)) return;
	const scene = game.scenes.get(message.sceneId);
	if (!isRealmScene(scene)) return;
	const hidden = new Set(getRealm(scene).realm.barriers.filter((barrier) => !barrier.revealed).map((barrier) => barrier.edge));
	const found = message.edges.filter((edge) => hidden.has(edge));
	if (!found.length) return;

	const name = game.users.get(message.userId)?.name ?? t("realm.movement.someone");
	const g = sceneGeometry(scene);
	for (const edge of found) {
		const [from, to] = parseEdgeKey(g, edge);
		ui.notifications.info(t("realm.movement.found", { name, from: hexName(from), to: hexName(to) }));
	}
	if (!game.users.activeGM?.isSelf) return;
	await editRealm(scene, (realm, g) => found.reduce((next, edge) => setBarrier(next, g, edge, "revealed"), realm));
}

/** Listen for Barriers found. Called during init: Foundry hands the game its socket before init runs. */
export function listenForBarriersFound() {
	game.socket?.on(SOCKET, onBarriersFound);
}
