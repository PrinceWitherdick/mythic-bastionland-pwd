import { t } from "../chat/cards.js";
import { journalPlan } from "../rules/hex-journal.js";
import { SITE_JOURNALS_FOLDER_FLAG, SITE_JOURNAL_FLAG, SITE_LAYOUT, foundMarkdown, siteMarkdown } from "../rules/site-journal.js";
import { isBlankSite } from "../rules/sites.js";
import { serialWrites } from "../rules/queue.js";
import { SYSTEM_ID } from "../system-id.js";
import { read } from "../client-settings.js";
import { JOURNAL_FOLDER_COLOR, findFlaggedFolder, flaggedFolder } from "./folders.js";
import { afterBurst, entrySnapshot, openKeptJournal, pageByRole, pageWords, withHtml, writePlannedPages } from "./kept-journals.js";
import { isSiteEntry, readSite } from "./sites.js";

/**
 * Each Site something is drawn or written on gets a Journal entry of its own,
 * kept up to date as the Site changes: the whole Site for GMs, what the
 * Company has found of it, and a Notes page that is the GM's alone. It's made
 * hidden, and only a GM shares it; even then, players see only what they've
 * found. The pages' words are made in rules/site-journal.js. The active GM's
 * browser does the writing, so two GMs don't each make one.
 */

/** The world setting that turns Site journals on. */
export const SITE_JOURNALS_SETTING = "siteJournals";

/** @returns {boolean} Whether Sites get Journal entries in this world. */
export const siteJournalsOn = () => read(SITE_JOURNALS_SETTING, false) !== false;

/** @returns {boolean} Whether this browser is the one that writes them, the setting aside. */
const writesJournals = () => Boolean(game.user?.isGM && game.users?.activeGM?.isSelf);

/** @returns {boolean} Whether this browser is the one that writes them. */
const keepsJournals = () => writesJournals() && siteJournalsOn();

/**
 * @param {JournalEntry} entry
 * @returns {{site: string}|null} Which Site the entry is the journal of, if it's one.
 */
export const siteJournalFlag = (entry) => entry?.flags?.[SYSTEM_ID]?.[SITE_JOURNAL_FLAG] ?? null;

/**
 * @param {JournalEntry|string|null} site The Site's entry, or its id.
 * @returns {JournalEntry|null} The Site's journal, if it has one.
 */
export function siteJournalEntry(site) {
	const id = typeof site === "string" ? site : site?.id;
	if (!id) return null;
	return (game.journal ?? []).find((entry) => siteJournalFlag(entry)?.site === id) ?? null;
}

/**
 * @param {JournalEntry} entry A Site.
 * @param {object} [site] The Site, when it's already read.
 * @returns {boolean} Whether the Site has, or is due, a journal: something is drawn or written on it.
 */
export const hasSiteJournal = (entry, site = readSite(entry)) => siteJournalsOn() && (!isBlankSite(site) || Boolean(siteJournalEntry(entry)));

/**
 * The Journal folder Site journals are filed in, made the first time it's wanted.
 * @returns {Promise<Folder|null>}
 */
const journalsFolder = () => flaggedFolder("JournalEntry", SITE_JOURNALS_FOLDER_FLAG, true, {
	name: t("siteJournal.folder"),
	color: JOURNAL_FOLDER_COLOR,
	sorting: "a"
});

/** @returns {string} A kind of point, route or entrance, as the Site's key names it. */
const kindLabel = (group, kind) => t(`sites.${group}.${kind}.label`);

/** @returns {import("../rules/site-journal.js").SiteJournalWords} */
const journalWords = () => ({
	point: (number, kind) => t("sites.map.point", { number, kind: kindLabel("points", kind) }),
	entrance: (kind, number) => t("sites.map.entrance", { number, kind: kindLabel("entrances", kind) }),
	entranceAway: (kind) => t("siteJournal.entranceAway", { kind: kindLabel("entrances", kind) }),
	routeTo: (kind, to) => t(`sites.routes.${kind}.to`, { number: to }),
	route: (kind, from, to) => t("sites.map.route", { from, to, kind: kindLabel("routes", kind) }),
	routeOut: (kind, from) => t("siteJournal.routeOut", { from, kind: kindLabel("routes", kind) }),
	routeAway: (kind) => t("siteJournal.routeAway", { kind: kindLabel("routes", kind) }),
	glimpsed: (count) => t("siteJournal.glimpsed", { count }),
	labels: {
		place: t("sites.key.notes"),
		points: t("sites.key.points"),
		entrances: t("sites.entrances.heading"),
		routes: t("siteJournal.routes"),
		found: t("siteJournal.found"),
		notFound: t("siteJournal.notFound"),
		noPoints: t("siteJournal.noPoints"),
		nothingFound: t("siteJournal.nothingFound")
	}
});

/**
 * Bring a Site's journal up to date, making it once the Site has something
 * drawn or written on it. Only what changed is written, the Notes page is
 * never written over, and who may see the entry is left to the GMs. The
 * active GM's browser alone.
 * @param {JournalEntry|null} siteEntry
 * @returns {Promise<void>}
 */
export async function syncSiteJournal(siteEntry) {
	if (!keepsJournals() || !isSiteEntry(siteEntry) || !game.journal?.has(siteEntry.id)) return;
	const site = readSite(siteEntry);
	const document = siteJournalEntry(siteEntry);
	if (!document && isBlankSite(site)) return;

	const words = journalWords();
	const wanted = {
		name: siteEntry.name,
		open: false,
		pages: {
			site: { name: t("siteJournal.pages.site"), markdown: siteMarkdown(site, words) },
			found: { name: t("siteJournal.pages.found"), markdown: foundMarkdown(site, words) },
			notes: { name: t("siteJournal.pages.notes"), markdown: "" }
		}
	};
	const plan = journalPlan(document ? entrySnapshot(document, SITE_LAYOUT) : null, wanted, SITE_LAYOUT);
	const JournalEntry = foundry.utils.getDocumentClass("JournalEntry");
	if (plan.create) {
		const folder = await journalsFolder();
		await JournalEntry.create({ ...plan.create, pages: withHtml(plan.create.pages), folder: folder?.id ?? null, flags: { [SYSTEM_ID]: { [SITE_JOURNAL_FLAG]: { site: siteEntry.id } } } });
		return;
	}
	await Promise.all([
		plan.update ? document.update(plan.update) : null,
		writePlannedPages(document, plan.pages)
	]);
}

/** Syncs, taken one at a time, so a Site's journal is never made twice. */
const queueSync = serialWrites();

/**
 * Bring a Site's journal up to date now, rather than once a burst of writes is
 * over, in turn with every other sync.
 * @param {JournalEntry|null} siteEntry
 * @returns {Promise<void>}
 */
export const keepSiteJournal = (siteEntry) => queueSync(() => syncSiteJournal(siteEntry));

/** Waits for a burst of writes to stop, as the map writes a Site a little at a time, then brings the Sites' journals up to date one after another. */
const syncLater = afterBurst((ids) => {
	for (const id of ids) {
		queueSync(() => syncSiteJournal(game.journal.get(id))).catch((error) => console.error(`${SYSTEM_ID} | Couldn't bring a Site's Journal entry up to date`, error));
	}
});

/** @param {string|undefined} siteId */
function syncSoon(siteId) {
	if (siteId && keepsJournals()) syncLater(siteId);
}

/** Every Site's journal, as the world loads or the setting is turned on. */
export function syncEverySite() {
	for (const entry of game.journal ?? []) if (isSiteEntry(entry)) syncSoon(entry.id);
}

/**
 * Open a Site's journal, making it first if it's due one and hasn't got it yet.
 * @param {JournalEntry} siteEntry
 * @returns {Promise<JournalEntry|null>}
 */
export const openSiteJournal = (siteEntry) => openKeptJournal({
	find: () => siteJournalEntry(siteEntry),
	on: siteJournalsOn,
	keeps: keepsJournals,
	make: () => keepSiteJournal(siteEntry),
	none: "siteJournal.none"
});

/**
 * @param {JournalEntry} entry A Site's journal.
 * @returns {boolean} Whether the GM has written nothing on its Notes page, or it's gone.
 */
function notesBlank(entry) {
	return !pageWords(pageByRole(entry, "notes"));
}

/**
 * Delete the journals of Sites that are going.
 * @param {string[]} siteIds
 * @param {object} [options]
 * @param {boolean} [options.keepNotes] Leave a journal the GM has written Notes in.
 * @returns {Promise<number>} How many went.
 */
export async function deleteSiteJournals(siteIds, { keepNotes = false } = {}) {
	const ids = new Set(siteIds);
	const entries = (game.journal ?? [])
		.filter((entry) => ids.has(siteJournalFlag(entry)?.site) && (!keepNotes || notesBlank(entry)))
		.map((entry) => entry.id);
	if (!entries.length) return 0;
	await foundry.utils.getDocumentClass("JournalEntry").deleteDocuments(entries);
	// The folder goes too once nothing is left in it. It's made again with the next journal.
	const folder = findFlaggedFolder("JournalEntry", SITE_JOURNALS_FOLDER_FLAG, true);
	const inside = (document) => (document.folder?.id ?? document.folder) === folder?.id;
	if (folder && !game.journal.some(inside) && !game.folders.some(inside)) await foundry.utils.getDocumentClass("Folder").deleteDocuments([folder.id]);
	return entries.length;
}

/** Register the setting, and follow every Site's changes. Called during init. */
export function registerSiteJournals() {
	game.settings.register(SYSTEM_ID, SITE_JOURNALS_SETTING, {
		name: "bastionland.siteJournal.setting.name",
		hint: "bastionland.siteJournal.setting.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		onChange: (on) => on && syncEverySite()
	});

	Hooks.on("createJournalEntry", (entry) => {
		if (isSiteEntry(entry)) syncSoon(entry.id);
	});
	// A Site is its entry's name and its flag. A journal has no Site flag, so its own writes don't come back here.
	Hooks.on("updateJournalEntry", (entry, changes) => {
		if (isSiteEntry(entry) && ("name" in changes || changes.flags?.[SYSTEM_ID])) syncSoon(entry.id);
	});
	// A Site deleted takes its journal with it, unless the GM has written Notes there,
	// even with the setting off: nothing would find a journal whose Site is gone.
	Hooks.on("deleteJournalEntry", (entry) => {
		if (!isSiteEntry(entry) || !writesJournals()) return;
		queueSync(() => deleteSiteJournals([entry.id], { keepNotes: true }))
			.catch((error) => console.error(`${SYSTEM_ID} | Couldn't delete a Site's Journal entry`, error));
	});
}
