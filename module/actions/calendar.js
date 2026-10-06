import { t } from "../chat/cards.js";
import { DEFAULT_CALENDAR, cadencesTurned, normalizeCalendar } from "../rules/time.js";
import { SYSTEM_ID } from "../system-id.js";

/** The world's calendar: the Age, Season and Phase, with a Day tally that only keeps one Day's Night from the next. */
const CALENDAR_SETTING = "calendar";

/**
 * Called on every client whenever the calendar changes, with the new calendar,
 * the one before it, and which cadences came round between them (see cadencesTurned).
 */
export const CALENDAR_HOOK = `${SYSTEM_ID}.calendarChanged`;

/** @type {import("../rules/time.js").Calendar|null} The calendar as it stood, from when the world is ready, so each change knows what came round. */
let previous = null;

/** Register the calendar. Called during init. */
export function registerCalendarSetting() {
	game.settings.register(SYSTEM_ID, CALENDAR_SETTING, {
		scope: "world",
		config: false,
		type: Object,
		default: { ...DEFAULT_CALENDAR },
		onChange: (value) => {
			const after = normalizeCalendar(value);
			const before = previous ?? after;
			previous = after;
			Hooks.callAll(CALENDAR_HOOK, after, before, cadencesTurned(before, after));
		}
	});
}

/** Take the calendar as it stands, for CALENDAR_HOOK to say what the next change brings round. Called once the world is ready. */
export function watchCalendar() {
	previous = getCalendar();
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
 * The book names the Phase, the Season and the Age (p17) and never numbers the Days, so no label
 * shows the calendar's Day tally.
 * @param {import("../rules/time.js").Calendar} calendar
 * @returns {string} Such as "Night, Winter, Age 2".
 */
export function calendarLabel(calendar) {
	const { age, season, phase } = normalizeCalendar(calendar);
	return t("time.now", { age, season: t(`time.seasons.${season}`), phase: t(`time.phases.${phase}`) });
}

/**
 * The calendar as a chronicler writes it, smallest part first.
 * @param {import("../rules/time.js").Calendar} calendar
 * @returns {string} Such as "Afternoon, in the Spring of the 2nd Age."
 */
export function chronicleLabel(calendar) {
	const { age, season, phase } = normalizeCalendar(calendar);
	return t("time.chronicle", { phase: t(`time.phases.${phase}`), season: t(`time.seasons.${season}`), age: ordinalLabel(age) });
}

/**
 * A moment of the calendar as a sentence says it.
 * @param {import("../rules/time.js").Calendar} calendar
 * @returns {string} Such as "the Afternoon of Harvest in the Second Age".
 */
export function momentLabel(calendar) {
	const { age, season, phase } = normalizeCalendar(calendar);
	return t("time.moment", { phase: t(`time.phases.${phase}`), season: t(`time.seasons.${season}`), age: ordinalWord(age) });
}

/**
 * @param {number} n
 * @returns {string} Such as "Second", spelled out while there's a word for it, then as "13th".
 */
export function ordinalWord(n) {
	const key = `time.ordinalWords.${n}`;
	return game.i18n.has(`bastionland.${key}`) ? t(key) : ordinalLabel(n);
}

/**
 * @param {number} n
 * @returns {string} Such as "2nd".
 */
export function ordinalLabel(n) {
	return t(`time.ordinal.${new Intl.PluralRules(game.i18n.lang, { type: "ordinal" }).select(n)}`, { n });
}

/**
 * The Season a moment fell in, as a heading names it.
 * @param {import("../rules/time.js").Calendar} calendar
 * @returns {string} Such as "Spring of the 2nd Age".
 */
export function seasonLabel(calendar) {
	const { age, season } = normalizeCalendar(calendar);
	return t("time.seasonOfAge", { season: t(`time.seasons.${season}`), age: ordinalLabel(age) });
}
