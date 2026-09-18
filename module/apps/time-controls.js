import { calendarLabel, getCalendar, setCalendar } from "../actions/calendar.js";
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

/** @returns {object} What a page about the calendar shows. */
export function timeContext() {
	const calendar = getCalendar();
	return {
		now: calendarLabel(calendar),
		age: calendar.age,
		day: calendar.day,
		seasons: SEASONS.map((key) => ({ key, label: t(`time.seasons.${key}`), active: key === calendar.season })),
		phases: PHASES.map((key) => ({ key, label: t(`time.phases.${key}`), active: key === calendar.phase })),
		phaseHint: t(`time.phaseHints.${calendar.phase}`),
		winter: calendar.season === "winter",
		rolls: TIME_ROLLS.map((key) => ({ key, label: t(`refereeRolls.tables.${key}.name`), hint: t(`refereeRolls.tables.${key}.hint`) })),
		hardships: HARDSHIPS.map(({ key }) => ({ key, label: t(`time.hardship.kinds.${key}.label`), hint: t(`time.hardship.kinds.${key}.hint`) })),
		gloryAwards: GLORY_AWARDS.map((key) => ({ key, label: t(`glory.awards.${key}.label`), hint: t(`glory.awards.${key}.hint`) }))
	};
}

/**
 * Set the calendar by hand, without anything that comes between Seasons or Ages. GMs only.
 * @param {{season?: string, phase?: string, age?: unknown, day?: unknown}} changes
 * @returns {Promise<unknown>|undefined}
 */
export function setCalendarByHand({ season, phase, age, day }) {
	if (!game.user.isGM) return undefined;
	const calendar = getCalendar();
	const count = (value, fallback) => (Number.isInteger(Number(value)) && Number(value) >= 1 ? Number(value) : fallback);
	return setCalendar({
		...calendar,
		season: SEASONS.includes(season) ? season : calendar.season,
		phase: PHASES.includes(phase) ? phase : calendar.phase,
		age: age === undefined ? calendar.age : count(age, calendar.age),
		day: day === undefined ? calendar.day : count(day, calendar.day)
	});
}
