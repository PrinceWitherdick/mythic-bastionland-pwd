import { t } from "../chat/cards.js";
import {
	HEX_JOURNALS_FOLDER_FLAG,
	HEX_JOURNAL_FLAG,
	HEX_LAYOUT,
	journalPlan,
	knownMarkdown
} from "../rules/hex-journal.js";
import { hexKey, parseHexKey } from "../rules/realm-geometry.js";
import { playerHexView, viewWords } from "../rules/travels.js";
import { serialWrites } from "../rules/queue.js";
import { SYSTEM_ID } from "../system-id.js";
import { read } from "../client-settings.js";
import { JOURNAL_FOLDER_COLOR, flaggedFolder } from "./folders.js";
import { afterBurst, entrySnapshot, openKeptJournal, withHtml, writePlannedPages } from "./kept-journals.js";
import { getHexLore } from "./hex-lore.js";
import { partyNoteBy } from "./hex-shared.js";
import { isDrawingRealm, isRealmScene, realmWritesSettled } from "./realm.js";
import { barrierMetLines, toldLines, travelsSources, visitsText } from "./travels.js";

/**
 * Each hex something is rolled or written for gets a Journal entry, kept up to
 * date as the hex changes: a page of what the Company knows that players can
 * read once they could open the hex in their Places, and a Notes page that is
 * the GM's alone. What was rolled there the GM reads in Places. The pages' words are made in
 * rules/hex-journal.js. The active GM's browser does the writing, so two GMs
 * don't each make an entry for the same hex.
 */

/** The world setting that turns hex entries on. */
export const HEX_JOURNALS_SETTING = "hexJournals";

/** @returns {boolean} Whether hexes get Journal entries in this world. */
export const hexJournalsOn = () => read(HEX_JOURNALS_SETTING, false) !== false;

/** @returns {boolean} Whether this browser is the one that writes them. */
const keepsJournals = () => Boolean(game.user?.isGM && game.users?.activeGM?.isSelf && hexJournalsOn());

/**
 * @param {JournalEntry} entry
 * @returns {{scene: string, hex: string, open?: boolean}|null} What hex the entry is for, if it's one.
 */
export const hexJournalFlag = (entry) => entry?.flags?.[SYSTEM_ID]?.[HEX_JOURNAL_FLAG] ?? null;

/**
 * @param {string} sceneId
 * @returns {Map<string, JournalEntry>} A Realm's hex entries, by hex key.
 */
function entriesOf(sceneId) {
	const entries = new Map();
	for (const entry of game.journal ?? []) {
		const flag = hexJournalFlag(entry);
		if (flag?.scene === sceneId && flag.hex && !entries.has(flag.hex)) entries.set(flag.hex, entry);
	}
	return entries;
}

/**
 * @param {Scene|null} scene
 * @param {{col: number, row: number}} hex
 * @returns {JournalEntry|null} The hex's entry, if it has one.
 */
export function hexJournalEntry(scene, hex) {
	if (!scene || !hex) return null;
	return entriesOf(scene.id).get(hexKey(hex)) ?? null;
}

/**
 * The Journal folder a Realm's hexes are filed in, made the first time it's wanted.
 * @param {Scene} scene
 * @returns {Promise<Folder|null>}
 */
const hexFolder = (scene) => flaggedFolder("JournalEntry", HEX_JOURNALS_FOLDER_FLAG, scene.id, {
	name: t("hexJournal.folder", { realm: scene.name }),
	color: JOURNAL_FOLDER_COLOR,
	sorting: "m"
});

/**
 * Everything a hex's entry should say.
 * @param {import("../rules/travels.js").TravelsSources} sources The Realm as the players know it.
 * @param {{col: number, row: number}} hex
 * @returns {import("../rules/hex-journal.js").WantedEntry}
 */
function wantedEntry(sources, hex) {
	const view = playerHexView(sources, hex);
	const words = viewWords(view, t);
	const known = knownMarkdown({
		terrain: words.terrain,
		features: words.features,
		sighted: words.sighted,
		visits: visitsText(view.visits),
		told: toldLines(view.told),
		party: view.party ? { text: view.party.text, by: partyNoteBy(view.party) } : null,
		met: barrierMetLines(view.met),
		labels: { told: t("travels.told.heading"), party: t("travels.party.heading"), met: t("hexJournal.met") }
	});

	return {
		key: hexKey(hex),
		hex,
		name: words.title,
		open: view.openable,
		pages: {
			known: { name: t("hexJournal.pages.known"), markdown: known },
			notes: { name: t("hexJournal.pages.notes"), markdown: "" }
		}
	};
}

/**
 * @param {JournalEntry} entry
 * @returns {import("../rules/hex-journal.js").EntrySnapshot}
 */
const snapshot = (entry) => entrySnapshot(entry, HEX_LAYOUT, Boolean(hexJournalFlag(entry)?.open));

/**
 * Bring a Realm's hex entries up to date: one for each hex something is kept
 * for, and any made before, whose Notes page is the GM's and so is never
 * deleted. Only what changed is written. The active GM's browser alone.
 * @param {Scene|null} scene
 * @returns {Promise<void>}
 */
export async function syncHexJournals(scene) {
	if (!keepsJournals() || !isRealmScene(scene) || isDrawingRealm(scene)) return;
	const sources = travelsSources(scene);
	if (!sources) return;
	const existing = entriesOf(scene.id);
	// A Barrier the Company ran into is kept for the hex it was met from, as a roll is.
	const met = Object.entries(sources.shared.hexes).filter(([, record]) => record.met?.length).map(([key]) => key);
	const keys = new Set([...Object.keys(getHexLore(scene).hexes), ...met, ...existing.keys()]);
	const hexes = [...keys].map(parseHexKey).filter(Boolean);
	if (!hexes.length) return;

	const made = [];
	const updates = [];
	const pageWrites = [];
	for (const hex of hexes) {
		const wanted = wantedEntry(sources, hex);
		const document = existing.get(wanted.key);
		const plan = journalPlan(document ? snapshot(document) : null, wanted);
		if (plan.create) {
			made.push({ ...plan.create, pages: withHtml(plan.create.pages), flags: { [SYSTEM_ID]: { [HEX_JOURNAL_FLAG]: { scene: scene.id, hex: wanted.key, open: plan.open } } } });
			continue;
		}
		const update = { ...plan.update, ...(plan.open === null ? {} : { [`flags.${SYSTEM_ID}.${HEX_JOURNAL_FLAG}.open`]: plan.open }) };
		if (Object.keys(update).length) updates.push({ _id: document.id, ...update });
		if (plan.pages.create.length || plan.pages.update.length) pageWrites.push(() => writePlannedPages(document, plan.pages));
	}
	// The entries' own changes go in one write, and different entries' pages side by side.
	const JournalEntry = foundry.utils.getDocumentClass("JournalEntry");
	await Promise.all([
		updates.length ? JournalEntry.updateDocuments(updates) : null,
		...pageWrites.map((write) => write())
	]);
	if (made.length) {
		const folder = await hexFolder(scene);
		await JournalEntry.createDocuments(made.map((data) => ({ ...data, folder: folder?.id ?? null })));
	}
}

/** Syncs, taken one at a time, so a hex's entry is never made twice. */
const queueSync = serialWrites();

/**
 * Bring the Realms' entries up to date, one after another.
 * @param {string[]} ids
 */
function syncRealms(ids) {
	for (const id of ids) {
		queueSync(() => syncHexJournals(game.scenes.get(id))).catch((error) => console.error(`${SYSTEM_ID} | Couldn't bring the Journal entries of a Realm's hexes up to date`, error));
	}
}

/**
 * Bring a Realm's entries up to date once the writes in hand have landed. A
 * roll writes the Scene, then its Tiles, each with its own hook, and a first
 * arrival writes again a moment later, so the sync waits for them all.
 */
const syncLater = afterBurst(syncRealms, () => realmWritesSettled());

/** @param {string|undefined} sceneId */
function syncSoon(sceneId) {
	if (sceneId && keepsJournals()) syncLater(sceneId);
}

/** Every Realm's entries, as the world loads or the setting is turned on. */
export function syncEveryRealm() {
	for (const scene of game.scenes ?? []) if (isRealmScene(scene)) syncSoon(scene.id);
}

/**
 * Open a hex's entry, making it first if it's due one and hasn't got it yet.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {Promise<JournalEntry|null>}
 */
export const openHexJournal = (scene, hex) => openKeptJournal({
	find: () => hexJournalEntry(scene, hex),
	on: hexJournalsOn,
	keeps: keepsJournals,
	make: () => queueSync(() => syncHexJournals(scene)),
	none: "hexJournal.none"
});

/**
 * Delete the hex entries, and their folders, of Realms that are going.
 * @param {string[]} sceneIds
 * @returns {Promise<number>} How many entries went.
 */
export async function deleteHexJournals(sceneIds) {
	const ids = new Set(sceneIds);
	const entries = (game.journal ?? []).filter((entry) => ids.has(hexJournalFlag(entry)?.scene)).map((entry) => entry.id);
	if (entries.length) await foundry.utils.getDocumentClass("JournalEntry").deleteDocuments(entries);
	const folders = game.folders.filter((folder) => folder.type === "JournalEntry" && ids.has(folder.getFlag(SYSTEM_ID, HEX_JOURNALS_FOLDER_FLAG))).map((folder) => folder.id);
	if (folders.length) await foundry.utils.getDocumentClass("Folder").deleteDocuments(folders);
	return entries.length;
}

/** Register the setting, and follow every Realm's changes. Called during init. */
export function registerHexJournals() {
	game.settings.register(SYSTEM_ID, HEX_JOURNALS_SETTING, {
		name: "bastionland.hexJournal.setting.name",
		hint: "bastionland.hexJournal.setting.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		onChange: (on) => on && syncEveryRealm()
	});

	// What's kept for a hex, its visits, what was told and the Company's note are all the Scene's flags.
	Hooks.on("updateScene", (scene, changes) => {
		if (changes.flags?.[SYSTEM_ID]) syncSoon(scene.id);
	});
	// A Realm is read from its Tiles and Drawings, so a Holding renamed or a Myth found changes its hex's entry.
	const onDocument = (document) => syncSoon(document.parent?.id);
	for (const name of ["createTile", "updateTile", "deleteTile", "createDrawing", "updateDrawing", "deleteDrawing"]) {
		Hooks.on(name, onDocument);
	}
}
