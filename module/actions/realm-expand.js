/**
 * What a Realm's growth moves outside its own Scene: the hexes' Journal
 * entries, the GM Toolkit's threads, the Timeline's rows and the Omen waiting
 * to be told. Each is worked out first as plain data, with every value as it
 * will be written, so the same plan can be written again should the first
 * writing be cut short. The Scene's own writes are in expandRealm (realm.js).
 * Here too is Expand the map, the Realm tool that opens the window, keeps a
 * backup first, and puts a Realm back from it.
 */
import { askToExpandRealm, backupWords, realmBackup } from "../apps/realm-expand.js";
import { confirmDialog } from "../apps/ui.js";
import { ensureDirectories, uploadFile } from "../book-art/files.js";
import { t, warn } from "../chat/cards.js";
import { deletionEntry } from "../compat.js";
import { HEX_JOURNAL_FLAG } from "../rules/hex-journal.js";
import { randomSeed } from "../rules/random.js";
import { rollNewLand } from "../rules/realm-generator.js";
import { REALM_BACKUP_FLAG, newLandHexes, sameOmenEntered, shiftJournalFlag, shiftOmenEntered, shiftThreads, shiftTimelineKey } from "../rules/realm-growth.js";
import { learntWallNow } from "../server-now.js";
import { SYSTEM_ID } from "../system-id.js";
import { theGmToolkit } from "./gm-toolkit.js";
import { hexJournalFlag } from "./hex-journals.js";
import { expandRealm, expansionRefused, getRealm, putRealmBack, sceneGeometry } from "./realm.js";
import { findTimelineJournal, timelinePages } from "./timeline-store.js";
import { OMEN_ENTERED_SETTING } from "./wilderness.js";

/**
 * @typedef {object} OutsideShifts
 * @property {{_id: string, flag: object|null, sort?: number}[]} journal Each hex entry moved, or loosed from a hex that's gone.
 * @property {{actor: string, threads: Record<string, string>}|null} threads The Toolkit's threads moved, by id.
 * @property {{journal: string, page: string, keys: Record<string, string>}[]} timeline Each Timeline page's row keys moved, by row id.
 * @property {{from: object, value: object|null}|null} omen The waiting Omen as it was and as moved, or null where it isn't this Realm's.
 */

/**
 * @param {string} sceneId
 * @param {import("../rules/realm-growth.js").Offset} offset
 * @param {object|null} [g] The geometry the hexes land in: one moved off it loses its hex.
 * @returns {OutsideShifts}
 */
export function outsideShifts(sceneId, offset, g = null) {
	const journal = [];
	for (const entry of game.journal ?? []) {
		const moved = shiftJournalFlag(hexJournalFlag(entry), sceneId, offset, g);
		if (moved) journal.push({ _id: entry.id, ...moved });
	}

	const toolkit = theGmToolkit();
	const changed = toolkit ? shiftThreads(toolkit.system?.threads ?? {}, sceneId, offset, g) : {};
	const threads = Object.keys(changed).length ? { actor: toolkit.id, threads: changed } : null;

	const timeline = [];
	const book = findTimelineJournal();
	for (const page of timelinePages(book)) {
		const keys = {};
		for (const [id, row] of Object.entries(page.system?.entries ?? {})) {
			const key = shiftTimelineKey(row?.key, sceneId, offset, g);
			if (key && key !== row.key) keys[id] = key;
		}
		if (Object.keys(keys).length) timeline.push({ journal: book.id, page: page.id, keys });
	}

	const said = game.settings.get(SYSTEM_ID, OMEN_ENTERED_SETTING);
	const value = shiftOmenEntered(said, sceneId, offset, g);
	return { journal, threads, timeline, omen: value === undefined ? null : { from: said, value } };
}

/**
 * Write what outsideShifts worked out. Every value is written whole, so
 * writing it twice does no harm, and each document is its own write, so all
 * are written at once.
 * @param {OutsideShifts} shifts
 * @returns {Promise<void>}
 */
export async function writeOutsideShifts(shifts) {
	const writes = [];
	if (shifts.journal.length) {
		const path = `flags.${SYSTEM_ID}.${HEX_JOURNAL_FLAG}`;
		const updates = shifts.journal
			.filter(({ _id }) => game.journal.get(_id))
			.map(({ _id, flag, sort }) => (flag
				? { _id, sort, [`${path}.hex`]: flag.hex }
				// Loosed from its hex, an entry is kept as the Referee's own rather than taken for another hex's.
				: { _id, ...Object.fromEntries([deletionEntry(path)]) }));
		if (updates.length) writes.push(CONFIG.JournalEntry.documentClass.updateDocuments(updates));
	}
	// Only those still kept: a plan written again later mustn't bring back, as a stub, one settled or deleted since.
	if (shifts.threads) {
		const actor = game.actors.get(shifts.threads.actor);
		const kept = actor?.system?.threads ?? {};
		const update = Object.fromEntries(Object.entries(shifts.threads.threads).filter(([id]) => kept[id]).map(([id, hex]) => [`system.threads.${id}.hex`, hex]));
		if (Object.keys(update).length) writes.push(actor.update(update));
	}
	// Each Timeline's pages in one write.
	const pages = new Map();
	for (const { journal, page, keys } of shifts.timeline) {
		const book = game.journal.get(journal);
		const rows = book?.pages.get(page)?.system?.entries ?? {};
		const update = Object.fromEntries(Object.entries(keys).filter(([id]) => rows[id]).map(([id, key]) => [`system.entries.${id}.key`, key]));
		if (Object.keys(update).length) pages.set(book, [...(pages.get(book) ?? []), { _id: page, ...update }]);
	}
	for (const [book, updates] of pages) writes.push(book.updateEmbeddedDocuments("JournalEntryPage", updates));
	// Only while the setting still holds the entry the plan moved: one entered since, on any Realm, is left as it is.
	if (shifts.omen && sameOmenEntered(game.settings.get(SYSTEM_ID, OMEN_ENTERED_SETTING), shifts.omen.from)) {
		writes.push(game.settings.set(SYSTEM_ID, OMEN_ENTERED_SETTING, shifts.omen.value));
	}
	await Promise.all(writes);
}

/** Where a world's Realm backups are kept, under its own folder on the server. */
const backupDir = () => `worlds/${game.world.id}/bastionland-backups`;

/**
 * @param {Scene} scene
 * @param {import("../rules/realm-growth.js").Growth} growth The growth about to be made.
 * @param {number} when The time of day, shown to the Referee: Foundry's server time counts only from the server's start.
 * @returns {object} All a backup holds: the whole Scene, the growth, the system's version and the time.
 */
const backupData = (scene, growth, when) => ({
	scene: scene.toObject(),
	growth,
	system: game.system?.version ?? "",
	when
});

/**
 * Keep a backup of a Realm Scene before it grows: one file on the server for
 * each Scene, the latest, as Foundry gives no way to delete a file, which the
 * Realm can be put back from. Should it not be saved, the Referee is asked
 * whether to go on without it.
 * @param {Scene} scene
 * @param {import("../rules/realm-growth.js").Growth} growth
 * @returns {Promise<boolean>} Whether to go on.
 */
export async function keepRealmBackup(scene, growth) {
	const data = backupData(scene, growth, await learntWallNow());
	const text = JSON.stringify(data);
	const name = `realm-${scene.id}.json`;
	const dir = backupDir();
	await ensureDirectories([`worlds/${game.world.id}`, dir]);
	const path = await uploadFile(dir, new File([text], name, { type: "application/json" }));
	if (path) {
		await scene.setFlag(SYSTEM_ID, REALM_BACKUP_FLAG, { path, when: data.when });
		return true;
	}
	return confirmDialog({ title: t("realm.expand.backup.failedTitle"), icon: "fa-solid fa-triangle-exclamation", message: [t("realm.expand.backup.failed")] });
}

/**
 * @param {Scene} scene
 * @param {{path: string, when: number}|null} [kept] Which backup: the one the Scene names, if not given.
 * @returns {Promise<object|null>} The backup the Realm was last kept in before an expansion, read from the server.
 */
export async function readRealmBackup(scene, kept = realmBackup(scene)) {
	if (typeof kept?.path !== "string" || !Number.isFinite(kept.when)) return null;
	try {
		const response = await fetch(`${foundry.utils.getRoute(kept.path)}?${kept.when}`, { cache: "no-store" });
		if (!response.ok) return null;
		const data = await response.json();
		return data?.scene?._id === scene.id ? data : null;
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't read the Realm's backup`, error);
		return null;
	}
}

/**
 * Put a Realm back as its backup holds it, once the Referee has been told
 * plainly what that loses.
 * @param {Scene} scene
 * @returns {Promise<boolean>}
 */
async function offerPutBack(scene) {
	const kept = realmBackup(scene);
	if (!kept) return false;
	const words = backupWords(kept.when, scene.name);
	const confirmed = await confirmDialog({
		title: t("realm.expand.restore.title"),
		icon: "fa-solid fa-clock-rotate-left",
		message: [words.confirm, t("realm.expand.restore.kept")]
	});
	if (!confirmed) return false;
	const backup = await readRealmBackup(scene);
	if (!backup) {
		warn("realm.expand.restore.unreadable");
		return false;
	}
	const done = await putRealmBack(scene, backup);
	if (done) ui.notifications.info(words.done);
	return done;
}

/**
 * Expand the map, from the Realm tools: the window, then the growth it asks
 * for, or the Realm put back from its backup. GMs only.
 * @param {Scene} scene
 * @returns {Promise<boolean>} Whether the Realm changed.
 */
export async function openExpandRealm(scene) {
	const refused = await expansionRefused(scene);
	if (refused) {
		warn(`realm.expand.refused.${refused}`);
		return false;
	}
	const { realm } = getRealm(scene);
	const choice = await askToExpandRealm(scene, realm, sceneGeometry(scene));
	if (!choice) return false;
	if (choice.action === "restore") return offerPutBack(scene);

	const seed = randomSeed();
	const land = (grown, from, to) => {
		const added = newLandHexes(from, choice.growth);
		let next = choice.land === "roll" || choice.features
			? rollNewLand({ seed, realm: grown, geometry: to, added, terrain: choice.land === "roll", features: choice.features })
			: grown;
		// New land outside a picture is drawn in the Realm's own ink, the picture still drawing the rest.
		if (choice.inkOutside && next.picture?.players) next = { ...next, picture: { ...next.picture, players: { ...next.picture.players, inkOutside: true } } };
		return next;
	};
	const grew = await expandRealm(scene, choice.growth, {
		keepNumbers: choice.keepNumbers,
		land,
		backup: choice.backup ? keepRealmBackup : null
	});
	if (grew) {
		const g = sceneGeometry(scene);
		ui.notifications.info(t("realm.expand.done", { realm: scene.name, cols: g.cols, rows: g.rows }));
	}
	return grew;
}
