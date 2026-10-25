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
import { realmSceneChanges } from "../actions/scene-changes.js";
import { HEX_NAMES_FLAG } from "../rules/hex-names.js";
import { SIGHTED_FLAG } from "../rules/sighted.js";
import { readOmens, writeOmens } from "../actions/omens.js";
import { isOwnMythEntry } from "../actions/own-myths.js";
import { forcedMove } from "../actions/company.js";
import { JOURNEY_FLAG, movesAsCompany } from "../actions/journey.js";
import { keepMapPictureSize } from "../actions/realm-map.js";
import { MAP_ALIGNMENT_HOOK, liningUpMap } from "./map-alignment.js";
import { closeCompanyButton, showCompanyButton } from "../apps/CompanyButton.js";
import { refreshMythChooser } from "../apps/MythChooser.js";
import { refreshSeerChooser } from "../apps/SeerChooser.js";
import { refreshRealmPanel } from "../apps/RealmPanel.js";
import { closeRealmDrawing, refreshRealmDrawing, showRealmDrawing } from "../apps/RealmDrawing.js";
import { closeTravelRules, showTravelRules } from "../apps/TravelRules.js";
import { refreshHexEditor } from "../apps/HexEditor.js";
import { refreshPlaces, registerTravelsViewSetting } from "../apps/TravelsPlaces.js";
import { registerVisitedMarksMenu } from "../apps/VisitedMarks.js";
import { t } from "../chat/cards.js";
import { barriersMet, movePathProblem } from "../rules/realm-movement.js";
import { REALM_DRAWING_FLAG } from "../rules/realm-drawing.js";
import { SYSTEM_ID } from "../system-id.js";
import { registerTurnedBackQuery, reportTurnedBack } from "./barrier-found.js";
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
 * too, as does a move the Company didn't choose, such as a blind drift: it
 * goes where the rules put it.
 * @param {TokenDocument} token
 * @param {object} movement The pending movement from `preMoveToken`.
 * @param {object} [operation] The update that moves it.
 * @returns {boolean} False to refuse the move.
 */
function allowRealmMove(token, movement, operation) {
	const scene = token?.parent;
	if (!isRealmScene(scene) || movement?.constrainOptions?.ignoreWalls || forcedMove(operation)) return true;
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
			to: problem.to,
			company: movesAsCompany(token)
		});
	}
	return false;
}

/**
 * Scenes whose Realm changed since the palette, Places, readout and highlight
 * were last drawn, with how far: "realm" for the Realm itself, "names" for
 * hex names, which the Realm's windows write too, and "hex" for anything else
 * kept for its hexes, which only Places, Edit this hex and the marks show,
 * and which of those per-hex flags were written.
 * @type {Map<string, {kind: "realm"|"names"|"hex", flags: Set<string>}>}
 */
const changedScenes = new Map();

/** How far each kind of change reaches, the furthest first. */
const CHANGE_REACH = ["realm", "names", "hex"];

/**
 * @param {"realm"|"names"|"hex"} kind
 * @returns {boolean} Whether a change of that kind draws the palette, with its Undo and Redo, again.
 */
const redrawsPalette = (kind) => kind !== "hex";

/** Draw the palette, Places, readout and highlight again for the Realms that changed. */
function showChanges() {
	for (const [sceneId, { kind, flags }] of changedScenes) {
		if (redrawsPalette(kind)) {
			refreshRealmPanel(sceneId);
			refreshRealmDrawing(sceneId);
			refreshMythChooser(sceneId);
			refreshSeerChooser(sceneId);
		}
		refreshHexEditor(sceneId);
		// The players' record of where the Company has been, in whatever window or sheet shows it.
		// Not while the Realm is drawn by hand, which players don't see; finishing it updates the Scene, which comes here again.
		// Meanwhile the GM's hex in Places, which shows the Realm being drawn, is drawn again alone.
		if (isDrawingRealm(game.scenes.get(sceneId))) refreshPlaces(sceneId);
		else Hooks.callAll(TRAVELS_CHANGED_HOOK, sceneId);
		if (sceneId === canvas?.scene?.id) {
			updateHexReadout({ force: true });
			if (kind === "realm") canvas.realm?.refreshHighlight();
			// What the Company saw from afar, which the Realm's Tiles or the Scene's marks may have changed,
			// and where it has been, which only its Journey changes.
			if (kind === "realm" || flags.has(SIGHTED_FLAG)) drawSightedMarks();
			if (kind === "realm" || flags.has(JOURNEY_FLAG)) drawVisitedMarks();
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
	showLater(sceneId, "realm");
}

/**
 * @param {string} sceneId
 * @returns {boolean} Whether a Realm change still to be shown will draw the Undo and Redo buttons again.
 */
function historyShownLater(sceneId) {
	const pending = changedScenes.get(sceneId);
	return Boolean(pending) && redrawsPalette(pending.kind);
}

/**
 * Show what changed of a Realm when this client's Realm writes have landed.
 * @param {string|undefined} sceneId
 * @param {"realm"|"names"|"hex"} kind
 * @param {Iterable<string>} [flags] The per-hex flags written.
 */
function showLater(sceneId, kind, flags = []) {
	if (!sceneId) return;
	if (!changedScenes.size) realmWritesSettled().then(() => setTimeout(showChanges, 0));
	const before = changedScenes.get(sceneId) ?? { kind, flags: new Set() };
	if (CHANGE_REACH.indexOf(kind) < CHANGE_REACH.indexOf(before.kind)) before.kind = kind;
	for (const flag of flags) before.flags.add(flag);
	changedScenes.set(sceneId, before);
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
	// A player's Token turned back by a Barrier has the active GM's client reveal it, and offer the Phase the Company wasted.
	registerTurnedBackQuery();

	// Whether the hex readout names the column and row as well.
	registerHexReadoutSetting();

	// The hexes the Company has been to, marked on the map for whoever wants them shown.
	registerVisitedMarksSetting();
	// Which mark, and in what colour, chosen in a window of its own.
	registerVisitedMarksMenu();
	// A double-click on a hex opens the Company's places with it chosen.
	registerTravelsClick();
	// Which page of the Company's places this browser opens on.
	registerTravelsViewSetting();

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
	// A Myth's Omens met or taken back, by any write, go on the Timeline. After the Realm is
	// forgotten above, so the row reads the hex as the write left it.
	Hooks.on("preUpdateTile", readOmens);
	Hooks.on("updateTile", writeOmens);
	// A Myth the Referee wrote is named and pictured in the windows of each Realm that holds it,
	// and among the Myths to choose from in any of them.
	const onOwnMyth = (entry) => {
		if (!isOwnMythEntry(entry)) return;
		refreshMythChooser();
		for (const scene of game.scenes ?? []) {
			if (isRealmScene(scene) && getRealm(scene)?.realm.myths.some((myth) => myth.own === entry.id)) showLater(scene.id, "names");
		}
	};
	for (const name of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry"]) Hooks.on(name, onOwnMyth);
	Hooks.on("updateScene", (scene, changes) => {
		// Nothing to read again on a Scene that isn't a Realm and hasn't been made one, or stopped being one,
		// as it does when the system's flags are deleted whole ("flags.-=mythic-bastionland").
		const { realm, system, hexFlags } = realmSceneChanges(changes);
		if (!isRealmScene(scene) && !system) return;
		// Most writes are what's kept for its hexes -- the Company's visits, a hex's notes or name --
		// which leave the Realm as it was read, and the weather, which no Realm window shows.
		if (realm) realmChanged(scene.id);
		else if (hexFlags.size) showLater(scene.id, hexFlags.has(HEX_NAMES_FLAG) ? "names" : "hex", hexFlags);
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
	// After an edit, the Realm's change still to be shown draws them all anyway; not one only
	// to what's kept for its hexes, such as a Journey, which leaves the palette as it was.
	Hooks.on(REALM_HISTORY_HOOK, (sceneId) => {
		if (historyShownLater(sceneId)) return;
		refreshRealmPanel(sceneId);
		refreshPlaces(sceneId);
		refreshHexEditor(sceneId);
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
