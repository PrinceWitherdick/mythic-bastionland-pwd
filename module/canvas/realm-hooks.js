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
	sceneGeometry,
	syncRealmScene
} from "../actions/realm.js";
import { TRAVELS_CHANGED_HOOK } from "../actions/hex-shared.js";
import { movesAsCompany } from "../actions/journey.js";
import { keepMapPictureSize } from "../actions/realm-map.js";
import { MAP_ALIGNMENT_HOOK, liningUpMap } from "./map-alignment.js";
import { closeCompanyButton, showCompanyButton } from "../apps/CompanyButton.js";
import { refreshHexLore } from "../apps/HexLore.js";
import { refreshMythChooser } from "../apps/MythChooser.js";
import { refreshRealmPanel } from "../apps/RealmPanel.js";
import { closeRealmDrawing, refreshRealmDrawing, showRealmDrawing } from "../apps/RealmDrawing.js";
import { closeTravelRules, showTravelRules } from "../apps/TravelRules.js";
import { t } from "../chat/cards.js";
import { barriersMet, movePathProblem } from "../rules/realm-movement.js";
import { REALM_DRAWING_FLAG } from "../rules/realm-drawing.js";
import { SYSTEM_ID } from "../system-id.js";
import { listenForTurnedBack, reportTurnedBack } from "./barrier-found.js";
import { forgetHexArrivals, offerWaitingArrival, registerHexPrompt } from "./hex-prompt.js";
import { attachHexReadout, detachHexReadout, registerHexReadoutSetting, updateHexReadout } from "./hex-readout.js";
import { drawSightedMarks } from "./sighted-marks.js";
import { registerTravelsClick } from "./travels-click.js";
import { refreshTravelsButtons } from "./travels-controls.js";
import { drawVisitedMarks, registerVisitedMarksSetting } from "./visited-marks.js";

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
	const g = sceneGeometry(scene);
	const barriers = new Set(entry.realm.barriers.map((barrier) => barrier.edge));
	const problem = movePathProblem(g, barriers, points);
	if (!problem) return true;

	ui.notifications.warn(t(`realm.movement.${problem.reason}`));
	// A hidden Barrier found by walking into it isn't hidden any more, and the
	// Company's attempt wastes the Phase.
	if (problem.reason === "barrier") {
		const hidden = new Set(entry.realm.barriers.filter((barrier) => !barrier.revealed).map((barrier) => barrier.edge));
		reportTurnedBack(scene, {
			edges: barriersMet(g, barriers, problem.from, problem.to).filter((edge) => hidden.has(edge)),
			from: problem.from,
			company: movesAsCompany(token) ? { from: problem.from, to: problem.to } : null
		});
	}
	return false;
}

/** Scenes whose Realm changed since the palette, Lay of the Land, readout and highlight were last drawn. */
const changedScenes = new Set();

/** Draw the palette, Lay of the Land, readout and highlight again for the Realms that changed. */
function showChanges() {
	for (const sceneId of changedScenes) {
		refreshRealmPanel(sceneId);
		refreshHexLore(sceneId);
		refreshRealmDrawing(sceneId);
		refreshMythChooser(sceneId);
		// The players' record of where the Company has been, in whatever window or sheet shows it.
		// Not while the Realm is drawn by hand, which players don't see; finishing it updates the Scene, which comes here again.
		if (!isDrawingRealm(game.scenes.get(sceneId))) Hooks.callAll(TRAVELS_CHANGED_HOOK, sceneId);
		if (sceneId === canvas?.scene?.id) {
			updateHexReadout({ force: true });
			canvas.realm?.refreshHighlight();
			// What the Company saw from afar, which the Realm's Tiles or the Scene's marks may have changed.
			drawSightedMarks();
			drawVisitedMarks();
		}
	}
	changedScenes.clear();
}

/**
 * Read a Scene's Realm again, and show the change under the pointer. A Reroll
 * writes many documents at once, each with its own hook, and every
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
 * finished. While it's being drawn, players see neither. While the GM is
 * lining a picture up under it, they see neither either, until it's kept.
 * @returns {Promise<unknown>}
 */
function showRealmRules() {
	if (liningUpMap(canvas?.scene)) return Promise.all([closeTravelRules(), closeRealmDrawing()]);
	if (isDrawingRealm(canvas?.scene)) return Promise.all([closeTravelRules(), showRealmDrawing()]);
	return Promise.all([closeRealmDrawing(), showTravelRules()]);
}

/** The hooks Realm Scenes rely on. Called during init. */
export function registerRealmHooks() {
	Hooks.on("preMoveToken", allowRealmMove);
	// A player's Token turned back by a Barrier has the GM's client reveal it, and offer the Phase the Company wasted.
	listenForTurnedBack();

	// Whether the hex readout names the column and row as well.
	registerHexReadoutSetting();

	// The hexes the Company has been to, marked on the map for whoever wants them shown.
	registerVisitedMarksSetting();
	// A double-click on a hex opens what the Company knows of it.
	registerTravelsClick();

	// A Company coming to rest in a hex nothing has been written down for.
	registerHexPrompt();

	// An imported map keeps its size: its Tile may be moved, but not sized.
	Hooks.on("preUpdateTile", keepMapPictureSize);
	// The rules beside the map wait while a picture is lined up under it, and come back once it's kept or put back.
	Hooks.on(MAP_ALIGNMENT_HOOK, (_active, scene) => {
		if (scene?.id === canvas?.scene?.id) showRealmRules();
	});

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
	// The Undo and Redo buttons of the palette, of Edit this hex and of Creating a Realm.
	// After an edit, the Realm's change still to be shown draws them all anyway.
	Hooks.on(REALM_HISTORY_HOOK, (sceneId) => {
		if (changedScenes.has(sceneId)) return;
		refreshRealmPanel(sceneId);
		refreshHexLore(sceneId);
		refreshRealmDrawing(sceneId);
	});
	// The swatches, in the palette and in Creating a Realm, show the pictures the Realm is drawn with.
	Hooks.on(REALM_LOOK_HOOK, (sceneId) => {
		if (!sceneId) return;
		refreshRealmPanel(sceneId);
		refreshRealmDrawing(sceneId);
	});

	// The hex readout, and Travel and Exploration beside the map. The rules stay
	// up from one Realm Scene to the next: `canvasTearDown` is told only which
	// canvas is going, not what follows it, so nothing is taken down until the
	// canvas has settled on the Scene that follows. Foundry settles on that Scene,
	// or on none at all, before this turn of the event loop is out, and a canvas
	// with no Scene never becomes ready, so waiting here rather than leaving it to
	// `canvasReady` is what clears the rules away with the last Scene.
	Hooks.on("canvasReady", () => {
		attachHexReadout();
		drawSightedMarks();
		drawVisitedMarks();
		// Their show-or-hide and the Places window, beside the sidebar.
		refreshTravelsButtons();
		showRealmRules();
		// Where the Company got to while the GM was looking at another Scene.
		offerWaitingArrival();
		// And, for a Realm with no Company on it, the button that hands the Referee one.
		showCompanyButton();
		// Put right anything that drifted on the Scene's own layers, quietly: it writes nothing on a Realm in order.
		syncRealmScene(canvas?.scene).catch((error) => console.error(`${SYSTEM_ID} | Couldn't put the Realm Scene back in order`, error));
	});
	Hooks.on("canvasTearDown", () => {
		detachHexReadout();
		setTimeout(() => {
			if (!isRealmScene(canvas?.scene)) {
				closeTravelRules();
				closeRealmDrawing();
				closeCompanyButton();
				refreshTravelsButtons();
			}
		}, 0);
	});
}
