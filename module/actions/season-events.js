import { postCard, t } from "../chat/cards.js";
import {
	MIDPOINT_STAGE,
	canMarkEvent,
	collectionFor,
	findEvent,
	nextEventFor,
	seasonEventsView,
	withEventPassed
} from "../rules/season-events.js";
import { seasonKey } from "../rules/time.js";
import { getCalendar } from "./calendar.js";
import { worldDomains } from "./dominion.js";
import { ensureGmToolkit } from "./gm-toolkit.js";
import { seasonRecord, writeSeasonEvents } from "./season-log.js";

/**
 * The events that mark each Season (Time, p17): a Feast to begin it, a mass at
 * its middle, and the Realm's collection to end it. Which have come to pass is
 * kept in the Season's own record on the GM Toolkit, so the Time page shows
 * them alongside how the Season ended.
 */

/**
 * Where the Season stands: its three events, which have come to pass, and which
 * is next.
 * @param {import("../rules/time.js").Calendar} [calendar] Now, by default.
 * @returns {{season: string, key: string, passed: string[], events: object[], next: object|null}}
 */
export function seasonEventsNow(calendar = getCalendar()) {
	const key = seasonKey(calendar);
	const { events: passed } = seasonRecord(key);
	return {
		season: calendar.season,
		key,
		passed,
		events: seasonEventsView(calendar.season, passed),
		next: nextEventFor(calendar.season, passed)
	};
}

/**
 * An event's name, as the book prints it.
 * @param {string} key
 * @returns {string}
 */
export const eventLabel = (key) => t(`time.events.kinds.${key}.label`);

/**
 * Where in its Season an event falls, as the book says it: "Spring begins", the
 * book's own "Midspring", or "Spring ends".
 * @param {string} stage  One of EVENT_STAGES.
 * @param {string} season One of SEASONS.
 * @returns {string}
 */
export function stageLabel(stage, season) {
	if (stage === MIDPOINT_STAGE) return t(`time.seasonMidpoints.${season}`);
	return t(`time.events.stages.${stage}`, { season: t(`time.seasons.${season}`) });
}

/**
 * Tell the table a seasonal event has come to pass, on a card painted in the
 * Season's colours. The Realm's collection names the Domains that gather it and
 * points at the roll for squeezing more out of them (p21).
 * @param {object} event  From SEASON_EVENTS.
 * @param {string} season One of SEASONS.
 * @param {object} [options]
 * @param {boolean} [options.weeks] Whether weeks passed to reach it.
 * @returns {Promise<unknown>}
 */
export function announceSeasonEvent(event, season, { weeks = false } = {}) {
	const domains = event.collection ? worldDomains() : [];
	const prompt = t(`time.events.kinds.${event.key}.prompt`);
	return postCard(null, "report", {
		tone: season,
		icon: event.icon,
		title: eventLabel(event.key),
		tagline: stageLabel(event.stage, season),
		// The event's line is the book's, so before Import PDF has read it the Season's name stands alone.
		entries: [{ name: t(`time.seasonBynames.${season}`), lines: [t(`time.events.kinds.${event.key}.text`)].filter(Boolean) }],
		due: domains.length ? [t("time.events.collected", { domains: domains.map((domain) => domain.name).join(", ") })] : [],
		hint: [weeks ? t("time.events.weeksPassed") : null, prompt].filter(Boolean).join(" "),
		hintAside: true
	});
}

/**
 * Mark one of this Season's events as having come to pass and post its card.
 * The Realm's collection ends the Season, so it's marked as the Season turns
 * rather than here. GMs only.
 * @param {string} key                 The event's key.
 * @param {object} [options]
 * @param {boolean} [options.weeks]    Whether weeks passed to reach it.
 * @param {boolean} [options.announce] Whether to post its card.
 * @returns {Promise<object|null>} The event, or null if it isn't this Season's or has already passed.
 */
export async function markSeasonEvent(key, { weeks = false, announce = true } = {}) {
	if (!game.user.isGM) return null;
	const calendar = getCalendar();
	const { key: thisSeason, passed } = seasonEventsNow(calendar);
	if (!canMarkEvent(calendar.season, key, passed)) {
		ui.notifications.warn(t("time.events.notThisSeason", { event: eventLabel(key) }));
		return null;
	}

	// The record lives on the toolkit, so a world that has none yet gets one.
	await ensureGmToolkit();
	await writeSeasonEvents(thisSeason, withEventPassed(calendar.season, key, passed));
	const event = findEvent(key);
	if (announce) await announceSeasonEvent(event, calendar.season, { weeks });
	return event;
}

/**
 * The Realm's collection, marked as the Season it ends comes to a close. Called
 * as the Season turns, so nothing is posted: the Season's own card names it.
 * @param {string} key    The Season's key, such as "2-winter".
 * @param {string} season One of SEASONS.
 * @returns {Promise<object|null>} The collection, or null without one.
 */
export async function markCollection(key, season) {
	const collection = collectionFor(season);
	if (!game.user.isGM || !collection) return null;
	// The record lives on the toolkit, so a world that has none yet gets one: without
	// it the write is dropped while the Season's card still says what was gathered.
	await ensureGmToolkit();
	const { events: passed } = seasonRecord(key);
	await writeSeasonEvents(key, withEventPassed(season, collection.key, passed));
	return collection;
}

/**
 * The Season's collection as a line on the card for the Season that just ended:
 * what the Realm gathers, and from whom.
 * @param {object} collection From SEASON_EVENTS.
 * @returns {{name: string, lines: string[]}}
 */
export function collectionEntry(collection) {
	const domains = worldDomains();
	return {
		name: eventLabel(collection.key),
		lines: [
			t(`time.events.kinds.${collection.key}.text`),
			...(domains.length ? [t("time.events.collected", { domains: domains.map((domain) => domain.name).join(", ") })] : [])
		].filter(Boolean)
	};
}
