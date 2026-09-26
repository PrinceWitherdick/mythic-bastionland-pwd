/**
 * The record of each Season on the GM Toolkit's Time page, kept by the
 * Season's key ("2-winter"), holding what the GM wrote about it, the Myths
 * resolved in it, and what came to pass as it ended. Borrowed from the Stonetop system's Seasons Change
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
 * @property {CompletedMyth[]} myths The Myths resolved in it (p27), in the order they were.
 * @property {SeasonTurn|null} turn  Null until the Season has ended.
 */

/**
 * @typedef {object} CompletedMyth A Myth resolved in a Season, kept by name, since
 *   a new Myth takes its place in the Realm the Season after.
 * @property {string} id   Which Realm, number and roll it was (completedMythId).
 * @property {string} name As the book names it, such as "The Plague".
 */

/**
 * @param {string} sceneId The Realm's Scene.
 * @param {{number: number, d6: number, d12: number}} myth
 * @returns {string} The same for the same Myth in the same Realm, and for no other.
 */
export const completedMythId = (sceneId, myth) => `${sceneId}.${myth.number}.${myth.d6}-${myth.d12}`;

/**
 * @param {CompletedMyth[]} myths
 * @param {CompletedMyth} myth
 * @returns {CompletedMyth[]} Unchanged when the Myth is already there.
 */
export const withCompletedMyth = (myths, myth) => (myths.some(({ id }) => id === myth.id) ? myths : [...myths, myth]);

/**
 * @param {CompletedMyth[]} myths
 * @param {string} id
 * @returns {CompletedMyth[]}
 */
export const withoutCompletedMyth = (myths, id) => myths.filter((myth) => myth.id !== id);

/**
 * @param {unknown} raw As stored.
 * @returns {SeasonRecord}
 */
export function normalizeSeasonRecord(raw) {
	const turn = raw?.turn;
	return {
		notes: typeof raw?.notes === "string" ? raw.notes : "",
		events: normalizeEvents(raw?.events),
		myths: Array.isArray(raw?.myths)
			? raw.myths.filter((myth) => typeof myth?.id === "string" && myth.id).map((myth) => ({ id: myth.id, name: String(myth.name ?? "") }))
			: [],
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
 * the order they come: every Season written about, with a Myth resolved in it,
 * or ended, and the one the world is in now. Its events only matter while it
 * lasts, so a Season with nothing else is left out once it's over.
 * @param {Record<string, unknown>} log As stored, by Season key.
 * @param {import("./time.js").Calendar} calendar Now.
 * @returns {{age: number, seasons: {key: string, age: number, year: number, season: string, current: boolean, record: SeasonRecord}[]}[]}
 */
export function seasonLogView(log, calendar) {
	const now = seasonKey(normalizeCalendar(calendar));
	const records = new Map();
	for (const [key, raw] of Object.entries(log ?? {})) {
		const parsed = parseSeasonKey(key);
		if (!parsed) continue;
		const record = normalizeSeasonRecord(raw);
		if (record.notes.trim() || record.myths.length || record.turn || key === now) records.set(key, { key, ...parsed, record });
	}
	if (!records.has(now)) records.set(now, { key: now, ...parseSeasonKey(now), record: normalizeSeasonRecord(null) });

	const ages = new Map();
	for (const entry of records.values()) {
		ages.set(entry.age, [...(ages.get(entry.age) ?? []), { ...entry, current: entry.key === now }]);
	}
	return [...ages]
		.sort(([a], [b]) => b - a)
		// Winter gives way to the next year's Spring within an Age, so the year is weighed first.
		.map(([age, seasons]) => ({ age, seasons: seasons.sort((a, b) => a.year - b.year || SEASONS.indexOf(a.season) - SEASONS.indexOf(b.season)) }));
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
