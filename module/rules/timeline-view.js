/**
 * The Timeline, shaped for its pages: one thread down a sheet's tab, or
 * every thread side by side in the Timeline window, a column each. Both are
 * gathered under an Age, a row for each Season with anything in it. Pure,
 * so it can be tested without Foundry; the window puts words to it.
 */
import { parseSeasonKey } from "./time.js";
import { KIND_GROUPS, canMove, groupByPeriod, periodRank, readEntries, sortEntries, sourceGroup } from "./timeline.js";
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
 */
function cardView(entry, moves) {
	return {
		...entry,
		group: sourceGroup(entry.source),
		earlier: moves.earlier,
		later: moves.later
	};
}

/** One Season's entries as cards, each knowing whether it can move. */
function cardsOf(entries) {
	return entries.map((entry, at) => cardView(entry, canMove(entries, at)));
}

/**
 * Seasons gathered under their Age, before the tale first.
 * @template {{age: number|null}} P
 * @param {P[]} periods In order.
 * @returns {{age: number|null, periods: P[]}[]}
 */
function underAges(periods) {
	const ages = [];
	for (const period of periods) {
		const last = ages.at(-1);
		if (last && last.age === period.age) last.periods.push(period);
		else ages.push({ age: period.age, periods: [period] });
	}
	return ages;
}

const shownEntries = (entries, hidden) => entries.filter((entry) => !hidden.has(sourceGroup(entry.source)));

/**
 * One thread, down a page.
 * @param {TimelineTrack} track
 * @param {{hidden?: string[], nowKey?: string, seasons?: Iterable<string>}} [options]
 *   `hidden` the Filter lines unticked; `seasons` every Season on the Timeline.
 */
export function trackView(track, { hidden = [], nowKey = "", seasons } = {}) {
	const all = readEntries(track?.entries);
	const shown = shownEntries(all, new Set(hidden));
	const periods = groupByPeriod(shown);
	const yearsOn = yearsOnBySeason(seasons ?? periods.map((p) => p.season));
	return {
		trackId: track?.trackId ?? "",
		kind: track?.kind ?? "",
		allHidden: all.length > 0 && !shown.length,
		ages: underAges(periods.map((period) => ({
			...periodFacts(period.season, { nowKey, yearsOn }),
			entries: cardsOf(period.entries)
		})))
	};
}

/**
 * Every thread side by side: a column each, a row for each Season any of
 * them has something in, so the threads stay level with each other. A thread
 * with nothing in a Season leaves its cell empty; one with nothing at all is
 * still a column, to write in. A thread the reader unticked is left out.
 * @param {TimelineTrack[]} tracks
 * @param {{hidden?: string[], hiddenTracks?: string[], nowKey?: string, seasons?: Iterable<string>}} [options]
 */
export function boardView(tracks = [], { hidden = [], hiddenTracks = [], nowKey = "", seasons } = {}) {
	const offKinds = new Set(hidden);
	const offTracks = new Set(hiddenTracks);
	const lanes = tracks.filter((track) => !offTracks.has(track.trackId));
	let total = 0;
	for (const track of tracks) total += readEntries(track.entries).length;
	const buckets = new Map();
	const periods = new Set();
	for (const track of lanes) {
		const bucket = new Map();
		buckets.set(track.trackId, bucket);
		for (const entry of shownEntries(sortEntries(track.entries), offKinds)) {
			periods.add(entry.season);
			if (!bucket.has(entry.season)) bucket.set(entry.season, []);
			bucket.get(entry.season).push(entry);
		}
	}
	const ordered = [...periods].sort((a, b) => periodRank(a) - periodRank(b));
	const yearsOn = yearsOnBySeason(seasons ?? ordered);
	return {
		lanes: lanes.map(({ trackId, kind }) => ({ trackId, kind })),
		allHidden: total > 0 && !ordered.length,
		ages: underAges(ordered.map((season) => ({
			...periodFacts(season, { nowKey, yearsOn }),
			cells: lanes.map(({ trackId }) => ({ trackId, entries: cardsOf(buckets.get(trackId).get(season) ?? []) }))
		})))
	};
}

/**
 * The Filter menu's kinds, each ticked unless the reader hid it.
 * @param {string[]} hidden
 * @returns {{group: string, shown: boolean}[]}
 */
export const kindMenu = (hidden = []) => Object.keys(KIND_GROUPS).map((group) => ({ group, shown: !hidden.includes(group) }));

/**
 * The Filter menu's threads, in the board's order.
 * @param {{trackId: string, kind: string}[]} tracks
 * @param {string[]} hiddenTracks
 * @returns {{trackId: string, kind: string, shown: boolean}[]}
 */
export const threadMenu = (tracks = [], hiddenTracks = []) => tracks.map(({ trackId, kind }) => ({ trackId, kind, shown: !hiddenTracks.includes(trackId) }));

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
