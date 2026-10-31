/**
 * The Referee's d6 tables: the Luck Roll (Refereeing p16), Passage of Time and
 * Unresolved Situations (Time p17), and Travelling Blind, Dire Weather and
 * Local Mood (Travel p18). Every one reads 1 as the worst, 2-3 as middling and
 * 4-6 as the best, so each table is just its three results in that order.
 * Wording lives in the language file under `bastionland.refereeRolls.tables`.
 * Pure, so it can be tested without Foundry.
 */
import { isCalendar, nextPhase, samePhase } from "./time.js";

/** Tables in book order, with the page each is printed on. The Luck Roll's card carries no page link. */
export const REFEREE_TABLES = Object.freeze([
	{ key: "luck", page: 16, results: ["crisis", "problem", "blessing"], cardPage: false },
	{ key: "passage", page: 17, results: ["now", "afterNextSession", "continues"] },
	{ key: "unresolved", page: 17, results: ["worst", "worse", "better"] },
	{ key: "blind", page: 18, results: ["circleBack", "drift", "asPlanned"] },
	{ key: "weather", page: 18, results: ["dire", "looming", "fine"] },
	{ key: "mood", page: 18, results: ["woe", "decline", "fine"] }
].map((table) => Object.freeze({ ...table, results: Object.freeze(table.results) })));

/** Which way Travelling Blind drifts: a Hex to the left on a 2, to the right on a 3. */
export const DRIFT_SIDES = Object.freeze(["left", "right"]);

/** The rolls each of a table's three results comes up on, as they're written out. */
export const D6_BANDS = Object.freeze(["1", "2–3", "4–6"]);

/**
 * @param {number} d6
 * @returns {0|1|2} Which of a table's results the roll gives: 1, 2-3 or 4-6.
 */
export function d6Band(d6) {
	if (!Number.isInteger(d6) || d6 < 1 || d6 > 6) throw new RangeError(`${d6} isn't a d6 roll`);
	if (d6 === 1) return 0;
	return d6 <= 3 ? 1 : 2;
}

/**
 * Read a d6 on one of the Referee's tables.
 * @param {string} key One of REFEREE_TABLES.
 * @param {number} d6
 * @returns {{result: string, side: string|null}|null} `side` is where Travelling Blind drifts.
 *   Null for a table that doesn't exist.
 */
export function readRefereeTable(key, d6) {
	const table = REFEREE_TABLES.find((candidate) => candidate.key === key);
	if (!table) return null;
	const result = table.results[d6Band(d6)];
	return { result, side: result === "drift" ? DRIFT_SIDES[d6 - 2] : null };
}

/**
 * @typedef {object} WeatherRoll The Dire Weather table's last roll, as kept.
 * @property {import("./time.js").Calendar} when The Phase it was rolled in.
 * @property {string} rolled What the die gave, before a run of Looming made it dire.
 * @property {WeatherRoll|null} [before] The roll in an earlier Phase it was read against.
 */

/**
 * Dire Weather read against the roll before it: a Looming threat rolled a
 * second consecutive time is treated as dire weather (p18). The table is rolled
 * as each Phase begins, so only a roll in the Phase straight before counts as
 * the one before: a Phase with no roll, or weeks gone by, breaks the run. A
 * roll made again in the same Phase is read against what that Phase's own roll
 * was read against, so rolling twice never makes a run by itself.
 * @param {string} result The result just rolled on the weather table.
 * @param {WeatherRoll|null} previous The last roll kept, if any.
 * @param {import("./time.js").Calendar} now The Phase it's rolled in.
 * @returns {{result: string, streak: boolean, before: WeatherRoll|null}} `streak` when a
 *   second Looming made it dire. `before` is the earlier roll it was read against, to keep with it.
 */
export function weatherAfter(result, previous, now) {
	const earlier = previous && samePhase(previous.when, now) ? previous.before ?? null : previous ?? null;
	const before = isCalendar(earlier?.when) ? { when: earlier.when, rolled: earlier.rolled } : null;
	const streak = result === "looming" && before?.rolled === "looming" && samePhase(nextPhase(before.when), now);
	return { result: streak ? "dire" : result, streak, before };
}

/**
 * When a Realm's lands suffer dire weather (p18): never, in Winter as most
 * Realms do, or all year round. Wording lives under
 * `bastionland.refereeRolls.direWeather.risks`.
 */
export const DIRE_WEATHER_RISKS = Object.freeze(["never", "winter", "always"]);

/** Most Realms risk dire weather during Winter (p18). */
export const DEFAULT_DIRE_WEATHER_RISK = "winter";

/**
 * Whether the Dire Weather table is rolled as a Phase begins, which it is in
 * every Phase where dire weather rules the land (p18).
 * @param {string} risk One of DIRE_WEATHER_RISKS.
 * @param {string} season One of SEASONS in rules/time.js.
 * @returns {boolean}
 */
export const atMercyOfWeather = (risk, season) => risk === "always" || (risk === "winter" && season === "winter");

/**
 * Odds the Referee may state for a Luck Roll instead of reading its table:
 * a slim chance, say, or an even one (p182, p184). Each
 * is the lowest d6 that goes the players' way, listed from the likeliest
 * down, as they're offered. Wording lives under `bastionland.refereeRolls.odds`.
 */
export const LUCK_ODDS = Object.freeze([
	{ key: "high", needs: 2 },
	{ key: "likely", needs: 3 },
	{ key: "even", needs: 4 },
	{ key: "unlikely", needs: 5 },
	{ key: "slim", needs: 6 }
].map(Object.freeze));

/**
 * Read a Luck Roll at stated odds.
 * @param {string} odds One of LUCK_ODDS.
 * @param {number} d6
 * @returns {{favoured: boolean, needs: number}|null} Whether fortune favours the players. Null for odds that don't exist.
 */
export function luckAtOdds(odds, d6) {
	const stated = LUCK_ODDS.find((candidate) => candidate.key === odds);
	if (!stated) return null;
	d6Band(d6);
	return { favoured: d6 >= stated.needs, needs: stated.needs };
}
