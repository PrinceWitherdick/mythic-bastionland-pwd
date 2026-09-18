import { addDirectoryButton, confirmDialog } from "../apps/ui.js";
import { loadArtIndex, mythEntry, seerEntry } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { randomSeed } from "../rules/random.js";
import { REALM_FLAG, REALM_PROBLEMS, validateRealm } from "../rules/realm.js";
import {
	LEVEL_ID,
	planChanges,
	planRealmSync,
	realmFlag,
	realmFromDocuments,
	realmSceneData,
	realmSceneFlag,
	realmTextures
} from "../rules/realm-documents.js";
import { defaultRealmLook, normaliseRealmLook } from "../rules/realm-skins.js";
import { generateRealm } from "../rules/realm-generator.js";
import { realmGeometry } from "../rules/realm-geometry.js";
import { serialWrites } from "../rules/queue.js";
import { emptyHistory, recordChange, stepHistory } from "../rules/history.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

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
	const { size, cols, rows } = realmFlag(scene);
	return realmGeometry({ size, cols, rows });
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
 * Bring a Scene's documents in line with a Realm: removals first, then
 * changes, then additions. Tiles and Drawings don't depend on each other, so
 * each step writes both at once.
 * @param {Scene} scene
 * @param {object} realm
 * @param {object} g
 * @param {ReturnType<typeof realmTextures>} textures
 * @param {object} [options] Passed to planRealmSync.
 * @returns {Promise<boolean>} Whether anything was written.
 */
async function writeRealm(scene, realm, g, textures, options) {
	const plan = planRealmSync(realm, g, textures, existingDocuments(scene), options);
	if (!planChanges(plan)) return false;
	for (const step of ["delete", "update", "create"]) {
		await Promise.all(Object.entries(plan)
			.filter(([, writes]) => writes[step].length)
			.map(([type, writes]) => scene[`${step}EmbeddedDocuments`](type, writes[step])));
	}
	return true;
}

/**
 * Give a Realm Scene the paper and hex lines of its colour set.
 * @param {Scene} scene
 * @param {{paper: string, grid: string}} colours
 * @param {object} [extra] Other changes to write with them.
 * @returns {Promise<boolean>} Whether anything was written.
 */
async function paintRealmScene(scene, colours, extra = {}) {
	const { grid, level, paper } = sceneColourChanges(scene, colours);
	const changes = { ...extra };
	if (grid) changes["grid.color"] = grid;
	if (paper) changes.levels = [{ _id: level.id, background: { color: paper } }];
	if (foundry.utils.isEmpty(changes)) return false;
	// One write, so every client redraws the Scene once.
	await scene.update(changes);
	return true;
}

/**
 * @param {Scene} scene
 * @param {{paper: string, grid: string}} colours
 * @returns {{grid?: string, paper?: string, level?: object}} The colours the Scene doesn't have yet, and the level its paper is on.
 */
function sceneColourChanges(scene, { paper, grid }) {
	const same = (a, b) => String(a ?? "").toLowerCase() === String(b).toLowerCase();
	const changes = {};
	if (!same(scene._source.grid?.color, grid)) changes.grid = grid;
	const level = scene.levels?.get(LEVEL_ID) ?? scene.levels?.contents[0];
	if (level && !same(level._source.background?.color, paper)) Object.assign(changes, { paper, level });
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
	return queueRealmWrite(() => showRealmLook(scene, look, { redraw: true }));
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

/**
 * Change a Realm Scene's documents to a look in this client's memory only.
 * @param {Scene} scene
 * @param {import("../rules/realm-skins.js").RealmLook} look
 * @param {{redraw: boolean}} options
 */
async function showRealmLook(scene, look, { redraw }) {
	const textures = realmTextures(look);
	const entry = getRealm(scene);
	if (!entry) return;
	// Only updates: a look never adds or removes a document.
	const plan = planRealmSync(entry.realm, sceneGeometry(scene), textures, existingDocuments(scene));
	const changed = [];
	for (const [type, writes] of Object.entries(plan)) {
		for (const { _id, ...changes } of writes.update) {
			const document = scene.getEmbeddedDocument(type, _id);
			if (!document) continue;
			document.updateSource(changes);
			changed.push(document);
		}
	}
	const { grid, level, paper } = sceneColourChanges(scene, textures.colours);
	if (grid) scene.updateSource({ "grid.color": grid });
	if (paper) level.updateSource({ background: { color: paper } });

	if (!redraw || scene !== canvas?.scene) return;
	// The paper and hex lines are only read as the Scene is drawn.
	if (grid || paper) await canvas.draw();
	else for (const document of changed) document.object?.renderFlags.set({ redraw: true });
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
 * back: painting, Barriers, and changes made in the Hex panel.
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

/** How many problems a Tidy notification names before it stops. */
const PROBLEMS_SHOWN = 5;

/**
 * Tidy a Realm Scene: snap its icons to the centres of their hexes, unlock
 * hidden ones, lay the river and Barrier lines again, and clear duplicates.
 * Anything it can't put right is reported rather than changed.
 * @param {Scene} scene
 * @param {object} [options]
 * @param {boolean} [options.report] Tell the GM what happened.
 * @returns {Promise<{changed: boolean, problems: object[]}|null>}
 */
export async function syncRealmScene(scene, { report = false } = {}) {
	if (!game.user.isGM || !isRealmScene(scene)) return null;
	const g = sceneGeometry(scene);
	const textures = currentRealmTextures(scene);
	const { realm, problems: readProblems, changed } = await queueRealmWrite(async () => {
		const read = getRealm(scene);
		return { ...read, changed: await writeRealm(scene, read.realm, g, textures) };
	});

	const problems = [...readProblems, ...validateRealm(realm, g)];
	if (report) {
		if (problems.length) {
			const list = problems.slice(0, PROBLEMS_SHOWN)
				.map(({ reason, key }) => t("realm.tidy.problem", { problem: t(`realm.problems.${REALM_PROBLEMS.includes(reason) ? reason : "duplicate"}`), key }))
				.join("; ");
			ui.notifications.warn(t("realm.tidy.problems", { count: problems.length, list }));
			console.warn(`${SYSTEM_ID} | Realm problems on ${scene.name}`, problems);
		} else {
			ui.notifications.info(t(changed ? "realm.tidy.done" : "realm.tidy.clean"));
		}
	}
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
	const confirmed = await confirmDialog({ title: t("realm.reroll.title"), icon: "fa-solid fa-dice", message: t("realm.reroll.confirm") });
	if (!confirmed) return null;

	const g = sceneGeometry(scene);
	const realm = generateRealm({ seed: randomSeed(), geometry: g });
	const textures = currentRealmTextures(scene);
	await queueRealmWrite(async () => {
		await writeRealm(scene, realm, g, textures, { replacing: true });
		await scene.update({ [`flags.${SYSTEM_ID}.${REALM_FLAG}`]: realmSceneFlag(realm, g) });
		// Undo would lay the old Realm's pieces over the new one.
		forgetRealmHistory(scene.id);
	});
	await postRealmKey(scene);
	return scene;
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

/**
 * Ask for a name and a seed, then roll a Realm onto a new Scene.
 * @returns {Promise<Scene|null>}
 */
export async function newRealm() {
	if (!game.user.isGM) return null;
	const defaultName = t("realm.dialog.defaultName");
	const content = await foundry.applications.handlebars.renderTemplate(templatePath("dialogs/new-realm.hbs"), {
		name: defaultName,
		seed: randomSeed()
	});

	const data = await foundry.applications.api.DialogV2.input({
		window: { title: t("realm.dialog.title"), icon: "fa-solid fa-map" },
		classes: ["bastionland-dialog"],
		content,
		ok: { label: t("realm.dialog.create"), icon: "fa-solid fa-dice" },
		rejectClose: false
	});
	if (!data) return null;

	return createRealmScene({
		name: String(data.name ?? "").trim() || defaultName,
		seed: String(data.seed ?? "").trim() || randomSeed()
	});
}

/**
 * Roll a Realm, build its Scene, show it, and whisper its key to the GMs.
 * @param {object} options
 * @param {string} options.name
 * @param {string} options.seed
 * @returns {Promise<Scene|null>}
 */
async function createRealmScene({ name, seed }) {
	const geometry = realmGeometry();
	const realm = generateRealm({ seed, geometry });
	const look = getRealmLook();
	const textures = realmTextures(look);
	const data = foundry.utils.mergeObject(
		realmSceneData({ name, realm, geometry, textures, units: t("realm.units") }),
		foundry.utils.expandObject(lookFlag(look))
	);

	const scene = await CONFIG.Scene.documentClass.create(data);
	if (!scene) return null;
	// A world's first Scene is made active as it's created, so Foundry is already drawing it and won't switch Scenes until it's done.
	if (canvas.loading) await new Promise((resolve) => Hooks.once("canvasReady", resolve));
	if (canvas.scene?.id !== scene.id) await scene.view();

	// A picture in the Scenes directory is a nicety; the Realm works without one.
	try {
		const { thumb } = await scene.createThumbnail();
		if (thumb) await scene.update({ thumb });
	} catch (error) {
		console.warn(`${SYSTEM_ID} | Couldn't make a thumbnail for ${scene.name}`, error);
	}

	await postRealmKey(scene);
	return scene;
}

/**
 * Whisper the GMs what's hidden in a Realm: its Myths with their pages, its
 * Holdings, and the Seer at each Sanctum. Names come from the GM's imported
 * book art where there is some.
 * @param {Scene} scene
 * @returns {Promise<ChatMessage|null>}
 */
async function postRealmKey(scene) {
	const entry = getRealm(scene);
	if (!entry) return null;
	const { realm } = entry;
	const index = await loadArtIndex();
	const where = ({ col, row }) => t("realm.hex", { col, row });

	return postCard(null, "realm-key", {
		title: scene.name,
		seed: realm.seed,
		myths: realm.myths.map((myth) => {
			const { name, page } = mythEntry(index, myth);
			return { number: myth.number, name, page, where: where(myth.hex) };
		}),
		holdings: realm.holdings.map((holding) => ({
			name: holding.name || t(`realm.holdings.${holding.style}`),
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
