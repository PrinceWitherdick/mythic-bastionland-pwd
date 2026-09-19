import { t } from "../chat/cards.js";
import { DEFAULT_CALENDAR, normalizeCalendar } from "../rules/time.js";
import { SYSTEM_ID } from "../system-id.js";

/** The world's calendar: the Age, Season, Day and Phase. */
const CALENDAR_SETTING = "calendar";

/** Called on every client with the new calendar whenever it changes. */
export const CALENDAR_HOOK = `${SYSTEM_ID}.calendarChanged`;

/** Register the calendar. Called during init. */
export function registerCalendarSetting() {
	game.settings.register(SYSTEM_ID, CALENDAR_SETTING, {
		scope: "world",
		config: false,
		type: Object,
		default: { ...DEFAULT_CALENDAR },
		onChange: (value) => Hooks.callAll(CALENDAR_HOOK, normalizeCalendar(value))
	});
}

/** @returns {import("../rules/time.js").Calendar} */
export function getCalendar() {
	return normalizeCalendar(game.settings.get(SYSTEM_ID, CALENDAR_SETTING));
}

/**
 * Save the calendar. Only GMs can.
 * @param {import("../rules/time.js").Calendar} calendar
 */
export function setCalendar(calendar) {
	return game.settings.set(SYSTEM_ID, CALENDAR_SETTING, normalizeCalendar(calendar));
}

/**
 * @param {import("../rules/time.js").Calendar} calendar
 * @returns {string} Such as "Age 2, Winter, day 3, Night".
 */
export function calendarLabel(calendar) {
	const { age, season, day, phase } = normalizeCalendar(calendar);
	return t("time.now", { age, season: t(`time.seasons.${season}`), day, phase: t(`time.phases.${phase}`) });
}

/**
 * The calendar as a chronicler writes it, smallest part first.
 * @param {import("../rules/time.js").Calendar} calendar
 * @returns {string} Such as "The Afternoon of the 14th day of Spring, in the 2nd Age."
 */
export function chronicleLabel(calendar) {
	const { age, season, day, phase } = normalizeCalendar(calendar);
	const rules = new Intl.PluralRules(game.i18n.lang, { type: "ordinal" });
	const ordinal = n => t(`time.ordinal.${rules.select(n)}`, { n });
	return t("time.chronicle", { phase: t(`time.phases.${phase}`), day: ordinal(day), season: t(`time.seasons.${season}`), age: ordinal(age) });
}
