import {
	REALM_HISTORY_HOOK,
	REALM_LOOK_FLAG,
	REALM_LOOK_HOOK,
	forgetRealm,
	forgetRealmHistory,
	getRealm,
	isDrawingRealm,
	isRealmScene,
	realmWritesSettled,
	sceneGeometry
} from "../actions/realm.js";
import { refreshHexLore } from "../apps/HexLore.js";
import { refreshRealmPanel } from "../apps/RealmPanel.js";
import { closeRealmDrawing, refreshRealmDrawing, showRealmDrawing } from "../apps/RealmDrawing.js";
import { closeTravelRules, showTravelRules } from "../apps/TravelRules.js";
import { t } from "../chat/cards.js";
import { movePathProblem } from "../rules/realm-movement.js";
import { REALM_DRAWING_FLAG } from "../rules/realm-drawing.js";
import { SYSTEM_ID } from "../system-id.js";
import { forgetHexArrivals, registerHexPrompt } from "./hex-prompt.js";
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
		refreshHexLore(sceneId);
		refreshRealmDrawing(sceneId);
		if (sceneId === canvas?.scene?.id) {
			updateHexReadout({ force: true });
			canvas.realm?.refreshHighlight();
		}
	}
	changedScenes.clear();
}

/**
 * Read a Scene's Realm again, and show the change under the pointer. A Reroll
 * or Tidy writes many documents at once, each with its own hook, and every
 * edit writes the Scene's flag before its documents, so drawing waits until
 * this client's Realm writes have all landed.
 * @param {string|undefined} sceneId
 */
function realmChanged(sceneId) {
	forgetRealm(sceneId);
	if (!sceneId) return;
	if (!changedScenes.size) realmWritesSettled().then(() => setTimeout(showChanges, 0));
	changedScenes.add(sceneId);
}

/**
 * Show the rules beside the Realm on the canvas: Creating a Realm for a GM
 * while it's still being drawn by hand, and Travel and Exploration once it's
 * finished. While it's being drawn, players see neither.
 * @returns {Promise<unknown>}
 */
function showRealmRules() {
	if (isDrawingRealm(canvas?.scene)) return Promise.all([closeTravelRules(), showRealmDrawing()]);
	return Promise.all([closeRealmDrawing(), showTravelRules()]);
}

/** The hooks Realm Scenes rely on. Called during init. */
export function registerRealmHooks() {
	Hooks.on("preMoveToken", allowRealmMove);

	// A Company coming to rest in a hex nothing has been written down for.
	registerHexPrompt();

	// A Realm is read from its Tiles and Drawings, so any change to them means reading it again.
	const onDocument = (document) => realmChanged(document.parent?.id);
	for (const name of ["createTile", "updateTile", "deleteTile", "createDrawing", "updateDrawing", "deleteDrawing"]) {
		Hooks.on(name, onDocument);
	}
	Hooks.on("updateScene", (scene, changes) => {
		realmChanged(scene.id);
		if (foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.${REALM_LOOK_FLAG}`)) Hooks.callAll(REALM_LOOK_HOOK, scene.id);
		// A Realm finished drawing swaps its rules back to Travel and Exploration, on every client.
		if (scene.id === canvas?.scene?.id && foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.${REALM_DRAWING_FLAG}`)) showRealmRules();
	});
	Hooks.on("deleteScene", (scene) => {
		forgetRealm(scene.id);
		forgetRealmHistory(scene.id);
		forgetHexArrivals(scene.id);
	});
	// The Hex panel's Undo and Redo buttons.
	Hooks.on(REALM_HISTORY_HOOK, (sceneId) => refreshRealmPanel(sceneId));
	// The terrain brush shows the pictures the Realm is drawn with.
	Hooks.on(REALM_LOOK_HOOK, (sceneId) => sceneId && refreshRealmPanel(sceneId));

	// The hex readout, and Travel and Exploration beside the map. The rules stay
	// up from one Realm Scene to the next: `canvasTearDown` is told only which
	// canvas is going, not what follows it, so nothing is taken down until the
	// canvas has settled on the Scene that follows. Foundry settles on that Scene,
	// or on none at all, before this turn of the event loop is out, and a canvas
	// with no Scene never becomes ready, so waiting here rather than leaving it to
	// `canvasReady` is what clears the rules away with the last Scene.
	Hooks.on("canvasReady", () => {
		attachHexReadout();
		showRealmRules();
	});
	Hooks.on("canvasTearDown", () => {
		detachHexReadout();
		setTimeout(() => {
			if (!isRealmScene(canvas?.scene)) {
				closeTravelRules();
				closeRealmDrawing();
			}
		}, 0);
	});
}
