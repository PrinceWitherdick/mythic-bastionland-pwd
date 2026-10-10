/**
 * The campaign's Timeline, as plain data. Borrowed from the Stonetop
 * system's timeline: each thread of the tale (the Company, a Knight, a
 * Domain, a Realm) is one journal page holding dated entries, keyed by id.
 * An entry is dated by the Season it falls in (seasonKey, "2-harvest"), or
 * by nothing at all for what came before the tale; within a Season the table
 * says which came first. Pure, so it can be tested without Foundry; the
 * store writes it (actions/timeline-store.js).
 *
 * Every change below returns `{entries, ...}` with a null for "nothing
 * moved", so a caller can skip a write that would redraw every open sheet to
 * no effect.
 */
import { SEASON_TURNS } from "./season-log.js";
import { SEASONS, parseSeasonKey, seasonKey } from "./time.js";

/** The journal page type each thread is kept on. */
export const TIMELINE_PAGE_TYPE = "timeline";

/** Each kind of thread, in the order the full Timeline lays them out. */
export const TRACK_KINDS = Object.freeze(["company", "knight", "domain", "realm"]);

/** The Company's own thread. A Knight's or Domain's is its actor's id, a Realm's realmTrackId. */
export const COMPANY_TRACK = "company";

/** Where entries with no Season are gathered: what came before the tale. */
export const UNDATED = "";

/**
 * The Filter menu's lines, each the sources it shows or hides, in the menu's
 * order. `hand` was typed by someone, every other is a milestone the game
 * wrote as it happened. An entry from a source missing here is read as typed,
 * so a new kind must be added here first.
 */
export const KIND_GROUPS = Object.freeze({
	hand: Object.freeze(["hand"]),
	time: Object.freeze(["season", "age", "distant", "session"]),
	myth: Object.freeze(["myth"]),
	glory: Object.freeze(["rank"]),
	wounds: Object.freeze(["scar", "death"]),
	lineage: Object.freeze(["knighted", "succeeded", "tookUp"]),
	dominion: Object.freeze(["founded", "crisis", "seized", "passed", "rules", "granted"]),
	travels: Object.freeze(["visit", "note"])
});

/** What wrote each entry, every KIND_GROUPS line's sources in turn. */
export const TIMELINE_SOURCES = Object.freeze(Object.values(KIND_GROUPS).flat());

const GROUP_OF = new Map(Object.entries(KIND_GROUPS).flatMap(([group, sources]) => sources.map((source) => [source, group])));

/**
 * @param {string} source One of TIMELINE_SOURCES.
 * @returns {string} The KIND_GROUPS line it's filtered under.
 */
export const sourceGroup = (source) => GROUP_OF.get(source) ?? "hand";

const REALM_PREFIX = "realm:";

/**
 * @param {string} sceneId
 * @returns {string} The Realm's thread.
 */
export const realmTrackId = (sceneId) => `${REALM_PREFIX}${String(sceneId ?? "").trim()}`;

/**
 * @param {string} trackId A Realm's thread.
 * @returns {string} Its Scene's id.
 */
export const realmSceneId = (trackId) => String(trackId ?? "").slice(REALM_PREFIX.length);

/**
 * What each milestone is, so the same thing recorded twice finds the row it
 * already wrote (upsertByKey). Kept here so each is spelled once.
 */
export const timelineKeys = Object.freeze({
	turn: (ended) => `turn:${ended}`,
	myth: (completedId) => `myth:${completedId}`,
	session: (played, at) => `session:${played}:${at}`,
	rank: (rank) => `rank:${rank}`,
	scar: (itemId) => `scar:${itemId}`,
	death: (actorId = "") => (actorId ? `death:${actorId}` : "death"),
	knighted: () => "knighted",
	succeeded: () => "succeeded",
	tookUp: (fallenId) => `tookUp:${fallenId}`,
	founded: (domainId = "") => (domainId ? `founded:${domainId}` : "founded"),
	domain: (domainId) => `domain:${domainId}`,
	// Each roll and each change of ruler is its own row, however many fall in one Season.
	crisis: (season, at) => `crisis:${season}:${at}`,
	seized: (season, at) => `seized:${season}:${at}`,
	passed: (season, at) => `passed:${season}:${at}`,
	rules: (domainId, season, at) => `rules:${domainId}:${season}:${at}`,
	holding: (sceneId, holdingId) => `holding:${sceneId}:${holdingId}`,
	visit: (sceneId, hex) => `visit:${sceneId}:${hex.col},${hex.row}`,
	note: (sceneId, hex) => `note:${sceneId}:${hex.col},${hex.row}`
});

/**
 * @param {unknown} raw
 * @returns {string} A Season's key as seasonKey writes it, or UNDATED for anything else.
 */
export function entrySeason(raw) {
	const parsed = parseSeasonKey(raw);
	return parsed ? seasonKey(parsed) : UNDATED;
}

const slot = (value) => {
	const n = Math.trunc(Number(value));
	return Number.isFinite(n) && n > 0 ? n : 0;
};

const text = (value) => String(value ?? "").trim();

/**
 * @typedef {object} TimelineEntry
 * @property {string} id        Never holding a dot, since it is a key in the page's data.
 * @property {string} season    The Season it falls in, or UNDATED.
 * @property {number} order     Where it stands among the others of its Season.
 * @property {string} title
 * @property {string} place
 * @property {string} body      Plain lines; links written @UUID[...] still work.
 * @property {string} source    One of TIMELINE_SOURCES.
 * @property {string} key       What a milestone is (timelineKeys); "" on a typed entry.
 * @property {number} createdAt In milliseconds; the last word on order.
 * @property {string} authorId  The user who wrote it.
 */

/**
 * One stored entry, made whole. A page can be edited by hand or reached
 * before its model is, so nothing is trusted.
 * @param {object} raw
 * @param {number} [index]
 * @returns {TimelineEntry}
 */
export function normalizeEntry(raw, index = 0) {
	return {
		id: String(raw?.id ?? "").replace(/\./g, "").trim() || `entry-${index}`,
		season: entrySeason(raw?.season),
		order: slot(raw?.order),
		title: text(raw?.title),
		place: text(raw?.place),
		body: String(raw?.body ?? "").trim(),
		source: TIMELINE_SOURCES.includes(raw?.source) ? raw.source : "hand",
		key: text(raw?.key),
		createdAt: Number(raw?.createdAt) || 0,
		authorId: text(raw?.authorId)
	};
}

const sameEntry = (a, b) => Object.keys(a).every((field) => a[field] === b[field]);

/**
 * A row stored with no id is what a field's write leaves behind when it lands
 * after someone else deleted the row: the row was deleted, so it stays gone.
 * @param {unknown} entry
 * @returns {boolean}
 */
export const isLeftover = (entry) => !text(/** @type {any} */ (entry)?.id);

/**
 * @param {unknown} raw A page's entries, kept by id.
 * @returns {TimelineEntry[]} Each one made whole, leftovers dropped.
 */
export function readEntries(raw) {
	if (Array.isArray(raw)) return raw.map(normalizeEntry);
	if (!raw || typeof raw !== "object") return [];
	return Object.entries(raw)
		.filter(([, entry]) => !isLeftover(entry))
		.map(([id, entry], index) => normalizeEntry({ ...entry, id: entry?.id || id }, index));
}

/**
 * What turns one list of entries into another, entry by entry, so a write
 * touches only what changed and two people writing one thread at once each
 * keep their own work.
 * @param {unknown} stored
 * @param {unknown} next
 * @returns {{added: Record<string, TimelineEntry>, changed: Record<string, Partial<TimelineEntry>>, removed: string[]}|null} Null when they're the same.
 */
export function entriesDiff(stored, next) {
	const was = new Map(readEntries(stored).map((entry) => [entry.id, entry]));
	const added = {};
	const changed = {};
	for (const entry of readEntries(next)) {
		const old = was.get(entry.id);
		was.delete(entry.id);
		if (!old) added[entry.id] = entry;
		else if (!sameEntry(old, entry)) changed[entry.id] = Object.fromEntries(Object.keys(entry).filter((field) => old[field] !== entry[field]).map((field) => [field, entry[field]]));
	}
	const removed = [...was.keys()];
	if (!Object.keys(added).length && !Object.keys(changed).length && !removed.length) return null;
	return { added, changed, removed };
}

/**
 * Where a Season stands in the tale: by Age, then the year, then the Season.
 * What came before the tale stands ahead of everything.
 * @param {string} season A seasonKey, or UNDATED.
 * @returns {number}
 */
export function periodRank(season) {
	const parsed = parseSeasonKey(season);
	if (!parsed) return -Infinity;
	return (parsed.age * 10000 + parsed.year) * SEASONS.length + SEASONS.indexOf(parsed.season);
}

const closing = (entry) => (SEASON_TURNS.includes(entry.source) ? 1 : 0);

const withinPeriod = (a, b) => closing(a) - closing(b) || a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id);

const inOrder = (entries) => [...entries].sort((a, b) => periodRank(a.season) - periodRank(b.season) || withinPeriod(a, b));

/**
 * @param {unknown} entries
 * @returns {TimelineEntry[]} The oldest Season first, and within each in the table's order, the Season's turn last.
 */
export const sortEntries = (entries) => inOrder(readEntries(entries));

/**
 * The Seasons a thread has anything in, oldest first. A Season with nothing
 * in it isn't filled in.
 * @param {unknown} entries
 * @returns {{season: string, entries: TimelineEntry[]}[]}
 */
export function groupByPeriod(entries) {
	const periods = new Map();
	for (const entry of sortEntries(entries)) {
		if (!periods.has(entry.season)) periods.set(entry.season, { season: entry.season, entries: [] });
		periods.get(entry.season).entries.push(entry);
	}
	return [...periods.values()];
}

const periodMembers = (entries, season) => inOrder(entries.filter((entry) => entry.season === season));

/** Number one Season's entries 0, 1, 2… again, leaving the rest as they were. */
function renumber(entries, season) {
	let next = 0;
	const order = new Map(periodMembers(entries, season).map((entry) => [entry.id, next++]));
	return entries.map((entry) => (order.has(entry.id) ? { ...entry, order: order.get(entry.id) } : entry));
}

/**
 * Add an entry at the end of its Season.
 * @param {unknown} list
 * @param {Partial<TimelineEntry>} entry
 * @param {() => string} [makeId] Foundry's randomID, passed in so this stays pure.
 * @returns {{entries: TimelineEntry[], added: TimelineEntry|null}}
 */
export function addEntry(list, entry, makeId = () => "") {
	const entries = readEntries(list);
	const taken = new Set(entries.map((e) => e.id));
	let index = entries.length;
	while (taken.has(`entry-${index}`)) index++;
	const next = normalizeEntry({ ...entry, id: entry?.id || makeId() }, index);
	if (taken.has(next.id)) return { entries, added: null };
	const last = periodMembers(entries, next.season).at(-1);
	const placed = { ...next, order: last ? last.order + 1 : 0 };
	return { entries: renumber([...entries, placed], next.season), added: placed };
}

/**
 * @param {unknown} list
 * @param {string} id
 * @returns {{entries: TimelineEntry[], removed: TimelineEntry|null}}
 */
export function removeEntry(list, id) {
	const entries = readEntries(list);
	const at = entries.findIndex((e) => e.id === id);
	if (at < 0) return { entries, removed: null };
	const removed = entries[at];
	return { entries: renumber(entries.filter((_, i) => i !== at), removed.season), removed };
}

/**
 * Every row a milestone wrote, taken out: a Myth unresolved takes its rows with it.
 * @param {unknown} list
 * @param {string} key
 * @returns {{entries: TimelineEntry[], removed: TimelineEntry[]|null}}
 */
export function removeByKey(list, key) {
	const entries = readEntries(list);
	const wanted = text(key);
	const removed = wanted ? entries.filter((e) => e.key === wanted) : [];
	if (!removed.length) return { entries, removed: null };
	const rest = entries.filter((e) => e.key !== wanted);
	return { entries: [...new Set(removed.map((e) => e.season))].reduce(renumber, rest), removed };
}

/**
 * Change an entry's fields. One moved to another Season goes to the end of it.
 * @param {unknown} list
 * @param {string} id
 * @param {Partial<TimelineEntry>} changes
 * @returns {{entries: TimelineEntry[], changed: TimelineEntry|null}} Null when nothing changed.
 */
export function patchEntry(list, id, changes) {
	const entries = readEntries(list);
	const at = entries.findIndex((e) => e.id === id);
	if (at < 0) return { entries, changed: null };
	const before = entries[at];
	const merged = normalizeEntry({ ...before, ...changes, id: before.id }, at);
	if (sameEntry(merged, before)) return { entries, changed: null };
	if (merged.season === before.season) {
		const patched = entries.map((e, i) => (i === at ? { ...merged, order: before.order } : e));
		return { entries: renumber(patched, merged.season), changed: merged };
	}
	const last = periodMembers(entries.filter((_, i) => i !== at), merged.season).at(-1);
	const moved = { ...merged, order: last ? last.order + 1 : 0 };
	const patched = entries.map((e, i) => (i === at ? moved : e));
	return { entries: renumber(renumber(patched, before.season), merged.season), changed: moved };
}

/**
 * Move an entry one place earlier (-1) or later (+1) within its Season.
 * Moving it to another Season is a change of date (patchEntry).
 * @param {unknown} list
 * @param {string} id
 * @param {number} delta
 * @returns {{entries: TimelineEntry[], moved: TimelineEntry|null}} Null at either end.
 */
export function moveEntry(list, id, delta) {
	const entries = readEntries(list);
	const target = entries.find((e) => e.id === id);
	if (!target) return { entries, moved: null };
	const members = periodMembers(entries, target.season);
	const at = members.findIndex((e) => e.id === id);
	const to = at + (Number(delta) < 0 ? -1 : 1);
	if (to < 0 || to >= members.length || closing(members[to]) !== closing(target)) return { entries, moved: null };
	const swap = new Map([[members[at].id, members[to].order], [members[to].id, members[at].order]]);
	const next = entries.map((e) => (swap.has(e.id) ? { ...e, order: swap.get(e.id) } : e));
	return { entries: renumber(next, target.season), moved: target };
}

/**
 * Whether an entry can move earlier or later within its Season.
 * @param {TimelineEntry[]} members One Season's entries, in order.
 * @param {number} at
 * @returns {{earlier: boolean, later: boolean}}
 */
export function canMove(members, at) {
	const here = members[at];
	const fits = (other) => Boolean(other) && closing(other) === closing(here);
	return { earlier: fits(members[at - 1]), later: fits(members[at + 1]) };
}

/**
 * Write a milestone once: added if no row has its key, otherwise only the
 * fields in `refresh` change, so a row someone re-dated or retitled stays so.
 * @param {unknown} list
 * @param {Partial<TimelineEntry>} entry
 * @param {{refresh?: string[], makeId?: () => string}} [options]
 * @returns {{entries: TimelineEntry[], added: TimelineEntry|null, changed: TimelineEntry|null}}
 */
export function upsertByKey(list, entry, { refresh = [], makeId = () => "" } = {}) {
	const key = text(entry?.key);
	const entries = readEntries(list);
	const found = key ? entries.find((e) => e.key === key) : null;
	if (!found) {
		const { entries: next, added } = addEntry(entries, entry, makeId);
		return { entries: next, added, changed: null };
	}
	const changes = Object.fromEntries(refresh.filter((field) => field in (entry ?? {})).map((field) => [field, entry[field]]));
	if (!Object.keys(changes).length) return { entries, added: null, changed: null };
	const { entries: next, changed } = patchEntry(entries, found.id, changes);
	return { entries: next, added: null, changed };
}
