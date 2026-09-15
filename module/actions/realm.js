import { addDirectoryButton, confirmDialog } from "../apps/ui.js";
import { loadArtIndex, loadRealmIcons, mythEntry, seerEntry } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { randomSeed } from "../rules/random.js";
import { REALM_FLAG, REALM_PROBLEMS, validateRealm } from "../rules/realm.js";
import {
	planChanges,
	planRealmSync,
	realmFlag,
	realmFromDocuments,
	realmSceneData,
	realmSceneFlag,
	realmTextures
} from "../rules/realm-documents.js";
import { generateRealm } from "../rules/realm-generator.js";
import { realmGeometry } from "../rules/realm-geometry.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

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

/** The Realm write under way, if any, so the next can wait for it. */
let pendingWrite = Promise.resolve();

/**
 * Run a Realm write once any earlier one has finished. Otherwise edits made in
 * quick succession, such as ticking a box straight after typing a name, each
 * start from the Realm as it was before the other, and undo each other.
 * @template T
 * @param {() => Promise<T>} write
 * @returns {Promise<T>}
 */
function queueRealmWrite(write) {
	const run = pendingWrite.then(write);
	pendingWrite = run.catch(() => {});
	return run;
}

/**
 * Bring a Scene's documents in line with a Realm: removals first, then
 * changes, then additions. Tiles and Drawings don't depend on each other, so
 * each step writes both at once.
 * @param {Scene} scene
 * @param {object} realm
 * @param {object} g
 * @param {ReturnType<typeof realmTextures>} textures
 * @returns {Promise<boolean>} Whether anything was written.
 */
async function writeRealm(scene, realm, g, textures) {
	const plan = planRealmSync(realm, g, textures, existingDocuments(scene));
	if (!planChanges(plan)) return false;
	for (const step of ["delete", "update", "create"]) {
		await Promise.all(Object.entries(plan)
			.filter(([, writes]) => writes[step].length)
			.map(([type, writes]) => scene[`${step}EmbeddedDocuments`](type, writes[step])));
	}
	return true;
}

/**
 * Bring every Realm Scene in the world up to date with the icons, such as
 * after the Blank Realm PDF is imported.
 * @param {object|null} [icons] The Realm icon index. Omit to load it.
 * @returns {Promise<number>} How many Scenes changed.
 */
export async function refreshRealmScenes(icons) {
	if (!game.user.isGM) return 0;
	const textures = realmTextures(icons === undefined ? await loadRealmIcons() : icons);
	return queueRealmWrite(async () => {
		let changed = 0;
		for (const scene of game.scenes.filter((candidate) => isRealmScene(candidate))) {
			if (await writeRealm(scene, getRealm(scene).realm, sceneGeometry(scene), textures)) changed++;
		}
		return changed;
	});
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
		const textures = realmTextures(await loadRealmIcons());
		const g = sceneGeometry(scene);
		const { realm } = getRealm(scene);
		const next = edit(realm, g);
		if (!next || next === realm) return false;
		return writeRealm(scene, next, g, textures);
	});
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
	const textures = realmTextures(await loadRealmIcons());
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
	const textures = realmTextures(await loadRealmIcons());
	await queueRealmWrite(async () => {
		await writeRealm(scene, realm, g, textures);
		await scene.update({ [`flags.${SYSTEM_ID}.${REALM_FLAG}`]: realmSceneFlag(realm, g) });
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
	const textures = realmTextures(await loadRealmIcons());
	const data = realmSceneData({ name, realm, geometry, textures, units: t("realm.units") });

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
