/**
 * The events that mark each Season (Time, p17). Every Season begins with a
 * Feast, sees a mass at its middle, and ends with the Realm's collection: the
 * Tax, the Tithe or the Levy.
 *
 * The book never numbers the Days of a Season, and never says how long one
 * lasts, so these are milestones in the order they come rather than dates.
 * Advancing Time's Weeks step, "continue on to the next significant seasonal
 * event", carries the group from one to the next. Pure, so it can be tested
 * without Foundry; the language file puts the book's words to each one.
 */
import { SEASONS } from "./time.js";

/** Where in its Season an event falls. */
export const EVENT_STAGES = Object.freeze(["begins", "middle", "ends"]);

/**
 * The stage the book gives each Season its own word for: Midspring, Midharvest,
 * Midwinter. The others read the same in every Season, such as "Spring begins".
 */
export const MIDPOINT_STAGE = "middle";

const event = (key, stage, icon, collection = false) => Object.freeze({ key, stage, icon, collection });

/**
 * @typedef {object} SeasonEvent
 * @property {string} key             Its own key, unique across every Season.
 * @property {string} stage           One of EVENT_STAGES.
 * @property {string} icon
 * @property {boolean} collection     Whether it's the share the Realm collects, which ends the Season.
 */

/** Each Season's three events, in the order they come. */
export const SEASON_EVENTS = Object.freeze({
	spring: Object.freeze([
		event("feastOfTheSun", "begins", "fa-solid fa-sun"),
		event("sceptremass", "middle", "fa-solid fa-scroll"),
		event("tax", "ends", "fa-solid fa-coins", true)
	]),
	harvest: Object.freeze([
		event("feastOfTheStars", "begins", "fa-solid fa-star"),
		event("eldermass", "middle", "fa-solid fa-eye"),
		event("tithe", "ends", "fa-solid fa-wheat-awn", true)
	]),
	winter: Object.freeze([
		event("feastOfTheMoon", "begins", "fa-solid fa-moon"),
		event("kindlemass", "middle", "fa-solid fa-fire"),
		event("levy", "ends", "fa-solid fa-hammer", true)
	])
});

/** Every event's key, in Season order. */
export const EVENT_KEYS = Object.freeze(SEASONS.flatMap((season) => SEASON_EVENTS[season].map(({ key }) => key)));

/**
 * @param {string} season One of SEASONS.
 * @returns {SeasonEvent[]} Its three events in order, or none for anything else.
 */
export const eventsFor = (season) => SEASON_EVENTS[season] ?? [];

/**
 * @param {string} key
 * @returns {(SeasonEvent & {season: string})|null} The event and the Season it belongs to.
 */
export function findEvent(key) {
	for (const season of SEASONS) {
		const found = eventsFor(season).find((candidate) => candidate.key === key);
		if (found) return { ...found, season };
	}
	return null;
}

/**
 * @param {string} season One of SEASONS.
 * @returns {SeasonEvent|null} The share the Realm collects as the Season ends.
 */
export const collectionFor = (season) => eventsFor(season).find(({ collection }) => collection) ?? null;

/**
 * The events of a Season that have come to pass, as stored: anything that isn't
 * an event is dropped, each is counted once, and they come back in book order
 * so a record written in any order reads the same.
 * @param {unknown} raw       As stored, from a Season's record.
 * @param {string} [season]   Keep only this Season's events. Every Season's, without one.
 * @returns {string[]}
 */
export function normalizeEvents(raw, season = null) {
	const allowed = season === null ? EVENT_KEYS : eventsFor(season).map(({ key }) => key);
	const passed = new Set(Array.isArray(raw) ? raw.filter((key) => allowed.includes(key)) : []);
	return allowed.filter((key) => passed.has(key));
}

/**
 * @param {string} season One of SEASONS.
 * @param {unknown} passed As stored.
 * @returns {SeasonEvent|null} The next event still to come, or null once all three have passed.
 */
export function nextEventFor(season, passed) {
	const already = normalizeEvents(passed, season);
	return eventsFor(season).find(({ key }) => !already.includes(key)) ?? null;
}

/**
 * Whether an event can be marked as having come to pass: it must be one of this
 * Season's, and not already passed.
 * @param {string} season One of SEASONS.
 * @param {string} key
 * @param {unknown} passed As stored.
 * @returns {boolean}
 */
export function canMarkEvent(season, key, passed) {
	if (!eventsFor(season).some((candidate) => candidate.key === key)) return false;
	return !normalizeEvents(passed, season).includes(key);
}

/**
 * A Season's events with the one marked added, ready to store.
 * @param {string} season One of SEASONS.
 * @param {string} key
 * @param {unknown} passed As stored.
 * @returns {string[]} Unchanged when the event isn't this Season's.
 */
export function withEventPassed(season, key, passed) {
	// normalizeEvents keeps only this Season's events, in book order, without repeats,
	// so a key that isn't the Season's is dropped and one already passed stays put.
	return normalizeEvents([...normalizeEvents(passed, season), key], season);
}

/**
 * A Season's events as a page or panel lists them: in order, each saying
 * whether it has come to pass and which is next.
 * @param {string} season One of SEASONS.
 * @param {unknown} passed As stored.
 * @returns {(SeasonEvent & {passed: boolean, next: boolean})[]}
 */
export function seasonEventsView(season, passed) {
	const already = normalizeEvents(passed, season);
	const next = nextEventFor(season, already);
	return eventsFor(season).map((candidate) => ({
		...candidate,
		passed: already.includes(candidate.key),
		next: candidate.key === next?.key
	}));
}
