/**
 * What a Landmark asks of the travellers who find it (Creating a Realm, p14).
 * Four of the six do something: a Monument restores SPI as a Sacrament would, a
 * Hazard is pushed through for d6 in a Virtue, a Curse throws the Company off
 * course so the next travelling Phase counts as travelling blind (p18), and a
 * Ruin echoes a Myth the Realm doesn't currently hold. Dwellings and Sanctums
 * are places rather than demands, and a Sanctum's Seer is already rolled when
 * the Realm is made. Pure, so it can be tested without Foundry.
 */
import { LANDMARK_TYPES } from "./realm.js";
import { isCalendar, nextPhase, samePhase } from "./time.js";

/** What a Landmark offers the Company, each a button on the card that found it. */
export const LANDMARK_OFFERS = Object.freeze(["restoreSpirit", "pushThrough", "echoMyth", "goBack"]);

/**
 * @typedef {object} LandmarkEffect
 * @property {string|null} offer   One of LANDMARK_OFFERS, or null where the Landmark asks nothing.
 * @property {string|null} also    A second of LANDMARK_OFFERS, where the Landmark leaves a choice.
 * @property {string|null} virtue  The Virtue it restores or costs, where it touches one.
 * @property {boolean} offCourse   Whether finding it throws the Company off course.
 * @property {string|null} icon    On the offer's button.
 * @property {string|null} alsoIcon On the second offer's button.
 */

const effect = ({ offer = null, also = null, virtue = null, offCourse = false, icon = null, alsoIcon = null } = {}) =>
	Object.freeze({ offer, also, virtue, offCourse, icon, alsoIcon });

/** Each Landmark type's effect, by type. */
export const LANDMARK_EFFECTS = Object.freeze({
	dwelling: effect(),
	sanctum: effect(),
	monument: effect({ offer: "restoreSpirit", virtue: "spi", icon: "fa-solid fa-hands-praying" }),
	// Pushing through costs d6 of a Virtue, most often VIG, so VIG is offered and the Referee may
	// choose another, or the Company turns back. Devising a solution is the players' own, with no button.
	hazard: effect({
		offer: "pushThrough",
		also: "goBack",
		virtue: "vig",
		icon: "fa-solid fa-mountain-sun",
		alsoIcon: "fa-solid fa-person-walking-arrow-loop-left"
	}),
	curse: effect({ offCourse: true, icon: "fa-solid fa-eye-low-vision" }),
	ruin: effect({ offer: "echoMyth", icon: "fa-solid fa-dice" })
});

/**
 * @param {string} type One of LANDMARK_TYPES.
 * @returns {LandmarkEffect|null} Null for anything that isn't a Landmark type.
 */
export const landmarkEffect = (type) => (LANDMARK_TYPES.includes(type) ? LANDMARK_EFFECTS[type] : null);

/**
 * @param {string} type One of LANDMARK_TYPES.
 * @returns {boolean} Whether finding it throws the Company off course (p14).
 */
export const throwsOffCourse = (type) => Boolean(landmarkEffect(type)?.offCourse);

/**
 * The prompt a Myth's page gives a Landmark of this type: each page prints one
 * of every type along its foot, "Dwelling: Shepherd fields ~ Sanctum: …" (p14).
 * @param {{label: string, value: string}[]|null} prompts From the Myth's page.
 * @param {string} type One of LANDMARK_TYPES.
 * @returns {string|null}
 */
export function landmarkPrompt(prompts, type) {
	if (!LANDMARK_TYPES.includes(type) || !Array.isArray(prompts)) return null;
	return prompts.find((prompt) => prompt.label?.trim().toLowerCase() === type)?.value?.trim() || null;
}

/**
 * How the Company stands after a Curse threw them off course:
 * - `pending` while the Phase it struck in runs on, so the blind Phase is still to come.
 * - `live` in the Phase that follows, where travel counts as travelling blind.
 * - `lapsed` once that Phase has passed, or the calendar was set elsewhere.
 */
export const OFF_COURSE_STATES = Object.freeze(["pending", "live", "lapsed"]);

/**
 * The states worth a word to the Referee. A lapsed Curse is simply let go, so
 * nothing is written for it.
 */
export const OFF_COURSE_SHOWN = Object.freeze(["pending", "live"]);

export { samePhase };

/**
 * Where a Curse's blight stands now.
 * @param {unknown} struck  The calendar when the Curse was found, as stored.
 * @param {import("./time.js").Calendar} now
 * @returns {"pending"|"live"|"lapsed"|null} Null when no Curse is being carried.
 */
export function offCourseState(struck, now) {
	if (!isCalendar(struck) || !isCalendar(now)) return null;
	if (samePhase(struck, now)) return "pending";
	if (samePhase(nextPhase(struck), now)) return "live";
	return "lapsed";
}

/**
 * @param {unknown} struck From storage.
 * @param {import("./time.js").Calendar} now
 * @returns {boolean} Whether the blight is worth a word to the Referee.
 */
export function offCourseShown(struck, now) {
	return OFF_COURSE_SHOWN.includes(offCourseState(struck, now));
}
