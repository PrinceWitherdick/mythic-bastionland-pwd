import { SYSTEM_ID } from "../system-id.js";

// Foundry forgets open windows when the page reloads. This keeps a list of the
// document sheets a user has open, and of any other window registered with
// registerRestorableWindow, saves where each one sits to a client setting, and
// renders them again once the world is ready.

/** Client setting that turns reopening on and off. */
const RESTORE_SETTING = "restoreOpenSheets";

/**
 * Client setting holding the open sheets. A client setting is one record per
 * browser, shared by every world it opens, so each world keeps its own entry:
 * `{ [worldId]: { [documentUuid or window key]: SheetPlace } }`.
 */
const OPEN_SHEETS_SETTING = "openSheets";

/**
 * Sheet classes to follow. ApplicationV2 fires render and close hooks for every
 * class a sheet inherits from, so these core classes cover the Knight and item
 * sheets as well as any sheet a module adds. A Site's sheet is a Journal
 * entry's, but not a JournalEntrySheet, so it's named on its own.
 */
const WATCHED_SHEETS = Object.freeze(["ActorSheetV2", "ItemSheetV2", "JournalEntrySheet", "SiteSheet"]);

/** Wait this long after the last change before saving, so a burst of renders saves once. */
const SAVE_DELAY_MS = 500;

/**
 * @typedef {object} SheetPlace
 * @property {number} [left]
 * @property {number} [top]
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [zIndex]  Higher is nearer the front.
 * @property {boolean} [minimized]
 */

/** A registered window is saved under its key after this, which no document uuid starts with. */
const WINDOW_PREFIX = "window:";

/**
 * Windows that aren't document sheets, by the key they're saved under: each
 * gives the window to reopen, or null when it should stay shut.
 * @type {Map<string, () => foundry.applications.api.ApplicationV2|null>}
 */
const restorableWindows = new Map();

/** Open windows by the key they're saved under: a document's uuid, or a registered window's key. */
const openSheets = new Map();

let saveTimer;

/** Set while sheets are reopening, so a reload partway through keeps the ones still to come. */
let restoring = false;

/** Register the settings and start following sheets. Called during init. */
export function registerSheetRestore() {
	game.settings.register(SYSTEM_ID, RESTORE_SETTING, {
		name: "bastionland.settings.restoreOpenSheets.name",
		hint: "bastionland.settings.restoreOpenSheets.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true
	});
	game.settings.register(SYSTEM_ID, OPEN_SHEETS_SETTING, {
		scope: "client",
		config: false,
		type: Object,
		default: {}
	});

	for (const sheetClass of WATCHED_SHEETS) {
		Hooks.on(`render${sheetClass}`, (sheet) => track(uuidOf(sheet), sheet));
		Hooks.on(`close${sheetClass}`, (sheet) => untrack(uuidOf(sheet), sheet));
	}

	// Dragging or resizing a sheet doesn't render it again, so save once more as
	// the page goes. Client settings write straight to localStorage, so it lands.
	window.addEventListener("beforeunload", save);
}

/**
 * Follow a window that isn't a document sheet, so it reopens after a reload as sheets do.
 * @param {string} key What it's saved under.
 * @param {string} className The window's class, whose render and close hooks are followed.
 * @param {() => foundry.applications.api.ApplicationV2|null} create The window to render when reopening,
 *   or null when it should stay shut.
 */
export function registerRestorableWindow(key, className, create) {
	const saveKey = `${WINDOW_PREFIX}${key}`;
	restorableWindows.set(saveKey, create);
	Hooks.on(`render${className}`, (app) => track(saveKey, app));
	Hooks.on(`close${className}`, (app) => untrack(saveKey, app));
}

/**
 * Reopen the sheets this world had open when the page last unloaded. Back-most
 * first: each render lands on top, so the sheet that was in front ends in front.
 * Sheets over deleted documents, or ones this user can no longer see, stay shut.
 */
export async function restoreOpenSheets() {
	if (!game.settings.get(SYSTEM_ID, RESTORE_SETTING)) return;
	const saved = Object.entries(savedWorlds()[game.world.id] ?? {})
		.sort(([, a], [, b]) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

	restoring = true;
	try {
		for (const [key, { zIndex: _zIndex, minimized, ...position }] of saved) {
			const sheet = restorableWindows.has(key) ? restorableWindows.get(key)() : await sheetFor(key);
			if (!sheet) continue;
			try {
				// Core keeps the position on screen, so a sheet saved on a larger monitor stays reachable.
				await sheet.render({ force: true, position });
				if (minimized) sheet.minimize();
			} catch (error) {
				console.warn(`${SYSTEM_ID} | Couldn't reopen the sheet for ${key}`, error);
			}
		}
	} finally {
		restoring = false;
		scheduleSave();
	}
}

/** @returns {Record<string, Record<string, SheetPlace>>} Every world's saved sheets. */
function savedWorlds() {
	return game.settings.get(SYSTEM_ID, OPEN_SHEETS_SETTING) ?? {};
}

/**
 * The sheet to reopen for a saved uuid, or null when it should stay shut.
 * @param {string} uuid
 */
async function sheetFor(uuid) {
	const doc = await fromUuid(uuid).catch(() => null);
	if (!doc?.testUserPermission(game.user, "LIMITED")) return null;
	return doc.sheet;
}

/**
 * The uuid a sheet is saved under, or null to leave it out. Sheets over
 * compendium entries are left out, since reopening one loads its compendium.
 * @param {foundry.applications.api.DocumentSheetV2} sheet
 */
function uuidOf(sheet) {
	const doc = sheet.document;
	return doc?.uuid && !doc.pack ? doc.uuid : null;
}

/**
 * @param {string|null} key
 * @param {foundry.applications.api.ApplicationV2} sheet
 */
function track(key, sheet) {
	if (!key) return;
	openSheets.set(key, sheet);
	scheduleSave();
}

/**
 * @param {string|null} key
 * @param {foundry.applications.api.ApplicationV2} sheet
 */
function untrack(key, sheet) {
	// A sheet swapped for another over the same document can close after its replacement renders.
	if (!key || openSheets.get(key) !== sheet) return;
	openSheets.delete(key);
	scheduleSave();
}

function scheduleSave() {
	clearTimeout(saveTimer);
	saveTimer = setTimeout(save, SAVE_DELAY_MS);
}

/** Save where this world's open sheets are, keeping every other world's. */
function save() {
	clearTimeout(saveTimer);
	if (restoring || !game.settings.get(SYSTEM_ID, RESTORE_SETTING)) return;
	const sheets = Object.fromEntries([...openSheets].map(([uuid, sheet]) => [uuid, placeOf(sheet)]));
	const worlds = savedWorlds();
	// Most renders leave every sheet where it was, and writing that again would change nothing.
	if (JSON.stringify(worlds[game.world.id]) === JSON.stringify(sheets)) return;
	game.settings.set(SYSTEM_ID, OPEN_SHEETS_SETTING, { ...worlds, [game.world.id]: sheets });
}

/**
 * @param {foundry.applications.api.ApplicationV2} sheet
 * @returns {SheetPlace}
 */
function placeOf(sheet) {
	const place = {};
	for (const key of ["left", "top", "width", "height", "zIndex"]) {
		// A width or height of "auto" is left out, so the sheet sizes itself again.
		if (Number.isFinite(sheet.position[key])) place[key] = Math.round(sheet.position[key]);
	}
	if (sheet.minimized) place.minimized = true;
	return place;
}
