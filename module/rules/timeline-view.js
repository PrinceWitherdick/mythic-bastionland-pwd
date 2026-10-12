/**
 * The Timeline, shaped for its pages: one thread on a sheet's tab, or every
 * thread side by side in the Timeline window, a lane each. Either is a list of
 * the Seasons with anything in them, oldest first, each marked where its Age
 * begins, so it can be laid down the page or across it. Pure, so it can be
 * tested without Foundry; timeline-ui.js puts words to it.
 */
import { parseSeasonKey } from "./time.js";
import { KIND_GROUPS, COMPANY_TRACK, canMove, groupByPeriod, isSeasonTurn, periodRank, readEntries, sortEntries } from "./timeline.js";
import { CUSTOM_TAG_ICON, KIND_ICONS, THREAD_ICONS, entryChip, filterKey, indexCustomTags } from "./timeline-tags.js";
import { seasonYearsOn } from "./travels.js";

/**
 * @typedef {object} TimelineTrack
 * @property {string} trackId
 * @property {string} kind    One of TRACK_KINDS.
 * @property {unknown} entries As the page keeps them.
 */

/**
 * How many years on each Season is from the first of its name in its Age,
 * over every Season the Timeline has, so a sheet and the window name a
 * Season alike. The year is never shown: "Harvest, a Year On".
 * @param {Iterable<string>} seasons seasonKeys.
 * @returns {Map<string, number>}
 */
export function yearsOnBySeason(seasons) {
	const keys = [...new Set(seasons)].filter((key) => parseSeasonKey(key));
	const on = seasonYearsOn(keys.map((key) => ({ when: parseSeasonKey(key) })));
	return new Map(keys.map((key, i) => [key, on[i]]));
}

/**
 * @param {string} season A seasonKey, or "" for before the tale.
 * @param {{nowKey?: string, yearsOn?: Map<string, number>}} context
 * @returns {{season: string, undated: boolean, age: number|null, name: string|null, yearsOn: number, isNow: boolean}}
 */
export function periodFacts(season, { nowKey = "", yearsOn = new Map() } = {}) {
	const parsed = parseSeasonKey(season);
	return {
		season,
		undated: !parsed,
		age: parsed?.age ?? null,
		name: parsed?.season ?? null,
		yearsOn: yearsOn.get(season) ?? 0,
		isNow: Boolean(parsed) && season === nowKey
	};
}

/**
 * One entry as its card shows it.
 * @param {import("./timeline.js").TimelineEntry} entry
 * @param {{earlier: boolean, later: boolean}} moves
 * @param {Map<string, object>} tags
 */
function cardView(entry, moves, tags) {
	const chip = entryChip(entry, tags);
	return { ...entry, group: chip.kind, chip, earlier: moves.earlier, later: moves.later };
}

/**
 * One Season's entries as cards, each knowing whether it can move. A Season's
 * turn is left out, for its heading, unless `turns` keeps it a card.
 */
function cardsOf(entries, tags, { turns = false } = {}) {
	const cards = turns ? entries : entries.filter((entry) => !isSeasonTurn(entry));
	return cards.map((entry, at) => cardView(entry, canMove(cards, at), tags));
}

/**
 * A Season's turn as its heading shows it.
 * @param {import("./timeline.js").TimelineEntry} entry
 * @param {string} trackId Its thread: a heading on the board sits in no lane.
 */
const noteView = (entry, trackId) => ({ id: entry.id, trackId, title: entry.title, body: entry.body, source: entry.source });

/**
 * @param {{age: number|null, undated: boolean}} period
 * @returns {string} The Age it falls in, as the scrubber stops at it: its number, or "undated" before the tale.
 */
export const ageKey = ({ age, undated }) => (undated ? "undated" : String(age));

/**
 * Mark the first Season of each Age, and which side of the line across each
 * Season's cards hang: one above, the next below, so neighbours never crowd.
 * @template {{age: number|null, undated: boolean}} P
 * @param {P[]} periods In order.
 * @returns {(P & {startsAge: boolean, ageKey: string, above: boolean})[]}
 */
function markAges(periods) {
	let last;
	return periods.map((period, at) => {
		const startsAge = at === 0 || period.age !== last;
		last = period.age;
		return { ...period, startsAge, ageKey: ageKey(period), above: at % 2 === 0 };
	});
}

/**
 * The Seasons with the one it is now added, empty, when nothing shown is in it:
 * somewhere to write in the Season the table is playing, without picking it.
 * @param {string[]} seasons In order.
 * @param {string} nowKey
 * @returns {{season: string, ghost: boolean}[]} In order.
 */
function withNow(seasons, nowKey) {
	const rows = seasons.map((season) => ({ season, ghost: false }));
	if (!parseSeasonKey(nowKey) || seasons.includes(nowKey)) return rows;
	return [...rows, { season: nowKey, ghost: true }].sort((a, b) => periodRank(a.season) - periodRank(b.season));
}

/**
 * The Company's Season turns, for another thread (a Knight's, a Domain's, a
 * Realm's): the Seasons turning between the things that thread did. Only over
 * the Seasons the thread itself spans, from its first dated entry to its last
 * (or the Season it is now, for one who can write there), so a Knight knighted
 * in the third year doesn't open on two years of a Company they weren't part
 * of. A Season in that span with nothing of the thread's own still opens,
 * under the Company's turn: that's the point. The reader's Filter hides them
 * as it does on the board.
 * @param {object[]} own The thread's own shown entries.
 * @param {unknown} company The Company's entries, as its page keeps them.
 * @param {(entry: object) => boolean} shown The reader's Filter.
 * @param {string} nowKey The Season it is now, or "" when it isn't drawn.
 */
function companyTurnsWithin(own, company, shown, nowKey) {
	const ranks = own.map((entry) => periodRank(entry.season)).filter(Number.isFinite);
	if (!ranks.length) return [];
	const first = Math.min(...ranks);
	const last = Math.max(...ranks, periodRank(nowKey));
	// A Season the thread closed itself, as a Knight's or a Domain's does when something befell it, keeps its own turn.
	const turned = new Set(own.filter(isSeasonTurn).map((entry) => entry.season));
	return readEntries(company).filter((entry) => isSeasonTurn(entry) && shown(entry) && !turned.has(entry.season) && periodRank(entry.season) >= first && periodRank(entry.season) <= last);
}

/**
 * @typedef {object} ViewOptions
 * @property {string[]} [hidden]      The Filter lines unticked: kinds, and the table's own tags by id.
 * @property {string} [nowKey]        The Season it is now.
 * @property {Iterable<string>} [seasons] Every Season on the Timeline, to count years on by.
 * @property {object[]} [tags]        The world's own tags (rules/timeline-tags.js).
 */

/**
 * One thread, as a sheet's tab and its journal page show it.
 * @param {TimelineTrack} track
 * @param {ViewOptions & {canEdit?: boolean, company?: unknown}} [options] `canEdit` offers an add slot in each Season, and the Season it is now. `company` is the Company's entries, whose Season turns another thread writes in its headings (companyTurnsWithin).
 */
export function trackView(track, { hidden = [], nowKey = "", seasons, tags = [], canEdit = false, company } = {}) {
	const index = indexCustomTags(tags);
	const off = new Set(hidden);
	const isShown = (entry) => !off.has(filterKey(entry, index));
	const all = readEntries(track?.entries);
	const shown = all.filter(isShown);
	const allHidden = all.length > 0 && !shown.length;
	const trackId = track?.trackId ?? "";
	const ghostKey = canEdit && !allHidden ? nowKey : "";
	// Never on a thread the Filter has emptied: that reads as filtered, not as the Company's Seasons.
	const shared = company && !allHidden && trackId !== COMPANY_TRACK ? companyTurnsWithin(shown, company, isShown, ghostKey) : [];
	const sharedIds = new Set(shared.map((entry) => entry.id));
	const groups = new Map(groupByPeriod([...shown, ...shared]).map((period) => [period.season, period.entries]));
	const rows = withNow([...groups.keys()], ghostKey);
	const yearsOn = yearsOnBySeason(seasons ?? rows.map((row) => row.season));
	return {
		trackId,
		kind: track?.kind ?? "",
		allHidden,
		empty: !all.length && !rows.length,
		periods: markAges(rows.map(({ season, ghost }) => {
			const entries = groups.get(season) ?? [];
			return {
				...periodFacts(season, { nowKey, yearsOn }),
				ghost,
				// The Company's turns name its thread, so their Edit writes there.
				notes: entries.filter(isSeasonTurn).map((entry) => noteView(entry, sharedIds.has(entry.id) ? COMPANY_TRACK : trackId)),
				entries: cardsOf(entries, index),
				add: canEdit ? { season } : null
			};
		}))
	};
}

/**
 * Every thread side by side: a lane each, a row for each Season any of them
 * has something in, so the threads stay level. A thread with nothing in a
 * Season leaves its cell empty; one with nothing at all is still a lane, to
 * write in. A thread the reader unticked is left out. The Company's Season
 * turns are written in the Season's heading, which spans the board; each other
 * thread's stay cards in its lane.
 * @param {TimelineTrack[]} tracks
 * @param {ViewOptions & {hiddenTracks?: string[], canEdit?: (trackId: string) => boolean}} [options]
 */
export function boardView(tracks = [], { hidden = [], hiddenTracks = [], nowKey = "", seasons, tags = [], canEdit = () => false } = {}) {
	const index = indexCustomTags(tags);
	const offKinds = new Set(hidden);
	const offTracks = new Set(hiddenTracks);
	const lanes = tracks.filter((track) => !offTracks.has(track.trackId));
	let total = 0;
	for (const track of tracks) total += readEntries(track.entries).length;
	const buckets = new Map();
	const notes = new Map();
	const periods = new Set();
	for (const track of lanes) {
		const bucket = new Map();
		buckets.set(track.trackId, bucket);
		for (const entry of sortEntries(track.entries)) {
			if (offKinds.has(filterKey(entry, index))) continue;
			periods.add(entry.season);
			if (track.trackId === COMPANY_TRACK && isSeasonTurn(entry)) {
				if (!notes.has(entry.season)) notes.set(entry.season, []);
				notes.get(entry.season).push(noteView(entry, track.trackId));
				continue;
			}
			if (!bucket.has(entry.season)) bucket.set(entry.season, []);
			bucket.get(entry.season).push(entry);
		}
	}
	const allHidden = total > 0 && !periods.size;
	const writable = new Map(lanes.map(({ trackId }) => [trackId, Boolean(canEdit(trackId))]));
	const ordered = [...periods].sort((a, b) => periodRank(a) - periodRank(b));
	const rows = withNow(ordered, !allHidden && [...writable.values()].some(Boolean) ? nowKey : "");
	const yearsOn = yearsOnBySeason(seasons ?? rows.map((row) => row.season));
	const marked = markAges(rows.map(({ season, ghost }) => ({ ...periodFacts(season, { nowKey, yearsOn }), ghost })));
	return {
		lanes: lanes.map(({ trackId, kind, portrait = "" }) => ({ trackId, kind, portrait })),
		allHidden,
		empty: total === 0 && !rows.length,
		periods: marked.map((period) => {
			const { season, ghost, startsAge, ageKey } = period;
			return {
				...period,
				notes: notes.get(season) ?? [],
				// Each cell carries its Season's Age, for a lane read across.
				cells: lanes.map(({ trackId }) => {
					const entries = cardsOf(buckets.get(trackId).get(season) ?? [], index, { turns: true });
					return { trackId, season, ghost, startsAge, ageKey, empty: !entries.length, entries, add: writable.get(trackId) ? { season, trackId } : null };
				})
			};
		})
	};
}

/**
 * The Filter menu's kinds, each ticked unless the reader hid it, then the
 * world's own tags by name.
 * @param {string[]} hidden
 * @param {object[]} [tags]
 * @returns {{key: string, kind: string, icon: string, tagName: string, colour: string, shown: boolean}[]}
 */
export function kindMenu(hidden = [], tags = []) {
	const off = new Set(hidden);
	const kinds = Object.keys(KIND_GROUPS).map((kind) => ({ key: kind, kind, icon: KIND_ICONS[kind], tagName: "", colour: "", shown: !off.has(kind) }));
	const own = [...indexCustomTags(tags).values()].map((tag) => ({ key: tag.id, kind: "custom", icon: CUSTOM_TAG_ICON, tagName: tag.name, colour: tag.colour, shown: !off.has(tag.id) }));
	return [...kinds, ...own];
}

/**
 * The Filter menu's threads, in the board's order.
 * @param {{trackId: string, kind: string}[]} tracks
 * @param {string[]} hiddenTracks
 * @returns {{trackId: string, kind: string, icon: string, shown: boolean}[]}
 */
export const threadMenu = (tracks = [], hiddenTracks = []) => tracks.map(({ trackId, kind }) => ({ trackId, kind, icon: THREAD_ICONS[kind] ?? THREAD_ICONS.company, shown: !hiddenTracks.includes(trackId) }));

/**
 * The threads a player's board hides until they choose: all but the
 * Company's and their own Knights' and Domains'. Someone with none of their
 * own hides nothing, so the board never opens on only a Filter.
 * @param {{trackId: string, kind: string}[]} tracks
 * @param {(track: {trackId: string, kind: string}) => boolean} owns
 * @returns {string[]}
 */
export function defaultHiddenTracks(tracks = [], owns = () => false) {
	const mine = tracks.filter((track) => (track.kind === "knight" || track.kind === "domain") && owns(track));
	if (!mine.length) return [];
	const kept = new Set([...mine.map((track) => track.trackId), ...tracks.filter((track) => track.kind === "company").map((track) => track.trackId)]);
	return tracks.map((track) => track.trackId).filter((id) => !kept.has(id));
}

/**
 * How many Filter lines the reader has unticked: the kinds and tags the world
 * still has, and the threads still on the board.
 * @param {string[]} hidden
 * @param {string[]} hiddenTracks
 * @param {{kinds: string[], tracks: string[]}} offered What the menu offers.
 * @returns {number}
 */
export const hiddenCount = (hidden, hiddenTracks, { kinds, tracks }) => hidden.filter((key) => kinds.includes(key)).length + hiddenTracks.filter((id) => tracks.includes(id)).length;

/**
 * The Seasons a hand entry can be dated by: now, every Season the Timeline
 * already has newest first, then before the tale.
 * @param {Iterable<string>} seasons
 * @param {string} nowKey
 * @param {string} [current] The entry's own Season, when it's being edited.
 * @returns {(ReturnType<typeof periodFacts> & {selected: boolean})[]}
 */
export function periodChoices(seasons, nowKey, current = nowKey) {
	const all = new Set([nowKey, ...seasons, current].filter((key) => parseSeasonKey(key)));
	const yearsOn = yearsOnBySeason(all);
	const ordered = [nowKey, ...[...all].filter((key) => key !== nowKey).sort((a, b) => periodRank(b) - periodRank(a)), ""];
	return [...new Set(ordered)].map((season) => ({ ...periodFacts(season, { nowKey, yearsOn }), selected: season === (current ?? "") }));
}
