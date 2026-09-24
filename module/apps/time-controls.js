import { calendarLabel, getCalendar, setCalendar } from "../actions/calendar.js";
import { awardGlory } from "../actions/glory.js";
import { clearOffCourse, offCourseNow, rollTravellingBlind } from "../actions/landmarks.js";
import { rollRefereeTable } from "../actions/referee-rolls.js";
import { eventLabel, markSeasonEvent, seasonEventsNow, stageLabel } from "../actions/season-events.js";
import { advancePhase, announcePhase, journeyToDistantRealm, sufferHardship, turnAge, turnSeason, weeksPass } from "../actions/time.js";
import { t } from "../chat/cards.js";
import { GLORY_AWARDS } from "../rules/glory.js";
import { HARDSHIPS, PHASES, SEASONS } from "../rules/time.js";

/**
 * The world's calendar and what moves it (Time, p17), as the Time window and the GM
 * Toolkit's Time page show them: a Phase, a Season or an Age at a time, carrying out what
 * the book says happens between them, or set by hand.
 */

/** Referee Rolls offered beside the calendar. */
export const TIME_ROLLS = Object.freeze(["passage", "unresolved"]);

/**
 * What the buttons beside a calendar do. The Time window and the GM Toolkit's
 * Time page draw the same partials from the same context, so they carry out the
 * same acts too, and a button added to one works on both. Each reads only what
 * its own button says, since Foundry also hands a handler the click.
 */
export const TIME_ACTIONS = Object.freeze({
	nextPhase: () => advancePhase(),
	weeksPass: () => weeksPass(),
	markSeasonEvent: (_event, target) => markSeasonEvent(target.dataset.event),
	travellingBlind: () => rollTravellingBlind(),
	holdCourse: () => clearOffCourse(),
	turnSeason: () => turnSeason(),
	turnAge: () => turnAge(),
	journey: () => journeyToDistantRealm(),
	refereeRoll: (_event, target) => rollRefereeTable(target.dataset.table),
	hardship: (_event, target) => sufferHardship(target.dataset.hardship),
	awardGlory: (_event, target) => awardGlory(target.dataset.award)
});

/**
 * One of a Season's events as any page draws it (p17): the book's name for it,
 * where in the Season it falls, and whether it has come to pass. Shared by the
 * Season now and the Seasons already logged, so both read the same.
 * @param {object} event From seasonEventsView.
 * @param {string} season One of SEASONS, since a stage is named for its Season.
 * @returns {object}
 */
export function seasonEventLine(event, season) {
	return {
		key: event.key,
		label: eventLabel(event.key),
		text: t(`time.events.kinds.${event.key}.text`),
		stage: stageLabel(event.stage, season),
		icon: event.icon,
		passed: event.passed,
		next: event.next,
		collection: event.collection
	};
}

/**
 * The events that mark the Season the world is in (p17), as a page or panel
 * lists them: in order, each with the book's words, each saying whether it has
 * come to pass, and a line naming where the Weeks step carries the group.
 * @param {import("../rules/time.js").Calendar} calendar
 * @returns {{byname: string, events: object[], nextLine: string}}
 */
function seasonEventsContext(calendar) {
	const { events, next } = seasonEventsNow(calendar);
	const season = t(`time.seasons.${calendar.season}`);
	return {
		byname: t(`time.seasonBynames.${calendar.season}`),
		events: events.map((event) => seasonEventLine(event, calendar.season)),
		nextLine: next
			? t(next.collection ? "time.events.nextIsEnd" : "time.events.nextIs", { event: eventLabel(next.key) })
			: t("time.events.nothingLeft", { season })
	};
}

/**
 * What a page about the calendar shows. The Season's events and a Curse's
 * blight are the Referee's own, and every page that draws them keeps them
 * behind that guard, so they're only worked out for whoever will see them.
 * @param {object} [options]
 * @param {boolean} [options.referee] Whether the Referee's blocks are wanted.
 * @returns {object}
 */
export function timeContext({ referee = game.user?.isGM === true } = {}) {
	const calendar = getCalendar();
	return {
		now: calendarLabel(calendar),
		age: calendar.age,
		day: calendar.day,
		seasons: SEASONS.map((key) => ({ key, label: t(`time.seasons.${key}`), active: key === calendar.season })),
		phases: PHASES.map((key) => ({ key, label: t(`time.phases.${key}`), active: key === calendar.phase })),
		phaseHint: t(`time.phaseHints.${calendar.phase}`),
		winter: calendar.season === "winter",
		seasonEvents: referee ? seasonEventsContext(calendar) : null,
		// A Curse's blight, while the Company still carries it (p14).
		offCourse: referee ? offCourseNow(calendar) : null,
		rolls: TIME_ROLLS.map((key) => ({ key, label: t(`refereeRolls.tables.${key}.name`), hint: t(`refereeRolls.tables.${key}.hint`) })),
		hardships: HARDSHIPS.map(({ key }) => ({ key, label: t(`time.hardship.kinds.${key}.label`), hint: t(`time.hardship.kinds.${key}.hint`) })),
		gloryAwards: GLORY_AWARDS.map((key) => ({ key, label: t(`glory.awards.${key}.label`), hint: t(`glory.awards.${key}.hint`) }))
	};
}

/**
 * Set the calendar by hand, without anything that comes between Seasons or Ages. A new
 * Phase is still announced to the table. GMs only.
 * @param {{season?: string, phase?: string, age?: unknown, day?: unknown}} changes
 * @returns {Promise<unknown>|undefined}
 */
export async function setCalendarByHand({ season, phase, age, day }) {
	if (!game.user.isGM) return undefined;
	const calendar = getCalendar();
	const count = (value, fallback) => (Number.isInteger(Number(value)) && Number(value) >= 1 ? Number(value) : fallback);
	const changed = {
		...calendar,
		season: SEASONS.includes(season) ? season : calendar.season,
		phase: PHASES.includes(phase) ? phase : calendar.phase,
		age: age === undefined ? calendar.age : count(age, calendar.age),
		day: day === undefined ? calendar.day : count(day, calendar.day)
	};
	const result = await setCalendar(changed);
	if (changed.phase !== calendar.phase) await announcePhase(changed);
	return result;
}
