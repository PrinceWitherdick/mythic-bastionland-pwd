import { SYSTEM_ID } from "../system-id.js";

/**
 * The blight a Curse leaves (p14), kept apart from the rest of the Landmarks'
 * workings so the Company's moves can read it without drawing in the calendar's.
 */

/** Where the Curse that threw the Company off course is kept: the calendar it struck in, or null. */
const OFF_COURSE_SETTING = "offCourse";

/** Register the blight a Curse leaves. Called during init. */
export function registerOffCourse() {
	game.settings.register(SYSTEM_ID, OFF_COURSE_SETTING, {
		scope: "world",
		config: false,
		type: Object,
		default: null
	});
}

/** @returns {object|null} The calendar the Curse struck in, or null while the Company holds its course. */
export const getOffCourse = () => game.settings.get(SYSTEM_ID, OFF_COURSE_SETTING) ?? null;

/**
 * @param {object|null} calendar The Phase the Curse struck in.
 * @returns {Promise<unknown>|undefined} GMs only.
 */
export const setOffCourse = (calendar) =>
	(game.user.isGM ? game.settings.set(SYSTEM_ID, OFF_COURSE_SETTING, calendar) : undefined);

/** Let go of a Curse's blight, once it's been rolled for or has lapsed. GMs only. */
export const clearOffCourse = () => setOffCourse(null);
