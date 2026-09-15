import { forgetRealm, getRealm, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { refreshRealmPanel } from "../apps/RealmPanel.js";
import { t } from "../chat/cards.js";
import { movePathProblem } from "../rules/realm-movement.js";
import { attachHexReadout, detachHexReadout, updateHexReadout } from "./hex-readout.js";

/**
 * Refuse a Token's move across a Barrier (p18) or off the edge of a Realm. It
 * runs on the mover's own client before the move is sent. A GM with Foundry's
 * Unconstrained Movement on, which lets Tokens through walls, passes Barriers
 * too.
 * @param {TokenDocument} token
 * @param {object} movement The pending movement from `preMoveToken`.
 * @returns {boolean} False to refuse the move.
 */
function allowRealmMove(token, movement) {
	const scene = token?.parent;
	if (!isRealmScene(scene) || movement?.constrainOptions?.ignoreWalls) return true;
	const entry = getRealm(scene);
	if (!entry) return true;

	const waypoints = [movement.origin, ...(movement.passed?.waypoints ?? []), ...(movement.pending?.waypoints ?? [])].filter(Boolean);
	const points = waypoints.map((waypoint) => token.getCenterPoint(waypoint));
	const barriers = new Set(entry.realm.barriers.map((barrier) => barrier.edge));
	const problem = movePathProblem(sceneGeometry(scene), barriers, points);
	if (!problem) return true;

	ui.notifications.warn(t(`realm.movement.${problem.reason}`));
	return false;
}

/** Scenes whose Realm changed since the Hex panel, readout and highlight were last drawn. */
const changedScenes = new Set();

/** Draw the Hex panel, readout and highlight again for the Realms that changed. */
function showChanges() {
	for (const sceneId of changedScenes) {
		refreshRealmPanel(sceneId);
		if (sceneId === canvas?.scene?.id) {
			updateHexReadout({ force: true });
			canvas.realm?.refreshHighlight();
		}
	}
	changedScenes.clear();
}

/**
 * Read a Scene's Realm again, and show the change under the pointer. A Reroll
 * or Tidy writes many documents at once, each with its own hook, so drawing
 * waits until the whole batch has landed.
 * @param {string|undefined} sceneId
 */
function realmChanged(sceneId) {
	forgetRealm(sceneId);
	if (!sceneId) return;
	if (!changedScenes.size) setTimeout(showChanges, 0);
	changedScenes.add(sceneId);
}

/** The hooks Realm Scenes rely on. Called during init. */
export function registerRealmHooks() {
	Hooks.on("preMoveToken", allowRealmMove);

	// A Realm is read from its Tiles and Drawings, so any change to them means reading it again.
	const onDocument = (document) => realmChanged(document.parent?.id);
	for (const name of ["createTile", "updateTile", "deleteTile", "createDrawing", "updateDrawing", "deleteDrawing"]) {
		Hooks.on(name, onDocument);
	}
	Hooks.on("updateScene", (scene) => realmChanged(scene.id));
	Hooks.on("deleteScene", (scene) => forgetRealm(scene.id));

	Hooks.on("canvasReady", () => attachHexReadout());
	Hooks.on("canvasTearDown", () => detachHexReadout());
}
