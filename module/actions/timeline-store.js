import { askActiveGMOrWarn } from "../ask-gm-warn.js";
import { t, warn } from "../chat/cards.js";
import { deletionEntry } from "../compat.js";
import { gmAsker } from "../gm-asker.js";
import { isKnight } from "../rules/knight-types.js";
import { REALM_DRAWING_FLAG } from "../rules/realm-drawing.js";
import { keyedSerialWrites, serialWrites } from "../rules/queue.js";
import {
	COMPANY_TRACK,
	TIMELINE_JOURNAL_FLAG,
	TIMELINE_PAGE_TYPE,
	TRACK_KINDS,
	addEntry,
	applyTrackWrite,
	entriesDiff,
	isLeftover,
	normalizeEntry,
	readEntries,
	realmSceneId,
	realmTrackId,
	upsertByKey
} from "../rules/timeline.js";
import { SYSTEM_ID } from "../system-id.js";
import { JOURNEY_FLAG, glimpsedBy, realmKnownToPlayers } from "./journey.js";
import { afterBurst } from "./kept-journals.js";
import { inCompany, worldKnights } from "./knights.js";
import { isDrawingRealm, isRealmScene } from "./realm.js";

/**
 * Where the Timeline is kept: one Journal entry everyone owns, so a player
 * can write their own thread with no Referee online, holding a page for
 * each thread. Borrowed from the Stonetop system's timeline store. The thread
 * of a Knight or Domain no player can see, such as a rival's, or of a Realm
 * the players don't know of, is on a page kept for the Referee alone. Only the
 * active Referee's browser makes a thread's page, so no thread gets two, and
 * only a Referee deletes the Timeline or any of its pages.
 */

/** A write to a thread a player's browser can't make or write, asked of the active Referee. */
export const TRACK_WRITE_QUERY = `${SYSTEM_ID}.timelineWrite`;

/** The Timeline's entry's id as last found: a render asks for it many times, and each search goes through every journal. */
let timelineJournalId = null;

/** @returns {JournalEntry|null} */
export function findTimelineJournal() {
	const journals = game.journal;
	const known = timelineJournalId ? journals?.get?.(timelineJournalId) : null;
	// Still there and still the Timeline: neither deleted nor unflagged since.
	if (known?.getFlag(SYSTEM_ID, TIMELINE_JOURNAL_FLAG)) return known;
	const found = journals?.find((entry) => entry.getFlag(SYSTEM_ID, TIMELINE_JOURNAL_FLAG)) ?? null;
	timelineJournalId = found?.id ?? null;
	return found;
}

/**
 * @param {JournalEntry|null} journal
 * @returns {JournalEntryPage[]} Its threads' pages.
 */
export const timelinePages = (journal) => journal?.pages?.filter((page) => page.type === TIMELINE_PAGE_TYPE) ?? [];

/**
 * @param {JournalEntryPage} page
 * @returns {string} The thread it keeps, or "" for a page made by hand.
 */
export const pageTrackId = (page) => String(page?.system?.trackId ?? "");

/**
 * @param {JournalEntryPage} page
 * @returns {boolean} Whether it's one of the Timeline's own pages.
 */
export const isTimelinePage = (page) => page?.type === TIMELINE_PAGE_TYPE && Boolean(page.parent?.getFlag?.(SYSTEM_ID, TIMELINE_JOURNAL_FLAG));

/**
 * @param {string} trackId
 * @returns {JournalEntryPage|null}
 */
export const findTrackPage = (trackId) => timelinePages(findTimelineJournal()).find((page) => pageTrackId(page) === trackId) ?? null;

/**
 * @param {JournalEntryPage} page
 * @returns {boolean} Whether this user can read it: a Referee-only page is hidden from players.
 */
const readable = (page) => Boolean(game.user?.isGM) || (page.testUserPermission?.(game.user, "OBSERVER") ?? true);

/**
 * @param {JournalEntry|null} journal
 * @returns {JournalEntryPage[]} The threads' pages this user can read.
 */
const readablePages = (journal) => timelinePages(journal).filter(readable);

/**
 * Whether any player can see an actor or a Scene, now or once they join: one
 * seen by nobody but the Referee, such as a rival Domain, has its thread kept from players.
 * @param {Actor|Scene} document
 * @param {string} [level] How much of it they must see: an actor's sheet, or a Scene's glimpse.
 * @returns {boolean} False where it can't be told, before Foundry is ready:
 *   a row the players shouldn't read is worse than one missing.
 */
function seenByPlayers(document, level = "OBSERVER") {
	const least = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.[level];
	if (least === undefined || !globalThis.game) return false;
	return Object.entries(document.ownership ?? {}).some(([id, held]) => held >= least && (id === "default" || game.users?.get(id)?.isGM === false));
}

/**
 * @param {Scene} scene A Realm.
 * @returns {boolean} Whether its thread is kept from the players: a Realm they don't know of, its name among them.
 */
const realmKept = (scene) => !realmKnownToPlayers(scene, (realm) => seenByPlayers(realm, "LIMITED"));

/**
 * @typedef {object} Track
 * @property {string} trackId
 * @property {string} kind One of TRACK_KINDS.
 * @property {string} name
 * @property {boolean} [secret] Kept for the Referee alone: no player can see its Knight or Domain, or knows of its Realm.
 */

/**
 * The thread something has: the Company's, a Knight's, a Domain's or a Realm's.
 * Never throws: before Foundry is ready a Knight's or Domain's thread is kept
 * from the players, and the Company's goes by its id.
 * @param {Actor|Scene|string} target An actor, a Realm's Scene, or COMPANY_TRACK.
 * @returns {Track|null}
 */
export function trackFor(target) {
	if (target === COMPANY_TRACK) return { trackId: COMPANY_TRACK, kind: "company", name: globalThis.game?.i18n ? t("timeline.company") : COMPANY_TRACK };
	if (!target?.id) return null;
	if (target.documentName === "Scene") return isRealmScene(target) ? { trackId: realmTrackId(target.id), kind: "realm", name: target.name, secret: realmKept(target) } : null;
	const kind = isKnight(target) ? "knight" : target.type === "domain" ? "domain" : null;
	return kind ? { trackId: target.id, kind, name: target.name, secret: !seenByPlayers(target) } : null;
}

/**
 * Every thread the world should have a page for: the Company's, each played
 * Knight's, each Domain's and each Realm's. An NPC Knight's is made when
 * something first happens to it.
 * @returns {Track[]}
 */
function worldTracks() {
	return [
		trackFor(COMPANY_TRACK),
		...worldKnights(inCompany).map(trackFor),
		...(game.actors?.contents ?? []).filter((actor) => actor.type === "domain").map(trackFor),
		...(game.scenes?.contents ?? []).map(trackFor)
	].filter(Boolean);
}

/**
 * The thread's name as it reads now: its actor's or Scene's, or the page's
 * own once they're gone, so a fallen Knight's thread keeps their name.
 * @param {{trackId: string, kind: string, page?: JournalEntryPage}} track
 * @returns {string}
 */
export function trackDisplayName({ trackId, kind, page }) {
	if (kind === "company") return t("timeline.company");
	const live = kind === "realm" ? game.scenes?.get(realmSceneId(trackId)) : game.actors?.get(trackId);
	return live?.name ?? page?.name ?? trackId;
}

/**
 * @param {JournalEntryPage} page
 * @returns {{trackId: string, kind: string, name: string, entries: object, page: JournalEntryPage}} The thread it keeps.
 */
export function trackOfPage(page) {
	const track = { trackId: pageTrackId(page), kind: page.system?.trackKind ?? "", page };
	return { ...track, name: trackDisplayName(track), entries: page.system?.entries ?? {} };
}

/**
 * Every thread with a page, the Company first, then the Knights, the
 * Domains and the Realms, each in the journal's order.
 * @returns {ReturnType<typeof trackOfPage>[]}
 */
export function allTracks() {
	const seen = new Set();
	const rank = (page) => TRACK_KINDS.indexOf(page.system?.trackKind);
	return readablePages(findTimelineJournal())
		.filter((page) => {
			const id = pageTrackId(page);
			if (!id || seen.has(id)) return false;
			seen.add(id);
			return true;
		})
		.sort((a, b) => rank(a) - rank(b) || (a.sort ?? 0) - (b.sort ?? 0))
		.map(trackOfPage);
}

/**
 * Something read from a thread's entries once for each write, rather than on
 * every look: every write to a page replaces its entries, so what was read
 * from the ones it had is kept by them, and let go with them.
 * @template T
 * @param {(entries: object|object[]) => T} read
 * @param {T} none What a page with no entries reads as.
 * @returns {(entries: object|object[]|undefined) => T} Takes a thread's entries, as kept.
 */
export function readOncePerWrite(read, none) {
	const kept = new WeakMap();
	return (entries) => {
		if (!entries || typeof entries !== "object") return none;
		if (!kept.has(entries)) kept.set(entries, read(entries));
		return kept.get(entries);
	};
}

/** The Seasons a thread's entries fall in. */
const seasonsOf = readOncePerWrite((entries) => [...new Set(readEntries(entries).map((entry) => entry.season).filter(Boolean))], []);

/**
 * @param {{entries: object}[]} [tracks] Every thread's page this user can read, as it's kept, when none are given.
 * @returns {Set<string>} Every Season anything on the Timeline falls in.
 */
export function allSeasons(tracks = readablePages(findTimelineJournal()).map((page) => ({ entries: page.system?.entries }))) {
	const seasons = new Set();
	for (const track of tracks) for (const season of seasonsOf(track.entries)) seasons.add(season);
	return seasons;
}

const SORT_STEP = 10;
const maxSort = (journal) => Math.max(0, ...timelinePages(journal).map((page) => page.sort ?? 0));

/**
 * @param {Track} track
 * @returns {number} Its page's default ownership: none for a thread kept for the Referee, else the Timeline's own.
 */
const pageDefault = (track) => (track.secret ? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE : CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT);

/**
 * The flag a page keeps the default ownership the system last gave it in, so
 * one the Referee has since shown or hidden by hand is told from it.
 */
const SET_DEFAULT_FLAG = "setDefault";

/**
 * @param {number} level
 * @returns {object} A page's default ownership, as the system sets it.
 */
const defaultChange = (level) => ({ "ownership.default": level, [`flags.${SYSTEM_ID}.${SET_DEFAULT_FLAG}`]: level });

/**
 * @param {JournalEntryPage} page
 * @returns {boolean} Whether its default ownership is still the one the system gave it. A page from before
 *   that was kept goes by whether it's shown or hidden as the system would.
 */
function defaultBySystem(page) {
	const current = page.ownership?.default;
	const set = page.flags?.[SYSTEM_ID]?.[SET_DEFAULT_FLAG];
	const { INHERIT, NONE } = CONST.DOCUMENT_OWNERSHIP_LEVELS;
	return set === undefined ? [INHERIT, NONE].includes(current) : set === current;
}

/** One thread's new page, however it comes to be made. */
const pageData = (track, sort) => ({
	name: track.name || track.trackId,
	type: TIMELINE_PAGE_TYPE,
	sort,
	ownership: { default: pageDefault(track) },
	flags: { [SYSTEM_ID]: { [SET_DEFAULT_FLAG]: pageDefault(track) } },
	system: { trackKind: track.kind, trackId: track.trackId, entries: {} }
});

/** Pages are made one go at a time, so two goes never make the same page twice. */
const pageWrites = serialWrites();

/** The active Referee's browser keeps the Timeline, so two Referees never make two. */
const keepsTheTimeline = () => Boolean(game.user?.isGM && game.users?.activeGM?.isSelf);

/**
 * The Timeline's Journal entry, made the first time the active Referee wants it.
 * @returns {Promise<JournalEntry|null>}
 */
export async function ensureTimelineJournal() {
	const existing = findTimelineJournal();
	if (existing || !keepsTheTimeline()) return existing;
	return foundry.utils.getDocumentClass("JournalEntry").create({
		name: t("timeline.journal"),
		ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
		flags: { [SYSTEM_ID]: { [TIMELINE_JOURNAL_FLAG]: true } }
	});
}

/**
 * A thread's page, made if it has none yet, by the active Referee alone: the
 * syncing of pages is theirs, so a page another browser made beside it would
 * give the thread two.
 * @param {Track} track
 * @returns {Promise<JournalEntryPage|null>} Null on any other browser while there's none.
 */
export function ensureTrackPage(track) {
	if (!track?.trackId) return Promise.resolve(null);
	const existing = findTrackPage(track.trackId);
	if (existing || !keepsTheTimeline()) return Promise.resolve(existing);
	return pageWrites(async () => {
		const made = findTrackPage(track.trackId);
		if (made) return made;
		const journal = await ensureTimelineJournal();
		if (!journal?.isOwner) return null;
		const [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [pageData(track, maxSort(journal) + SORT_STEP)]);
		return page ?? null;
	});
}

/**
 * Write a thread's entries back, only what changed: an added entry whole, a
 * changed one field by field, a removed one deleted by its key. Someone
 * else's write to another row, or another field, is left standing.
 * @param {JournalEntryPage} page
 * @param {object[]} entries
 * @returns {Promise<boolean>} Whether anything changed.
 */
async function writeEntries(page, entries) {
	const diff = entriesDiff(page.system?.entries, entries);
	if (!diff) return false;
	const update = {};
	for (const [id, entry] of Object.entries(diff.added)) update[`system.entries.${id}`] = entry;
	for (const [id, fields] of Object.entries(diff.changed)) for (const [field, value] of Object.entries(fields)) update[`system.entries.${id}.${field}`] = value;
	const leftovers = Object.entries(page.system?.entries ?? {}).filter(([, entry]) => isLeftover(entry)).map(([id]) => id);
	for (const id of [...diff.removed, ...leftovers]) {
		const [key, value] = deletionEntry(`system.entries.${id}`);
		update[key] = value;
	}
	await page.update(update);
	return true;
}

/** Each thread's writes, one at a time, so a burst of them each reads what the last one wrote. */
const queueFor = keyedSerialWrites();

/** @typedef {import("../rules/timeline.js").TrackWrite} TrackWrite */

/**
 * The one way a thread's entries are written: read the page, run the write
 * over it (rules/timeline.js applyTrackWrite), write back what moved. A browser
 * that can't make the thread's page, or write one kept for the Referee, sends
 * the same write to the active Referee's.
 * @param {Track} track
 * @param {TrackWrite} write
 * @param {{create?: boolean}} [options] `create` makes the thread's page if it has none.
 * @returns {Promise<{page: JournalEntryPage|null}|null>} Null when nothing moved or there's no page; a null page when the Referee wrote it.
 */
export function mutateTrack(track, write, { create = false } = {}) {
	if (!track?.trackId) return Promise.resolve(null);
	return queueFor(track.trackId)(async () => {
		const page = findTrackPage(track.trackId) ?? (create ? await ensureTrackPage(track) : null);
		if (!page) return create ? askToWrite(track, write) : null;
		if (!page.isOwner) return askToWrite(track, write);
		const { entries } = applyTrackWrite(page.system?.entries, write, foundry.utils.randomID);
		return (await writeEntries(page, entries)) ? { page } : null;
	});
}

/**
 * Ask the active Referee to write on a thread for this browser. Edits by id
 * are the thread's keeper's alone, so a write with them is refused here, aloud.
 * @param {Track} track
 * @param {TrackWrite} write
 * @returns {Promise<{page: null}|null>}
 */
async function askToWrite(track, { rows = [], forget = [], edits = [] } = {}) {
	if (edits.length) {
		warn("timeline.refereeKeeps");
		return null;
	}
	// The Timeline's keeper asking itself would be no help. With no Referee here, or refused, the player is told it's lost.
	if (keepsTheTimeline() || (!rows.length && !forget.length)) return null;
	const notice = { absent: "timeline.needsReferee", refused: "timeline.writeRefused" };
	const written = await askActiveGMOrWarn(TRACK_WRITE_QUERY, { trackId: track.trackId, rows, forget }, "Couldn't ask the Referee to write on the Timeline", notice);
	return written ? { page: null } : null;
}

/** The most rows one ask writes or takes off: more than any one moment of play makes. */
const MAX_ASKED = 50;

/** The fields a row written again may refresh. */
const ROW_FIELDS = new Set(Object.keys(normalizeEntry({})));

/**
 * The thread a player may ask the Referee to write on: the Company's, which is
 * everyone's; a Realm's they may know of; or the thread of an actor they own.
 * @param {unknown} trackId
 * @param {User} user Who asked.
 * @returns {Track|null}
 */
function askedTrack(trackId, user) {
	const id = typeof trackId === "string" ? trackId : "";
	if (id === COMPANY_TRACK) return trackFor(COMPANY_TRACK);
	if (id && realmTrackId(realmSceneId(id)) === id) {
		const scene = game.scenes?.get(realmSceneId(id));
		return realmKnownToPlayers(scene, glimpsedBy(user)) ? trackFor(scene) : null;
	}
	const actor = id ? game.actors?.get(id) : null;
	return actor?.testUserPermission?.(user, "OWNER") ? trackFor(actor) : null;
}

/**
 * The rows a player's ask writes, each signed by who asked, whatever it says.
 * @param {unknown} rows
 * @param {User} user
 * @returns {{entry: object, refresh: string[]}[]|null} Null for an ask that isn't rows.
 */
function askedRows(rows = [], user) {
	if (!Array.isArray(rows) || rows.length > MAX_ASKED) return null;
	const clean = rows.map((row) => (row?.entry && typeof row.entry === "object"
		? { entry: { ...row.entry, authorId: user.id }, refresh: (Array.isArray(row.refresh) ? row.refresh : []).filter((field) => ROW_FIELDS.has(field)) }
		: null));
	return clean.every(Boolean) ? clean : null;
}

/**
 * @param {unknown} keys
 * @returns {string[]|null} The keys a player's ask takes off, or null for an ask that isn't keys.
 */
function askedKeys(keys = []) {
	if (!Array.isArray(keys) || keys.length > MAX_ASKED || !keys.every((key) => typeof key === "string")) return null;
	return keys;
}

/**
 * A player's write to a thread their browser couldn't make or write, done by
 * the active Referee's. Only a thread the asker may write on is written:
 * the Company's, a Realm's they know of, or an actor's they own.
 * @param {{trackId?: unknown, rows?: unknown, forget?: unknown}} data
 * @param {object} [context]
 * @returns {Promise<boolean>}
 */
export async function onTrackWriteQuery(data = {}, context = {}) {
	const asker = gmAsker(context);
	if (!asker) return false;
	const track = askedTrack(data?.trackId, asker);
	const rows = askedRows(data?.rows, asker);
	const forget = askedKeys(data?.forget);
	if (!track || !rows || !forget || (!rows.length && !forget.length)) return false;
	await mutateTrack(track, { rows, forget }, { create: true });
	return true;
}

/**
 * Take milestones' rows out of every thread, as when a Myth is unresolved, or
 * out of the only threads they can be on: each thread read and written once,
 * however many go.
 * @param {string|string[]} keys
 * @param {Track[]} [tracks] The threads to look on, if not every one.
 * @returns {Promise<void>}
 */
export async function removeKeyEverywhere(keys, tracks = allTracks()) {
	const list = [keys].flat();
	if (!list.length) return;
	await Promise.all(tracks.map((track) => mutateTrack(track, { forget: list })));
}

/**
 * @param {JournalEntryPage} a
 * @param {JournalEntryPage} b
 * @returns {number} The journal's order, then the ids', so every browser keeps the same one of two.
 */
const pageOrder = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.id).localeCompare(String(b.id));

/**
 * Fold a thread's second page into its first, as when two browsers each made
 * one before only the Referee's could: every row of the second that the first
 * hasn't got is kept, and the second goes.
 * @param {JournalEntry} journal
 * @returns {Promise<void>}
 */
async function foldTwinPages(journal) {
	const first = new Map();
	const twins = [];
	for (const page of [...timelinePages(journal)].sort(pageOrder)) {
		const id = pageTrackId(page);
		if (!id) continue;
		if (first.has(id)) twins.push([first.get(id), page]);
		else first.set(id, page);
	}
	if (!twins.length) return;
	for (const [kept, twin] of twins) {
		const folded = readEntries(twin.system?.entries).reduce(
			(entries, entry) => (entry.key ? upsertByKey(entries, entry) : addEntry(entries, entry)).entries,
			readEntries(kept.system?.entries)
		);
		await writeEntries(kept, folded);
	}
	await journal.deleteEmbeddedDocuments("JournalEntryPage", twins.map(([, twin]) => twin.id));
}

/**
 * The thread whose page may be shown to players, or kept from them, afresh:
 * an actor's whose players changed, or a Realm's still shown or kept as the
 * system set it, since a Realm comes to be known as it's shown, travelled or
 * finished. A page the Referee shared or hid by hand stays so. A Realm once
 * shown stays known though another Scene is shown in its place; only taking
 * up its drawing again keeps it from the players once more.
 * @param {{page: JournalEntryPage, trackId: string, kind: string}} thread
 * @param {string[]} seen
 * @returns {Track|null}
 */
function reseen({ page, trackId, kind }, seen) {
	if (kind !== "realm") return seen.includes(trackId) ? trackFor(game.actors?.get(trackId)) : null;
	if (!defaultBySystem(page)) return null;
	const scene = game.scenes?.get(realmSceneId(trackId));
	const track = trackFor(scene);
	const shown = page.ownership?.default === CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT;
	return track?.secret && shown && !isDrawingRealm(scene) ? { ...track, secret: false } : track;
}

/**
 * Give every thread the world should have a page, fold any thread's second
 * page into its first, and keep each page's name, and whether players read
 * it, in step with its thread's. The active Referee's alone.
 * @param {object} [options]
 * @param {string[]} [options.seen] Actors whose players changed: their pages are kept from players, or shown them, to match.
 * @returns {Promise<number>} How many pages were made.
 */
export function syncTrackPages({ seen = [] } = {}) {
	if (!keepsTheTimeline()) return Promise.resolve(0);
	return pageWrites(async () => {
		const journal = await ensureTimelineJournal();
		if (!journal) return 0;
		await foldTwinPages(journal);
		const pages = timelinePages(journal);
		const have = new Map(pages.map((page) => [pageTrackId(page), page]));
		const missing = worldTracks().filter((track) => !have.has(track.trackId));
		const changes = pages.map(trackOfPage).map((thread) => {
			const { page, name } = thread;
			const change = name && page.name !== name ? { name } : {};
			// Only where its readers may have changed, so a page the Referee shared or hid by hand stays so.
			const track = reseen(thread, seen);
			if (track && page.ownership?.default !== pageDefault(track)) Object.assign(change, defaultChange(pageDefault(track)));
			return Object.keys(change).length ? { _id: page.id, ...change } : null;
		}).filter(Boolean);
		let sort = maxSort(journal);
		if (missing.length) await journal.createEmbeddedDocuments("JournalEntryPage", missing.map((track) => pageData(track, (sort += SORT_STEP))));
		if (changes.length) await journal.updateEmbeddedDocuments("JournalEntryPage", changes);
		return missing.length;
	});
}

/** Pages are synced once a burst of changes has settled: a pack imported, several Knights made at once. */
const syncSoon = afterBurst((ids) => syncTrackPages({ seen: ids.filter(Boolean) }));

/**
 * Whether a change to a Realm's Scene may change whether the players know of
 * it: shown or hidden, its players changed, its drawing finished or taken up again, or
 * first travelled while its thread is still kept from them.
 * @param {Scene} scene
 * @param {object} changes
 * @returns {boolean}
 */
function realmShownChanged(scene, changes) {
	const has = (path) => foundry.utils.hasProperty(changes, path);
	if ("active" in changes || "ownership" in changes || has(`flags.${SYSTEM_ID}.${REALM_DRAWING_FLAG}`)) return true;
	return has(`flags.${SYSTEM_ID}.${JOURNEY_FLAG}`) && findTrackPage(realmTrackId(scene.id))?.ownership?.default === CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
}

/**
 * Keep a player from deleting the Timeline. Everyone owns it, so anyone can
 * write on any thread, and Foundry lets an owner delete it, which would take
 * every thread with it, the Referee's own among them.
 * @param {JournalEntry} journal
 * @returns {false|void} False to refuse.
 */
export function refuseTimelineDelete(journal) {
	if (game.user?.isGM || !journal?.getFlag?.(SYSTEM_ID, TIMELINE_JOURNAL_FLAG)) return;
	warn("timeline.deleteRefused");
	return false;
}

/**
 * Keep a player from deleting any page of the Timeline. Anyone may write on
 * any thread, but a page deleted takes the whole thread, other players' rows
 * and the Referee's with it, and a page kept for the Referee is one a player
 * can't even read; so deleting one is the Referee's alone.
 * @param {JournalEntryPage} page
 * @returns {false|void} False to refuse.
 */
export function refuseTimelinePageDelete(page) {
	if (game.user?.isGM || !page?.parent?.getFlag?.(SYSTEM_ID, TIMELINE_JOURNAL_FLAG)) return;
	warn("timeline.pageDeleteRefused");
	return false;
}

/**
 * Keep a page for each new thread, and each page named after its thread; keep
 * the Timeline and its pages from being deleted by players; and answer the
 * writes the active Referee's browser makes for players. Called during init.
 */
export function registerTimelineStoreHooks() {
	CONFIG.queries[TRACK_WRITE_QUERY] = onTrackWriteQuery;
	Hooks.on("preDeleteJournalEntry", refuseTimelineDelete);
	Hooks.on("preDeleteJournalEntryPage", refuseTimelinePageDelete);
	Hooks.on("createActor", (actor) => {
		if (isKnight(actor) || actor.type === "domain") syncSoon();
	});
	Hooks.on("updateActor", (actor, changes) => {
		if (!isKnight(actor) && actor.type !== "domain") return;
		const seenChanged = "ownership" in changes || "type" in changes;
		if (seenChanged || "name" in changes) syncSoon(seenChanged ? actor.id : null);
	});
	Hooks.on("createScene", (scene) => {
		if (isRealmScene(scene)) syncSoon();
	});
	Hooks.on("updateScene", (scene, changes) => {
		// A Realm's own flags change with every step and stroke: only its first wants a page.
		if (!isRealmScene(scene) || !keepsTheTimeline()) return;
		if ("name" in changes || realmShownChanged(scene, changes) || (foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}`) && !findTrackPage(realmTrackId(scene.id)))) syncSoon();
	});
}
