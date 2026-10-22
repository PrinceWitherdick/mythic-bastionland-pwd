import { t } from "../chat/cards.js";
import { deletionEntry } from "../compat.js";
import { serialWrites } from "../rules/queue.js";
import { COMPANY_TRACK, TIMELINE_JOURNAL_FLAG, TIMELINE_PAGE_TYPE, TRACK_KINDS, entriesDiff, isLeftover, readEntries, realmSceneId, realmTrackId, removeByKey } from "../rules/timeline.js";
import { SYSTEM_ID } from "../system-id.js";
import { afterBurst } from "./kept-journals.js";
import { worldKnights } from "./knights.js";
import { isRealmScene } from "./realm.js";

/**
 * Where the Timeline is kept: one Journal entry everyone owns, so a player
 * can write their own thread with no Referee online, holding a page for
 * each thread. Borrowed from the Stonetop system's timeline store. The thread
 * of a Knight or Domain no player can see, such as a rival's, is on a page
 * kept for the Referee alone.
 */

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
 * Whether any player can see an actor, now or once they join: one seen by
 * nobody but the Referee, such as a rival Domain, has its thread kept from players.
 * @param {Actor} actor
 * @returns {boolean} False where it can't be told, before Foundry is ready:
 *   a row the players shouldn't read is worse than one missing.
 */
function seenByPlayers(actor) {
	const OBSERVER = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER;
	if (OBSERVER === undefined || !globalThis.game) return false;
	return Object.entries(actor.ownership ?? {}).some(([id, level]) => level >= OBSERVER && (id === "default" || game.users?.get(id)?.isGM === false));
}

/**
 * @typedef {object} Track
 * @property {string} trackId
 * @property {string} kind One of TRACK_KINDS.
 * @property {string} name
 * @property {boolean} [secret] Kept for the Referee alone: no player can see its Knight or Domain.
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
	if (target.documentName === "Scene") return isRealmScene(target) ? { trackId: realmTrackId(target.id), kind: "realm", name: target.name } : null;
	if (target.type === "knight" || target.type === "domain") return { trackId: target.id, kind: target.type, name: target.name, secret: !seenByPlayers(target) };
	return null;
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
		...worldKnights((knight) => knight.hasPlayerOwner).map(trackFor),
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

/** One thread's new page, however it comes to be made. */
const pageData = (track, sort) => ({
	name: track.name || track.trackId,
	type: TIMELINE_PAGE_TYPE,
	sort,
	ownership: { default: pageDefault(track) },
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
 * A thread's page, made if it has none yet. Anyone who owns the Timeline can
 * make one; only the active Referee can make the Timeline itself.
 * @param {Track} track
 * @returns {Promise<JournalEntryPage|null>}
 */
export function ensureTrackPage(track) {
	if (!track?.trackId) return Promise.resolve(null);
	const existing = findTrackPage(track.trackId);
	if (existing) return Promise.resolve(existing);
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
const trackWrites = new Map();
const queueFor = (trackId) => {
	if (!trackWrites.has(trackId)) trackWrites.set(trackId, serialWrites());
	return trackWrites.get(trackId);
};

/**
 * The one way a thread's entries are written: read the page, run one of
 * rules/timeline.js's changes over it, write back what moved.
 * @param {Track} track
 * @param {(entries: object[]) => {entries: object[]}} change
 * @param {{create?: boolean}} [options] `create` makes the thread's page if it has none.
 * @returns {Promise<{page: JournalEntryPage}|null>} Null when nothing moved or there's no page.
 */
export function mutateTrack(track, change, { create = false } = {}) {
	if (!track?.trackId) return Promise.resolve(null);
	return queueFor(track.trackId)(async () => {
		const page = findTrackPage(track.trackId) ?? (create ? await ensureTrackPage(track) : null);
		// A player's browser can't write a thread kept for the Referee.
		if (!page?.isOwner) return null;
		const result = change(readEntries(page.system?.entries));
		return result && (await writeEntries(page, result.entries)) ? { page } : null;
	});
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
	await Promise.all(tracks.map((track) => mutateTrack(track, (entries) => ({
		entries: list.reduce((current, key) => removeByKey(current, key).entries, entries)
	}))));
}

/**
 * Give every thread the world should have a page, and keep each page's name
 * in step with its thread's. The active Referee's alone.
 * @param {object} [options]
 * @param {string[]} [options.seen] Actors whose players changed: their pages are kept from players, or shown them, to match.
 * @returns {Promise<number>} How many pages were made.
 */
export function syncTrackPages({ seen = [] } = {}) {
	if (!keepsTheTimeline()) return Promise.resolve(0);
	return pageWrites(async () => {
		const journal = await ensureTimelineJournal();
		if (!journal) return 0;
		const pages = timelinePages(journal);
		const have = new Map(pages.map((page) => [pageTrackId(page), page]));
		const missing = worldTracks().filter((track) => !have.has(track.trackId));
		const changes = pages.map(trackOfPage).map(({ page, trackId, name }) => {
			const change = name && page.name !== name ? { name } : {};
			// Only for an actor whose players changed, so a page the Referee shared or hid by hand stays so.
			const track = seen.includes(trackId) ? trackFor(game.actors?.get(trackId)) : null;
			if (track && page.ownership?.default !== pageDefault(track)) change["ownership.default"] = pageDefault(track);
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

/** Keep a page for each new thread, and each page named after its thread. */
export function registerTimelineStoreHooks() {
	Hooks.on("createActor", (actor) => {
		if (actor.type === "knight" || actor.type === "domain") syncSoon();
	});
	Hooks.on("updateActor", (actor, changes) => {
		if ((actor.type === "knight" || actor.type === "domain") && ("name" in changes || "ownership" in changes)) syncSoon("ownership" in changes ? actor.id : null);
	});
	Hooks.on("createScene", (scene) => {
		if (isRealmScene(scene)) syncSoon();
	});
	Hooks.on("updateScene", (scene, changes) => {
		// A Realm's own flags change with every step and stroke: only its first wants a page.
		if (!isRealmScene(scene) || !keepsTheTimeline()) return;
		if ("name" in changes || (foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}`) && !findTrackPage(realmTrackId(scene.id)))) syncSoon();
	});
}
