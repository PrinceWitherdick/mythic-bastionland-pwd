import { hexLabel } from "./hex-names.js";
import { addDirectoryButton, confirmDialog, uncleanedContent } from "../apps/ui.js";
import { askToKeepRealm } from "../apps/keep-realm.js";
import { showRealmButtons } from "../apps/realm-tour.js";
import { loadArtIndex, mythEntry, seerEntry } from "../book-art/art-index.js";
import { COMPANY_PLACING_HOOK, isPlacingCompany, startCompanyPlacement } from "../canvas/company-placement.js";
import { postCard, t } from "../chat/cards.js";
import { deletionEntry, scenePaper } from "../compat.js";
import { COMPANY_STARTS, COMPANY_START_FLAG } from "../rules/company.js";
import { COMPANY_IMAGE } from "../rules/company-icons.js";
import { companyPictureContext, resolveCompanyPicture, wireCompanyPicture } from "../apps/company-picture.js";
import { randomSeed } from "../rules/random.js";
import { LANDMARKS_PER_TYPE, LANDMARK_TYPES, REALM_FLAG, holdingName, validateRealm } from "../rules/realm.js";
import { REALM_DRAWING_FLAG, drawingShortfalls } from "../rules/realm-drawing.js";
import {
	GRID_ALPHA,
	LEVEL_ID,
	hiddenByHand,
	planChanges,
	planRealmSync,
	realmFlag,
	realmFlagChanges,
	realmFromDocuments,
	realmSceneData,
	realmTextures
} from "../rules/realm-documents.js";
import { defaultRealmLook, normaliseRealmLook } from "../rules/realm-skins.js";
import { laidMapRect, normaliseRealmPicture } from "../rules/realm-map.js";
import { mapPictureContext, measurePicture, readMapLayout, readMapPictures, wireMapPictureFields } from "./realm-map.js";
import { generateRealm } from "../rules/realm-generator.js";
import { OWN_SIZE_LIMITS, SETUP_PARTS, normaliseRealmSetup } from "../rules/realm-setup.js";
import { BOOK_LAYOUT, hexAt, hexCentre, realmGeometry } from "../rules/realm-geometry.js";
import { relayRealm } from "../rules/realm-edits.js";
import { serialWrites } from "../rules/queue.js";
import { emptyHistory, recordChange, stepHistory } from "../rules/history.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { companyTokenHex, placeCompanyAtStart, restandCompany } from "./company.js";
import { announceStart } from "./starts.js";
import { setupParts, wireSetupFields } from "../apps/realm-setup-fields.js";
import { wireMapSizeFields } from "../apps/map-size-fields.js";
import { closeMapSizeWindow, openMapSizeWindow } from "../apps/map-size-window.js";
import { wireDialogRail } from "../apps/dialog-rail.js";
import { keptFromMe } from "./solo.js";

/** The look new Realm Scenes start with: the one last applied. Each Realm Scene keeps its own in a flag. */
export const REALM_LOOK_SETTING = "realmLook";

/** The Scene flag holding a Realm Scene's own skin, colour set and pictures. */
export const REALM_LOOK_FLAG = "realmLook";

/** Called when what Undo and Redo can take back on a Realm changes, with the Scene's id. */
export const REALM_HISTORY_HOOK = `${SYSTEM_ID}.realmHistoryChanged`;

/** Called on every client when a Realm Scene's look changes, with the Scene's id, or null for the look new Realms start with. */
export const REALM_LOOK_HOOK = `${SYSTEM_ID}.realmLookChanged`;

/** Register the Realm look settings. Called during init. */
export function registerRealmSettings() {
	game.settings.register(SYSTEM_ID, REALM_LOOK_SETTING, {
		scope: "world",
		config: false,
		type: Object,
		default: defaultRealmLook(),
		// Only new Realms use it, so no Scene is redrawn.
		onChange: () => Hooks.callAll(REALM_LOOK_HOOK, null)
	});
}

/** @returns {import("../rules/realm-skins.js").RealmLook} The look new Realm Scenes start with. */
const defaultLook = () => normaliseRealmLook(game.settings.get(SYSTEM_ID, REALM_LOOK_SETTING));

/**
 * @param {Scene|null} [scene] Omit for the look new Realm Scenes start with.
 * @returns {import("../rules/realm-skins.js").RealmLook} The look a Realm Scene is drawn in.
 */
export function getRealmLook(scene) {
	const own = isRealmScene(scene) ? scene.getFlag(SYSTEM_ID, REALM_LOOK_FLAG) : null;
	return own ? normaliseRealmLook(own) : defaultLook();
}

/** @param {import("../rules/realm-skins.js").RealmLook} look */
const lookFlag = (look) => ({ [`flags.${SYSTEM_ID}.${REALM_LOOK_FLAG}`]: normaliseRealmLook(look) });

/**
 * Give a Realm Scene a look of its own and redraw it in that look. The look
 * also becomes the one new Realm Scenes start with; no other Scene changes.
 * @param {Scene|null} scene A Realm Scene, or null to change only what new Realms start with.
 * @param {import("../rules/realm-skins.js").RealmLook} look
 * @returns {Promise<void>}
 */
export async function setRealmLook(scene, look) {
	if (!game.user.isGM) return;
	// Scenes still drawn in the old default keep it, rather than drifting to the new one as they're edited.
	await keepRealmLooks();
	if (isRealmScene(scene)) {
		const textures = realmTextures(look);
		await queueRealmWrite(async () => {
			await writeRealm(scene, getRealm(scene).realm, sceneGeometry(scene), textures);
			// The flag rides with the colours, so the Scene is drawn again once.
			await paintRealmScene(scene, textures.colours, lookFlag(look));
		});
	}
	await game.settings.set(SYSTEM_ID, REALM_LOOK_SETTING, normaliseRealmLook(look));
}

/**
 * @param {Scene} scene
 * @returns {ReturnType<typeof realmTextures>} The pictures and colours a Realm Scene is drawn with.
 */
export const currentRealmTextures = (scene) => realmTextures(getRealmLook(scene));

/**
 * A world setup step: bring Realm Scenes made before the pictures last changed
 * up to date, such as when the Blank Realm's own became the default look. Give
 * the step a new key to run it again.
 */
export async function moveRealmPictures() {
	await refreshRealmScenes();
}

/**
 * Give each Realm Scene without a look of its own the look it's drawn in now.
 * A world setup step for Scenes made when one look served every Realm, and
 * run again before that look changes.
 * @returns {Promise<void>}
 */
export async function keepRealmLooks() {
	if (!game.user.isGM) return;
	const look = defaultLook();
	const updates = game.scenes
		.filter((scene) => isRealmScene(scene) && !scene.getFlag(SYSTEM_ID, REALM_LOOK_FLAG))
		.map((scene) => ({ _id: scene.id, ...lookFlag(look) }));
	if (updates.length) await CONFIG.Scene.documentClass.updateDocuments(updates);
}

/** Realms read from their Scenes, by Scene id, until one of their documents changes. */
const realms = new Map();

/** The Tiles hidden on each Realm read, for hexHiddenByHand: dropped with the reading when a document changes. */
const hiddenTiles = new WeakMap();

/**
 * @param {Scene|null|undefined} scene
 * @returns {boolean} Whether the Scene was built as a Realm.
 */
export function isRealmScene(scene) {
	return Boolean(realmFlag(scene));
}

/**
 * @param {Scene} scene A Realm Scene.
 * @returns {object} Its geometry, from realmGeometry.
 */
export function sceneGeometry(scene) {
	const { size, cols, rows, layout } = realmFlag(scene);
	return realmGeometry({ size, cols, rows, layout });
}

/**
 * The Realm a Scene holds, read from its documents.
 * @param {Scene} scene
 * @returns {{realm: object, problems: object[]}|null} Null for a Scene that isn't a Realm.
 */
export function getRealm(scene) {
	if (!isRealmScene(scene)) return null;
	let entry = realms.get(scene.id);
	if (!entry) {
		entry = realmFromDocuments({ flags: scene.flags, ...existingDocuments(scene) }, sceneGeometry(scene));
		realms.set(scene.id, entry);
	}
	return entry;
}

/**
 * @param {Scene} scene A Realm Scene.
 * @param {{col: number, row: number}} hex
 * @returns {{terrain: boolean, holding: boolean, seat: boolean}} What of the hex the GM has hidden by hand, for hexSummary.
 */
export function hexHiddenByHand(scene, hex) {
	// The hover readout asks at every hex crossed, so the hidden Tiles are gathered once per reading of the Realm.
	const entry = getRealm(scene);
	let hidden = entry && hiddenTiles.get(entry);
	if (!hidden) {
		hidden = scene.tiles.filter((tile) => tile._source.hidden).map((tile) => tile._source);
		if (entry) hiddenTiles.set(entry, hidden);
	}
	return hiddenByHand(hidden, sceneGeometry(scene), hex);
}

/**
 * Read a Scene's Realm afresh next time it's asked for. The hooks in
 * realm-hooks.js call this as each of its documents changes, on every client,
 * before the write that changed it resolves.
 * @param {string} [sceneId] Omit to forget every Realm.
 */
export function forgetRealm(sceneId) {
	if (sceneId) realms.delete(sceneId);
	else realms.clear();
}

/**
 * @param {Scene} scene
 * @returns {{tiles: object[], drawings: object[]}} The source data planRealmSync compares against.
 */
const existingDocuments = (scene) => ({
	tiles: scene.tiles.map((tile) => tile._source),
	drawings: scene.drawings.map((drawing) => drawing._source)
});

/** Realm writes, taken one at a time. */
const queueRealmWrite = serialWrites();

/**
 * Bring a Scene in line with a Realm: first its flag, which holds what no
 * document does, then its documents, removals first, then changes, then
 * additions. Tiles and Drawings don't depend on each other, so each step
 * writes both at once. The river Tiles are drawn from the flag's rivers, so
 * should a write fail part way, syncRealmScene lays them again from the flag.
 * @param {Scene} scene
 * @param {object} realm
 * @param {object} g
 * @param {ReturnType<typeof realmTextures>} textures
 * @param {object} [options] Passed to planRealmSync.
 * @returns {Promise<boolean>} Whether anything was written.
 */
async function writeRealm(scene, realm, g, textures, options) {
	const plan = planRealmSync(realm, g, textures, existingDocuments(scene), options);
	const flag = realmFlagChanges(realmFlag(scene), realm, g);
	if (!planChanges(plan) && !flag) return false;
	if (flag) {
		const path = (key) => `flags.${SYSTEM_ID}.${REALM_FLAG}.${key}`;
		await scene.update(Object.fromEntries([
			...Object.entries(flag.set).map(([key, value]) => [path(key), value]),
			...flag.drop.map((key) => deletionEntry(path(key)))
		]));
	}
	for (const step of ["delete", "update", "create"]) {
		await Promise.all(Object.entries(plan)
			.filter(([, writes]) => writes[step].length)
			.map(([type, writes]) => scene[`${step}EmbeddedDocuments`](type, writes[step])));
	}
	return true;
}

/** @returns {Promise<void>} Once every Realm write asked for so far on this client has landed. */
export const realmWritesSettled = () => queueRealmWrite.settled();

/**
 * Give a Realm Scene the paper and hex lines of its colour set.
 * @param {Scene} scene
 * @param {{paper: string, grid: string}} colours
 * @param {object} [extra] Other changes to write with them.
 * @returns {Promise<boolean>} Whether anything was written.
 */
async function paintRealmScene(scene, colours, extra = {}) {
	const { grid, paper, sheet } = sceneColourChanges(scene, colours);
	const changes = { ...extra };
	if (grid) changes["grid.color"] = grid;
	if (paper) Object.assign(changes, sheet.update(paper));
	if (foundry.utils.isEmpty(changes)) return false;
	// One write, so every client redraws the Scene once.
	await scene.update(changes);
	return true;
}

/**
 * How strongly Foundry's own hex lines are drawn over a Realm. A Realm traced
 * from a map drawn on paper already has hexes printed on it: the GM wants the
 * system's brighter while lining the picture up and fainter once it fits.
 * @param {Scene} scene
 * @param {number} alpha 0 to 1.
 * @returns {Promise<void>}
 */
export async function setRealmGridAlpha(scene, alpha) {
	if (!game.user.isGM || !isRealmScene(scene)) return;
	const wanted = Math.min(1, Math.max(0, Number(alpha) || 0));
	if (Math.abs((scene._source.grid?.alpha ?? GRID_ALPHA) - wanted) < 0.005) return;
	await scene.update({ "grid.alpha": wanted });
}

/**
 * @param {Scene} scene
 * @param {{paper: string, grid: string}} colours
 * @returns {{grid?: string, paper?: string, sheet?: object}} The colours the Scene doesn't have yet, and where its paper is kept (see scenePaper).
 */
function sceneColourChanges(scene, { paper, grid }) {
	const same = (a, b) => String(a ?? "").toLowerCase() === String(b).toLowerCase();
	const changes = {};
	if (!same(scene._source.grid?.color, grid)) changes.grid = grid;
	const sheet = scenePaper(scene, LEVEL_ID);
	if (sheet && !same(sheet.colour, paper)) Object.assign(changes, { paper, sheet });
	return changes;
}

/**
 * Bring every Realm Scene in the world up to date with its own look.
 * @returns {Promise<number>} How many Scenes changed.
 */
export async function refreshRealmScenes() {
	if (!game.user.isGM) return 0;
	return queueRealmWrite(async () => {
		let changed = 0;
		for (const scene of game.scenes.filter((candidate) => isRealmScene(candidate))) {
			const textures = currentRealmTextures(scene);
			const documents = await writeRealm(scene, getRealm(scene).realm, sceneGeometry(scene), textures);
			const colours = await paintRealmScene(scene, textures.colours);
			if (documents || colours) changed++;
		}
		return changed;
	});
}

/** The look each Realm Scene is previewed in on this client, by Scene id, as normalised JSON. */
const previews = new Map();

/**
 * Show a Realm look the GM is trying out on the Realm Scene they're viewing,
 * in this browser only. Its Tiles, Drawings and colours are changed where they
 * sit and never saved, so players see nothing, and a reload shows the saved look.
 * @param {import("../rules/realm-skins.js").RealmLook} look
 * @returns {Promise<void>}
 */
export function previewRealmLook(look) {
	const scene = canvas?.scene;
	if (!game.user.isGM || !isRealmScene(scene)) return Promise.resolve();
	const key = JSON.stringify(normaliseRealmLook(look));
	if (key === (previews.get(scene.id) ?? JSON.stringify(getRealmLook(scene)))) return Promise.resolve();
	previews.set(scene.id, key);
	return queueRealmWrite(() => showRealmLook(scene, look, { redraw: true, preview: true }));
}

/**
 * Put every previewed Realm Scene back to the saved look.
 * @param {object} [options]
 * @param {boolean} [options.redraw=true] False when the look is about to be saved, which redraws the Scene anyway.
 * @returns {Promise<void>}
 */
export function endRealmLookPreview({ redraw = true } = {}) {
	const scenes = [...previews.keys()].map((id) => game.scenes.get(id)).filter(Boolean);
	previews.clear();
	return queueRealmWrite(async () => {
		for (const scene of scenes) await showRealmLook(scene, getRealmLook(scene), { redraw });
	});
}

/** Tiles a look being tried out hides on this client, by Scene id: each Tile's id, and the alpha it had. */
const previewHidden = new Map();

/**
 * Change a Realm Scene's documents to a look in this client's memory only.
 * Some looks draw Tiles others don't, such as the sheet's lake shores: trying
 * a look out hides those it has no use for, and draws those it adds on the
 * canvas alone, with no document behind them. Showing the saved look takes
 * both away again.
 * @param {Scene} scene
 * @param {import("../rules/realm-skins.js").RealmLook} look
 * @param {{redraw: boolean, preview?: boolean}} options `preview` for a look being tried out, rather than the saved one.
 */
async function showRealmLook(scene, look, { redraw, preview = false }) {
	const textures = realmTextures(look);
	const entry = getRealm(scene);
	if (!entry) return;
	const onCanvas = scene === canvas?.scene;
	const changed = [];
	// What the last look tried hid comes back first, so the plan is made against the Scene as it's saved.
	for (const [id, alpha] of previewHidden.get(scene.id) ?? []) {
		const tile = scene.tiles.get(id);
		if (!tile) continue;
		tile.updateSource({ alpha });
		changed.push(tile);
	}
	previewHidden.delete(scene.id);
	if (onCanvas) canvas.realm?.clearLookTiles();

	const plan = planRealmSync(entry.realm, sceneGeometry(scene), textures, existingDocuments(scene));
	for (const [type, writes] of Object.entries(plan)) {
		for (const { _id, ...changes } of writes.update) {
			const document = scene.getEmbeddedDocument(type, _id);
			if (!document) continue;
			document.updateSource(changes);
			changed.push(document);
		}
	}
	if (preview) {
		const hidden = new Map();
		for (const id of plan.Tile.delete) {
			const tile = scene.tiles.get(id);
			if (!tile) continue;
			hidden.set(id, tile._source.alpha);
			tile.updateSource({ alpha: 0 });
			changed.push(tile);
		}
		if (hidden.size) previewHidden.set(scene.id, hidden);
	}
	const { grid, paper, sheet } = sceneColourChanges(scene, textures.colours);
	if (grid) scene.updateSource({ "grid.color": grid });
	if (paper) sheet.updateSource(paper);

	if (!redraw || !onCanvas) return;
	// The paper and hex lines are only read as the Scene is drawn.
	if (grid || paper) await canvas.draw();
	else for (const document of changed) document.object?.renderFlags.set({ redraw: true });
	if (preview && plan.Tile.create.length) await canvas.realm?.showLookTiles(plan.Tile.create);
}

/**
 * Change a Realm Scene: read its Realm, apply an edit from realm-edits.js, and
 * write whatever that changed.
 * @param {Scene} scene
 * @param {(realm: object, g: object) => object} edit Returns the changed Realm.
 * @returns {Promise<boolean>} Whether anything was written.
 */
export async function editRealm(scene, edit) {
	if (!game.user.isGM || !isRealmScene(scene)) return false;
	return queueRealmWrite(async () => {
		const textures = currentRealmTextures(scene);
		const g = sceneGeometry(scene);
		const { realm } = getRealm(scene);
		const next = edit(realm, g);
		if (!next || next === realm) return false;
		const written = await writeRealm(scene, next, g, textures);
		if (written) setHistory(scene.id, recordChange(realmHistory(scene.id), realm));
		return written;
	});
}

/** Each Realm Scene's Undo and Redo, by Scene id. This GM's own, until the page reloads. */
const histories = new Map();

/**
 * @param {string} sceneId
 * @returns {import("../rules/history.js").History}
 */
const realmHistory = (sceneId) => histories.get(sceneId) ?? emptyHistory();

/**
 * @param {string} sceneId
 * @param {import("../rules/history.js").History|null} history Null to forget it.
 */
function setHistory(sceneId, history) {
	if (history) histories.set(sceneId, history);
	else histories.delete(sceneId);
	Hooks.callAll(REALM_HISTORY_HOOK, sceneId);
}

/**
 * @param {Scene|null|undefined} scene
 * @returns {{canUndo: boolean, canRedo: boolean}}
 */
export function realmUndoState(scene) {
	const { undo, redo } = realmHistory(scene?.id);
	return { canUndo: undo.length > 0, canRedo: redo.length > 0 };
}

/**
 * Take back the last Realm edit on a Scene, or put back the last one taken
 * back: painting, Barriers, and changes made in Edit this hex.
 * @param {Scene} scene
 * @param {"undo"|"redo"} way
 * @returns {Promise<boolean>} Whether there was anything to take back or put back.
 */
export async function stepRealmHistory(scene, way) {
	if (!game.user.isGM || !isRealmScene(scene)) return false;
	return queueRealmWrite(async () => {
		const { realm } = getRealm(scene);
		const step = stepHistory(realmHistory(scene.id), way, realm);
		if (!step) return false;
		await writeRealm(scene, step.target, sceneGeometry(scene), currentRealmTextures(scene));
		setHistory(scene.id, step.history);
		return true;
	});
}

/**
 * Forget a Scene's Undo and Redo, such as when its Realm is rerolled.
 * @param {string} sceneId
 */
export function forgetRealmHistory(sceneId) {
	if (histories.has(sceneId)) setHistory(sceneId, null);
}

/**
 * Put a Realm Scene back in order: snap its icons to the centres of their
 * hexes, lay the river and Barrier lines again, and clear duplicates. Nothing
 * is written unless something drifted, so it costs nothing on a Scene that is
 * already in order. Anything it can't put right is logged rather than changed.
 * Called as a Realm Scene is drawn. Only the one GM who keeps the world writes,
 * so two GMs opening the same drifted Realm don't lay its lines twice over.
 * @param {Scene} scene
 * @returns {Promise<{changed: boolean, problems: object[]}|null>}
 */
export async function syncRealmScene(scene) {
	if (!game.user.isGM || !game.users?.activeGM?.isSelf || !isRealmScene(scene)) return null;
	const g = sceneGeometry(scene);
	const textures = currentRealmTextures(scene);
	const { realm, problems: readProblems, changed } = await queueRealmWrite(async () => {
		const read = getRealm(scene);
		return { ...read, changed: await writeRealm(scene, read.realm, g, textures) };
	});

	const problems = [...readProblems, ...validateRealm(realm, g)];
	// Edit this hex shows these hex by hex; the log is for a GM looking at the Realm as a whole.
	if (problems.length) console.warn(`${SYSTEM_ID} | Realm problems on ${scene.name}`, problems);
	return { changed, problems };
}

/**
 * Roll a new Realm onto an existing Realm Scene. Tokens and anything else on
 * the Scene stay; the terrain Tiles are reused.
 * @param {Scene} scene
 * @returns {Promise<Scene|null>}
 */
export async function rerollRealm(scene) {
	if (!game.user.isGM || !isRealmScene(scene)) return null;
	const kept = SETUP_PARTS.filter((part) => getRealm(scene).realm.setup?.roll?.[part] === false);
	const message = kept.length
		? t("realm.reroll.confirmCustom", { parts: kept.map((part) => t(`realm.setup.parts.${part}`)).join(", ") })
		: t("realm.reroll.confirm");
	const confirmed = await confirmDialog({ title: t("realm.reroll.title"), icon: "fa-solid fa-dice", message });
	if (!confirmed) return null;

	await rollRealmAgain(scene);
	await postRealmKey(scene);
	return scene;
}

/**
 * Lay a newly rolled Realm over the one a Scene holds, set up as it was, and
 * keeping whatever parts the GM draws by hand. Nothing is asked and nothing is
 * posted: the callers do that.
 * @param {Scene} scene
 * @returns {Promise<object>} The Realm now on the Scene.
 */
function rollRealmAgain(scene) {
	const g = sceneGeometry(scene);
	const textures = currentRealmTextures(scene);
	return queueRealmWrite(async () => {
		// Set up as it was first, keeping what the GM draws by hand.
		const { realm: current } = getRealm(scene);
		const realm = generateRealm({ seed: randomSeed(), setup: current.setup ?? null, geometry: g, base: current });
		// The new seed and rivers go into the Scene's flag with the rest.
		await writeRealm(scene, realm, g, textures, { replacing: true });
		// Undo would lay the old Realm's pieces over the new one.
		forgetRealmHistory(scene.id);
		return realm;
	});
}

/**
 * Add a New Realm button to the Scenes directory, for GMs.
 * @param {HTMLElement} element The Scenes directory.
 */
export function addNewRealmButton(element) {
	if (!game.user.isGM) return;
	addDirectoryButton(element, {
		className: "bastionland-new-realm",
		icon: "fa-solid fa-map",
		label: t("realm.newRealm"),
		onClick: () => newRealm()
	});
}

/** The ways a new Realm can be made. */
const REALM_MAKINGS = Object.freeze(["roll", "draw", "picture"]);

/**
 * Ask whether the new Realm is rolled, drawn by hand, or traced from a map the
 * GM has already drawn on paper.
 * @returns {Promise<"roll"|"draw"|"picture"|null>}
 */
async function chooseRealmMaking() {
	const choice = await foundry.applications.api.DialogV2.wait({
		window: { title: t("realm.dialog.title"), icon: "fa-solid fa-map" },
		classes: ["bastionland-dialog", "realm-making-dialog"],
		// Left to size itself, the question's one long line stretches the window across the screen.
		position: { width: 560 },
		content: `<p>${t("realm.dialog.chooseMaking")}</p>`,
		buttons: [
			{ action: "roll", label: t("realm.dialog.making.roll"), icon: "fa-solid fa-dice", default: true },
			{ action: "draw", label: t("realm.dialog.making.draw"), icon: "fa-solid fa-paintbrush" },
			{ action: "picture", label: t("realm.dialog.making.picture"), icon: "fa-solid fa-image" }
		],
		rejectClose: false
	});
	return REALM_MAKINGS.includes(choice) ? choice : null;
}

/**
 * Ask how the Realm is made — rolled, drawn by hand, or traced from a map the
 * GM has already drawn on paper — then for a name and a seed, and how the
 * Realm is set up, and make it on a new Scene. A Realm that isn't rolled rolls
 * nothing: its Scene starts blank, and a traced one starts with the picture
 * under it and every hex still to be marked.
 * @returns {Promise<Scene|null>}
 */
export async function newRealm() {
	if (!game.user.isGM) return null;
	const making = await chooseRealmMaking();
	if (!making) return null;
	const traced = making === "picture";
	// A traced Realm is a drawn one whose ground is the picture: nothing is rolled, and it's finished the same way.
	const draw = making === "draw" || traced;
	const defaultName = t("realm.dialog.defaultName");
	const [firstStart] = COMPANY_STARTS;
	const upload = foundry.utils.randomID();
	// A page to each part of the Realm on the rail down the dialog's left side.
	const pages = [
		{ key: "realm", icon: "fa-map", label: t("realm.dialog.pages.realm") },
		...(traced ? [{ key: "picture", icon: "fa-image", label: t("realm.picture.title") }] : []),
		draw
			? { key: "setup", icon: "fa-ruler-combined", label: t("realm.setup.sizeTitle") }
			: { key: "setup", icon: "fa-sliders", label: t("realm.setup.title") },
		// Drawn by hand, the Company is chosen and placed from the last page of Creating a Realm, once there are hexes to stand in.
		...(draw ? [] : [{ key: "company", icon: "fa-flag", label: t("company.title") }])
	];
	// As an element, so the Import map page's layout drawings (SVG) aren't cleaned away.
	const content = uncleanedContent(await foundry.applications.handlebars.renderTemplate(templatePath("dialogs/new-realm.hbs"), {
		draw,
		traced,
		pages,
		firstPage: pages[0],
		making: t(`realm.dialog.making.${making}`),
		name: defaultName,
		seed: randomSeed(),
		// Drawn by hand, only the map's size is left to set.
		setupParts: draw ? setupParts().filter((part) => !part.rollable) : setupParts(),
		...(traced ? mapPictureContext(null, { bareHint: t("realm.picture.bare.sizeNext") }) : {}),
		// How far a map of the GM's own may run, for the Map size page to say.
		sizeLimits: { side: Math.max(OWN_SIZE_LIMITS.cols.max, OWN_SIZE_LIMITS.rows.max), hexes: OWN_SIZE_LIMITS.hexes },
		...companyPictureContext(COMPANY_IMAGE),
		starts: COMPANY_STARTS.map((value) => ({ value, label: t(`company.starts.${value}.name`), selected: value === firstStart })),
		startHint: t(`company.starts.${firstStart}.hint`)
	}));

	const data = await foundry.applications.api.DialogV2.input({
		window: { title: t("realm.dialog.title"), icon: "fa-solid fa-map" },
		classes: ["bastionland-dialog", "bastionland-rail-dialog-window"],
		// Wide enough for the rail and the Custom Realm's rows beside it.
		position: { width: 660 },
		content,
		ok: traced
			? { label: t("realm.dialog.createTraced"), icon: "fa-solid fa-image" }
			: draw
				? { label: t("realm.dialog.createBlank"), icon: "fa-solid fa-paintbrush" }
				: { label: t("realm.dialog.create"), icon: "fa-solid fa-dice" },
		rejectClose: false,
		render: (_event, dialog) => {
			wireDialogRail(dialog.element);
			wireSetupFields(dialog.element);
			wireCompanyFields(dialog.element);
			if (traced) {
				wireMapPictureFields(dialog.element, { name: upload });
				holdForMapPicture(dialog.element);
				wireMapSizeFields(dialog.element, { enlarge: openMapSizeWindow });
				// The map seen larger goes with the dialog it sets the size of.
				dialog.addEventListener("close", closeMapSizeWindow, { once: true });
			}
		}
	});
	if (!data) return null;

	const picture = traced ? readMapPictures(data) : null;
	const layout = traced ? readMapLayout(data) : BOOK_LAYOUT;
	if (traced && !picture.players) {
		ui.notifications.warn(t("realm.picture.needed"));
		return null;
	}

	const setup = foundry.utils.expandObject(data).setup ?? {};
	if (draw) setup.roll = Object.fromEntries(SETUP_PARTS.map((part) => [part, false]));
	// A map of the GM's own takes as many hexes as they count on it, or its shape needs, which is no rule ignored.
	if (traced) setup.ownSize = true;
	const rules = normaliseRealmSetup(setup);
	const scene = await createRealmScene({
		name: String(data.name ?? "").trim() || defaultName,
		seed: String(data.seed ?? "").trim() || randomSeed(),
		setup: rules,
		drawing: draw,
		picture,
		layout,
		company: data.placeCompany ? {
			start: COMPANY_STARTS.includes(data.start) ? data.start : firstStart,
			img: await resolveCompanyPicture(data)
		} : null,
		// Nothing to look over where nothing was rolled: a Realm drawn by hand, or one whose every part is left to the GM.
		review: SETUP_PARTS.some((part) => rules.roll[part])
	});
	if (scene && draw) {
		// Its buttons are shown once it's finished, not while it's still being painted.
		buttonsShownWhenFinished.add(scene.id);
		await openRealmPainter(scene);
	} else if (scene) showRealmButtonsOnceFree();
	return scene;
}

/** Realms drawn by hand on this client that show the GM their buttons when first finished, by id. */
const buttonsShownWhenFinished = new Set();

/**
 * Show the GM the buttons beside the sidebar, once the Company they may be
 * carrying is put down or given up: a Tour's overlay would take the click
 * that puts it in a hex.
 */
function showRealmButtonsOnceFree() {
	if (!isPlacingCompany()) {
		showRealmButtons();
		return;
	}
	const id = Hooks.on(COMPANY_PLACING_HOOK, () => {
		if (isPlacingCompany()) return;
		Hooks.off(COMPANY_PLACING_HOOK, id);
		showRealmButtons();
	});
}

/**
 * A traced Realm can't be made without the players' picture, and that field is
 * on a page of the rail the GM may never have opened. Create stops on that page
 * instead, rather than closing the dialog and losing all that was filled in.
 * @param {HTMLElement} element The New Realm dialog.
 */
function holdForMapPicture(element) {
	// Caught on the way down, before the dialog's own submit hears of it.
	element.addEventListener("click", (event) => {
		if (!event.target.closest?.('button[data-action="ok"]')) return;
		if (element.querySelector('[name="picture.players"]')?.value.trim()) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		ui.notifications.warn(t("realm.picture.needed"));
		element.querySelector('[data-rail-tab="picture"]')?.click();
		element.querySelector('[name="picture.players"]')?.focus();
	}, { capture: true });
}

/**
 * Pick up the Realm tools' terrain brush on a Realm drawn by hand, so the GM
 * can start painting straight away.
 * @param {Scene} scene
 * @returns {Promise<void>}
 */
async function openRealmPainter(scene) {
	if (canvas.scene?.id !== scene.id) return;
	// A new Realm starts on terrain, not the river.
	await canvas.realm?.useTool("terrain", { brush: "terrain" });
}

/**
 * The New Realm dialog's Company fields: the Start says where the Company
 * begins as it's chosen, and the picture is chosen the same way as anywhere
 * else the Company's picture is.
 * @param {HTMLElement} element The dialog.
 */
function wireCompanyFields(element) {
	const start = element.querySelector('[name="start"]');
	const hint = element.querySelector("[data-company-hint]");
	if (start && hint) start.addEventListener("change", () => { hint.textContent = t(`company.starts.${start.value}.hint`); });
	wireCompanyPicture(element);
}

/**
 * Roll a Realm, build its Scene, show it, and whisper its key to the GMs.
 * @param {object} options
 * @param {string} options.name
 * @param {string} options.seed
 * @param {import("../rules/realm-setup.js").RealmSetup|null} [options.setup] Omit for the book's.
 * @param {boolean} [options.drawing] Drawn by hand: the Scene is marked as still being drawn, and its key waits until it's finished.
 * @param {object|null} [options.picture] The pictures a Realm traced from a map drawn on paper is drawn by.
 * @param {string} [options.layout] How its hexes are laid out, one of REALM_LAYOUTS: the book's unless a map of the GM's own says otherwise.
 * @param {{start: string, img: string}|null} [options.company] Where the Company begins, or null to leave it off the map.
 * @param {boolean} [options.review] Show the Referee what was rolled and let them roll again before anything is settled on it.
 * @returns {Promise<Scene|null>}
 */
export async function createRealmScene({ name, seed, setup = null, drawing = false, picture = null, layout = BOOK_LAYOUT, company = null, review = false }) {
	const { cols, rows } = normaliseRealmSetup(setup);
	const geometry = realmGeometry({ cols, rows, layout });
	const realm = generateRealm({ seed, setup, geometry });
	// The picture lies as large as fits on the map, unstretched, until the GM lines it up against the hexes.
	const pictures = await fitRealmPicture(normaliseRealmPicture(picture), geometry);
	if (pictures) realm.picture = pictures;
	const look = getRealmLook();
	const textures = realmTextures(look);
	const data = foundry.utils.mergeObject(
		realmSceneData({ name, realm, geometry, textures, units: t("realm.units") }),
		foundry.utils.expandObject({
			...lookFlag(look),
			...(drawing ? drawingFlag(true) : {}),
			// Remembered, so a Knight made later opens the chooser on the Start their Company took.
			...(company?.start ? { [`flags.${SYSTEM_ID}.${COMPANY_START_FLAG}`]: company.start } : {}),
			// A Realm drawn by hand hears what its Start sets going once it's finished.
			...(drawing && company?.start ? { [`flags.${SYSTEM_ID}.${START_DUE_FLAG}`]: company.start } : {})
		})
	);

	// A Realm laid over a picture opens with the picture being lined up, and the rules that open with the
	// Scene wait for that. They're told before the Scene exists, since a world's first is drawn as it's made.
	const id = foundry.utils.randomID();
	if (pictures) (await import("../canvas/map-alignment.js")).awaitMapAlignment(id);
	const scene = await CONFIG.Scene.documentClass.create({ ...data, _id: id }, { keepId: true });
	if (!scene) return null;
	// A world's first Scene is made active as it's created, so Foundry is already drawing it and won't switch Scenes until it's done.
	if (canvas.loading) await new Promise((resolve) => Hooks.once("canvasReady", resolve));
	if (canvas.scene?.id !== scene.id) await scene.view();

	// A first roll is only an offer: the Referee looks the Realm over and rolls
	// again until one of them is theirs. Which six Myths it holds they can settle
	// on their own, apart from the roll. What they keep is the one pictured in
	// the Scenes directory, given the Company, and whispered as a Realm Key.
	if (review) {
		/** @type {(() => Promise<void>)|null} Puts the Myths window away again, once one has been opened. */
		let closeMyths = null;
		await askToKeepRealm({
			realm,
			roll: () => rollRealmAgain(scene),
			// A window of its own, like the Knight chooser, loaded only when one is asked for.
			// Played alone, which six the Realm holds is left to the dice, unseen.
			myths: keptFromMe()
				? null
				: async () => {
					const { closeMythChooser, openMythChooser } = await import("../apps/MythChooser.js");
					closeMyths = closeMythChooser;
					openMythChooser({ scene });
				}
		});
		await closeMyths?.();
	}

	// A picture only lies roughly in place until it's lined up, so the GM slides it
	// into place while the Realm is empty and there is nothing in the way.
	// Waited on, so the Company isn't handed over to take the same clicks.
	if (pictures) {
		const { startMapAlignment } = await import("../canvas/map-alignment.js");
		await startMapAlignment(scene, { role: "players" });
	}

	await refreshThumbnail(scene);

	// A Courtier's Company begins at the Seat of Power; for the other Starts the
	// Referee chooses, so the Company is put in their hand to carry to a hex (p6).
	if (company) {
		const placed = await placeCompanyAtStart(scene, company);
		if (placed) ui.notifications.info(t("company.begins", { hex: hexLabel(companyTokenHex(scene), scene) }));
		else if (!await startCompanyPlacement(scene, company)) ui.notifications.info(t("company.placing.later"));
	}

	// Drawn by hand, the Realm has nothing hidden in it yet.
	if (!drawing) await postRealmKey(scene);
	// What the Start sets going besides where the Company begins (p6).
	if (company && !drawing) await announceStart(scene, company.start);
	return scene;
}

/**
 * A Realm's pictures, each laid in the middle of the map without being
 * stretched, ready to be lined up: as large as fits on it, or for a map with
 * no hexes on it, just large enough to cover it.
 * @param {object|null} picture The pictures as chosen, each with a `src`, and `bare` for one with no hexes on it.
 * @param {object} g The Realm's geometry.
 * @returns {Promise<object|null>}
 */
async function fitRealmPicture(picture, g) {
	if (!picture) return null;
	const fitted = {};
	for (const [role, map] of Object.entries(picture)) {
		fitted[role] = { src: map.src, bare: map.bare, ...laidMapRect(g, await measurePicture(map.src), { bare: map.bare }) };
	}
	return normaliseRealmPicture(fitted);
}

/**
 * Lay a Realm's hexes out another way (REALM_LAYOUTS), to match a map of the
 * GM's own: flat tops or pointed, with either column or row set off. The
 * Scene takes the Foundry grid of that layout and the size it needs. Every hex
 * keeps what it holds and its Tiles move to where that hex now lies; the
 * Company stays in its hex; a river or Barrier is kept where its hexes still
 * meet. A picture lined up against the old hexes is laid out ready to line up
 * again, as a new one is. GMs only.
 * @param {Scene} scene
 * @param {string} layout One of REALM_LAYOUTS.
 * @returns {Promise<{relaid: boolean, trimmed: boolean}>} Whether the hexes changed, and whether any river or
 *   Barrier was cut back for no longer joining up.
 */
export async function setRealmLayout(scene, layout) {
	const none = { relaid: false, trimmed: false };
	if (!game.user.isGM || !isRealmScene(scene)) return none;
	const from = sceneGeometry(scene);
	const to = realmGeometry({ size: from.size, cols: from.cols, rows: from.rows, layout });
	if (to.layout === from.layout) return none;
	const company = companyTokenHex(scene);

	const trimmed = await queueRealmWrite(async () => {
		const { realm } = getRealm(scene);
		const joined = relayRealm(realm, to);
		let next = joined;
		const picture = await fitRealmPicture(next.picture ?? null, to);
		if (picture) next = { ...next, picture };

		// The layout goes into the Scene's flag with its grid and size in one write,
		// so a Realm read from here on is read the new way, even by a sync the redraw sets off.
		const flag = `flags.${SYSTEM_ID}.${REALM_FLAG}.layout`;
		await scene.update(Object.fromEntries([
			["grid.type", to.gridType],
			["width", to.width],
			["height", to.height],
			to.layout === BOOK_LAYOUT ? deletionEntry(flag) : [flag, to.layout]
		]));
		// Each of the Realm's Tiles moves with its hex, so the sync that follows finds each where the new layout looks for it.
		const moves = scene.tiles.contents.flatMap((tile) => {
			const kind = realmFlag(tile)?.kind;
			const hex = kind && kind !== "map" ? hexAt(from, tile._source) : null;
			if (!hex) return [];
			const was = hexCentre(from, hex);
			const now = hexCentre(to, hex);
			return [{ _id: tile.id, x: Math.round(tile._source.x + now.x - was.x), y: Math.round(tile._source.y + now.y - was.y) }];
		});
		if (moves.length) await scene.updateEmbeddedDocuments("Tile", moves);
		await writeRealm(scene, next, to, currentRealmTextures(scene));
		// Undo would lay pieces down where the old hexes were.
		forgetRealmHistory(scene.id);
		return joined !== realm;
	});
	await restandCompany(scene, company);
	return { relaid: true, trimmed };
}

/**
 * Picture a Realm Scene in the Scenes directory as it's drawn now.
 * @param {Scene} scene
 * @param {object} [changes] Other changes to the Scene, sent in the same update.
 * @returns {Promise<void>}
 */
async function refreshThumbnail(scene, changes = {}) {
	// A picture in the Scenes directory is a nicety; the Realm works without one.
	let thumb = null;
	try {
		({ thumb } = await scene.createThumbnail());
	} catch (error) {
		console.warn(`${SYSTEM_ID} | Couldn't make a thumbnail for ${scene.name}`, error);
	}
	if (thumb || !foundry.utils.isEmpty(changes)) await scene.update(thumb ? { ...changes, thumb } : changes);
}

/**
 * @param {boolean} drawing
 * @returns {object} The Scene update marking a Realm as being drawn by hand, or not.
 */
const drawingFlag = (drawing) => ({ [`flags.${SYSTEM_ID}.${REALM_DRAWING_FLAG}`]: drawing });

/** The Start a Realm drawn by hand announces when it's first finished, kept on its Scene until then. */
const START_DUE_FLAG = "startDue";

/**
 * @param {Scene|null|undefined} scene
 * @returns {boolean} Whether a Realm Scene is still being drawn by hand.
 */
export const isDrawingRealm = (scene) => isRealmScene(scene) && scene.getFlag(SYSTEM_ID, REALM_DRAWING_FLAG) === true;

/**
 * Go back into drawing a Realm drawn by hand and finished, as the GM picks up
 * the terrain brush: the Creating a Realm rules and the Finish button come back
 * in place of Travel and Exploration. A rolled Realm is painted without going
 * into drawing, so its players keep Travel and Exploration.
 * @param {Scene} scene
 * @returns {Promise<boolean>} Whether it went back into drawing.
 */
export async function startRealmDrawing(scene) {
	// Finishing leaves the flag false; a rolled Realm never had it.
	const finished = isRealmScene(scene) && scene.getFlag(SYSTEM_ID, REALM_DRAWING_FLAG) === false;
	if (!game.user.isGM || !finished) return false;
	await scene.update(drawingFlag(true));
	return true;
}

/** Realm Scenes being finished on this client, by id. */
const finishing = new Set();

/**
 * Finish drawing a Realm by hand: Travel and Exploration come back beside
 * the map, and the GMs get the Realm's key. Where the Realm falls short of
 * what the sheet asks for, the GM is told what's missing and may finish it
 * all the same, since the sheet is a guide (p14).
 * @param {Scene} scene
 * @returns {Promise<boolean>} Whether it was finished.
 */
export async function finishRealmDrawing(scene) {
	// A second click while the first is still asking or saving would post the key twice.
	if (!game.user.isGM || !isDrawingRealm(scene) || finishing.has(scene.id)) return false;
	finishing.add(scene.id);
	try {
		const short = drawingShortfalls(getRealm(scene).realm);
		if (short.length) {
			const items = short.map((entry) => `<li>${foundry.utils.escapeHTML(drawingCountLabel(entry))}</li>`).join("");
			const confirmed = await confirmDialog({
				title: t("realmDrawing.finish.title"),
				icon: "fa-solid fa-scroll",
				message: `${t("realmDrawing.finish.short")}</p><ul>${items}</ul><p>${t("realmDrawing.finish.anyway")}`
			});
			if (!confirmed) return false;
		}

		await refreshThumbnail(scene, drawingFlag(false));
	} finally {
		finishing.delete(scene.id);
	}
	if (canvas.scene?.id === scene.id) await ui.controls.activate({ control: "realm", tool: "inspect" });
	ui.notifications.info(t("realmDrawing.finish.done", { name: scene.name }));
	await postRealmKey(scene);
	// Only the first time: a Realm taken back into drawing and finished again has already begun.
	const start = scene.getFlag(SYSTEM_ID, START_DUE_FLAG);
	if (start) {
		await scene.unsetFlag(SYSTEM_ID, START_DUE_FLAG);
		await announceStart(scene, start);
	}
	if (buttonsShownWhenFinished.delete(scene.id)) showRealmButtonsOnceFree();
	return true;
}

/**
 * @param {import("../rules/realm-drawing.js").DrawingCount} entry
 * @returns {string} How far one part of a Realm's drawing has come, in words.
 */
export function drawingCountLabel({ key, count, target, rivers = 0, disputed = false }) {
	const base = `realmDrawing.tally.${key}`;
	if (LANDMARK_TYPES.includes(key)) {
		return t("realmDrawing.tally.landmark", { type: t(`realmDrawing.sections.landmarks.lines.${key}.label`), count, min: LANDMARKS_PER_TYPE.min, max: LANDMARKS_PER_TYPE.max });
	}
	if (key === "river") return !rivers ? t(`${base}None`) : t(rivers > 1 ? `${base}s` : base, { count, rivers });
	if (key === "seat") return t(count === 0 ? `${base}None` : count === 1 ? base : disputed ? `${base}Disputed` : `${base}Many`, { count });
	return t(base, { count, target });
}

/**
 * Whisper the GMs what's hidden in a Realm: its Myths with their pages, its
 * Holdings, and the Seer at each Sanctum. Names come from the GM's imported
 * book art where there is some.
 * @param {Scene} scene
 * @returns {Promise<ChatMessage|null>}
 */
async function postRealmKey(scene) {
	// Played alone, the Referee finds the Realm's Myths and Landmarks by travelling.
	if (keptFromMe()) return null;
	const entry = getRealm(scene);
	if (!entry) return null;
	const { realm } = entry;
	const index = await loadArtIndex();
	const where = ({ col, row }) => hexLabel({ col, row }, scene);

	return postCard(null, "realm-key", {
		title: scene.name,
		seed: realm.seed,
		custom: Boolean(realm.setup),
		myths: realm.myths.map((myth) => {
			const { name, page } = mythEntry(index, myth);
			return { number: myth.number, name, page, where: where(myth.hex) };
		}),
		holdings: realm.holdings.map((holding) => ({
			name: holdingName(holding, t),
			seat: holding.seat,
			where: where(holding.hex)
		})),
		sanctums: realm.landmarks.filter((landmark) => landmark.type === "sanctum" && landmark.seer).map((landmark) => {
			const { name, page } = seerEntry(index, landmark.seer);
			return { name, page, where: where(landmark.hex) };
		}),
		landmarks: realm.landmarks.length,
		barriers: realm.barriers.length
	}, { mode: "gm" });
}
