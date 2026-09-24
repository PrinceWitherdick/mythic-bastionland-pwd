/**
 * The Seasons page of the GM Toolkit: a record of each Season, kept by the
 * Season's key ("2-winter"), holding what the GM wrote about it and what came
 * to pass as it ended. Borrowed from the Stonetop system's Seasons Change
 * journal, which keeps one page a year with a block for each season. Pure, so
 * it can be tested without Foundry; the sheet puts words to it.
 */
import { crisisRolledThisSeason } from "./dominion.js";
import { normalizeEvents } from "./season-events.js";
import { SEASONS, normalizeCalendar, parseSeasonKey, seasonKey } from "./time.js";

/** How a Season can end: the Season turned, the Age turned, or the Company journeyed to a distant Realm. */
export const SEASON_TURNS = Object.freeze(["season", "age", "distant"]);

/**
 * @typedef {object} SeasonTurn What came to pass as a Season ended, as its card said.
 * @property {string} kind      One of SEASON_TURNS.
 * @property {string} title     The card's title, such as "Harvest Begins".
 * @property {number} when      When it was recorded, in milliseconds.
 * @property {{name: string, pursuit: string|null, lines: string[]}[]} entries
 * @property {string|null} note Said before anything else, such as where the Company journeyed.
 */

/**
 * @typedef {object} SeasonRecord
 * @property {string} notes          The GM's own notes on the Season.
 * @property {string[]} events       Which of its events came to pass (rules/season-events.js).
 * @property {SeasonTurn|null} turn  Null until the Season has ended.
 */

/**
 * @param {unknown} raw As stored.
 * @returns {SeasonRecord}
 */
export function normalizeSeasonRecord(raw) {
	const turn = raw?.turn;
	return {
		notes: typeof raw?.notes === "string" ? raw.notes : "",
		events: normalizeEvents(raw?.events),
		turn: turn && SEASON_TURNS.includes(turn.kind)
			? {
				kind: turn.kind,
				title: String(turn.title ?? ""),
				when: Number.isFinite(turn.when) ? turn.when : 0,
				entries: Array.isArray(turn.entries)
					? turn.entries.map((entry) => ({
						name: String(entry?.name ?? ""),
						pursuit: entry?.pursuit ? String(entry.pursuit) : null,
						lines: Array.isArray(entry?.lines) ? entry.lines.map(String) : []
					}))
					: [],
				note: turn.note ? String(turn.note) : null
			}
			: null
	};
}

/**
 * The turn a Season ended with, ready to store. A Season turned twice, such as
 * after the calendar was set back by hand, keeps the later turn only, as
 * Stonetop's journal replaces a season recorded again.
 * @param {object} turn
 * @param {string} turn.kind One of SEASON_TURNS.
 * @param {string} turn.title
 * @param {number} turn.when
 * @param {object[]} turn.entries As the card lists them.
 * @param {string|null} [turn.note]
 * @returns {SeasonTurn}
 */
export function seasonTurn({ kind, title, when, entries, note = null }) {
	return normalizeSeasonRecord({ turn: { kind, title, when, entries, note } }).turn;
}

/**
 * The Seasons to show, grouped by Age, the newest Age first and its Seasons in
 * the order they come: every Season written about, marked by an event, or
 * ended, and the one the world is in now.
 * @param {Record<string, unknown>} log As stored, by Season key.
 * @param {import("./time.js").Calendar} calendar Now.
 * @returns {{age: number, seasons: {key: string, age: number, season: string, current: boolean, record: SeasonRecord}[]}[]}
 */
export function seasonLogView(log, calendar) {
	const now = seasonKey(normalizeCalendar(calendar));
	const records = new Map();
	for (const [key, raw] of Object.entries(log ?? {})) {
		const parsed = parseSeasonKey(key);
		if (!parsed) continue;
		const record = normalizeSeasonRecord(raw);
		if (record.notes.trim() || record.events.length || record.turn || key === now) records.set(key, { key, ...parsed, record });
	}
	if (!records.has(now)) records.set(now, { key: now, ...parseSeasonKey(now), record: normalizeSeasonRecord(null) });

	const ages = new Map();
	for (const entry of records.values()) {
		ages.set(entry.age, [...(ages.get(entry.age) ?? []), { ...entry, current: entry.key === now }]);
	}
	return [...ages]
		.sort(([a], [b]) => b - a)
		.map(([age, seasons]) => ({ age, seasons: seasons.sort((a, b) => SEASONS.indexOf(a.season) - SEASONS.indexOf(b.season)) }));
}

/**
 * The Domains still owed this Season's Crisis Roll (p20), which is made at the
 * start of each Season.
 * @template {{system: {crisisRolled?: string}}} Domain
 * @param {Domain[]} domains
 * @param {import("./time.js").Calendar} calendar Now.
 * @returns {Domain[]}
 */
export function crisisRollsDue(domains, calendar) {
	return domains.filter((domain) => !crisisRolledThisSeason(domain, calendar));
}
