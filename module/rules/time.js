/**
 * Time (p17). Each Day has 3 Phases, each Year 3 Seasons, and each Life 3 Ages.
 * The world's calendar counts Ages from 1, with the Season, Day and Phase
 * within it. Pure, so it can be tested without Foundry.
 */
import { AGES } from "../config.js";

export const PHASES = Object.freeze(["morning", "afternoon", "night"]);

export const SEASONS = Object.freeze(["spring", "harvest", "winter"]);

/** Each Phase's icon, on its card. */
export const PHASE_ICONS = Object.freeze({ morning: "fa-solid fa-sun", afternoon: "fa-solid fa-cloud-sun", night: "fa-solid fa-moon" });

/** Each Season's icon, on its card and the Seasons page. */
export const SEASON_ICONS = Object.freeze({ spring: "fa-solid fa-seedling", harvest: "fa-solid fa-wheat-awn", winter: "fa-regular fa-snowflake" });

/** What each Knight chooses between Seasons, and between Ages. */
export const SEASON_PURSUITS = Object.freeze(["pilgrimage", "courtesy", "service"]);
export const AGE_PURSUITS = Object.freeze(["duty", "succession", "legacy"]);

/** Virtue Loss from hardship on the road (Travel, p18), and the Virtue each costs. */
export const HARDSHIPS = Object.freeze([
	Object.freeze({ key: "night", virtue: "spi" }),
	Object.freeze({ key: "sleep", virtue: "cla" }),
	Object.freeze({ key: "winter", virtue: "vig" }),
	Object.freeze({ key: "supplies", virtue: "vig" })
]);

/** Each Virtue is rerolled on this when a character grows Mature or Old. */
export const AGING_VIRTUE_ROLL = "1d12 + 1d6";

/** Old characters lose this much VIG at the end of each Age. */
export const OLD_AGE_LOSS = "1d12";

export const DEFAULT_CALENDAR = Object.freeze({ age: 1, season: SEASONS[0], day: 1, phase: PHASES[0] });

const isCount = (value) => Number.isInteger(value) && value >= 1;

/**
 * @typedef {object} Calendar
 * @property {number} age    Counted from 1.
 * @property {string} season One of SEASONS.
 * @property {number} day    Counted from 1 within the Season.
 * @property {string} phase  One of PHASES.
 */

/**
 * A calendar with anything missing or unreadable set to where a game begins.
 * @param {object|null|undefined} raw As stored.
 * @returns {Calendar}
 */
export function normalizeCalendar(raw) {
	return {
		age: isCount(raw?.age) ? raw.age : DEFAULT_CALENDAR.age,
		season: SEASONS.includes(raw?.season) ? raw.season : DEFAULT_CALENDAR.season,
		day: isCount(raw?.day) ? raw.day : DEFAULT_CALENDAR.day,
		phase: PHASES.includes(raw?.phase) ? raw.phase : DEFAULT_CALENDAR.phase
	};
}

/**
 * @param {Calendar} calendar
 * @returns {Calendar} The next Phase. Night gives way to the next Day's Morning.
 */
export function nextPhase(calendar) {
	const now = normalizeCalendar(calendar);
	const index = PHASES.indexOf(now.phase);
	if (index < PHASES.length - 1) return { ...now, phase: PHASES[index + 1] };
	return { ...now, day: now.day + 1, phase: PHASES[0] };
}

/**
 * @param {Calendar} calendar
 * @returns {Calendar} The first Morning of the next Season. Winter gives way to
 *   Spring, but the Age turns only when the group decides it does.
 */
export function nextSeason(calendar) {
	const now = normalizeCalendar(calendar);
	return { ...now, season: SEASONS[(SEASONS.indexOf(now.season) + 1) % SEASONS.length], day: 1, phase: PHASES[0] };
}

/**
 * @param {Calendar} calendar
 * @returns {Calendar} The next Age, which begins in Spring.
 */
export function nextAge(calendar) {
	const now = normalizeCalendar(calendar);
	return { age: now.age + 1, season: SEASONS[0], day: 1, phase: PHASES[0] };
}

/**
 * @param {Calendar} calendar
 * @returns {string} The Age and Season, such as "2-winter", which is all a Scar needs to remember.
 */
export function seasonKey(calendar) {
	const { age, season } = normalizeCalendar(calendar);
	return `${age}-${season}`;
}

/**
 * The inverse of seasonKey.
 * @param {string} key Such as "2-winter".
 * @returns {{age: number, season: string}|null} Null for a key that isn't a Season's.
 */
export function parseSeasonKey(key) {
	const match = /^(\d+)-(\w+)$/.exec(String(key ?? ""));
	if (!match || !SEASONS.includes(match[2]) || Number(match[1]) < 1) return null;
	return { age: Number(match[1]), season: match[2] };
}

/**
 * The Ages a character grows into when their Age changes. Growing younger, or
 * staying put, passes none.
 * @param {string} from One of AGES.
 * @param {string} to
 * @returns {string[]} Such as ["mature", "old"] for a Young character becoming Old.
 */
export function agingSteps(from, to) {
	const before = AGES.indexOf(from);
	const after = AGES.indexOf(to);
	if (before < 0 || after <= before) return [];
	return AGES.slice(before + 1, after + 1);
}

/**
 * A Virtue rerolled on growing older: becoming Mature keeps the higher of the
 * score and the roll, becoming Old keeps the lower. Current loss is kept, so a
 * character down 3 from their maximum is still down 3 from the new one.
 * @param {{value: number, max: number}} score
 * @param {number} rolled
 * @param {string} becoming "mature" or "old".
 * @returns {{value: number, max: number}}
 */
export function agedScore({ value, max }, rolled, becoming) {
	const kept = becoming === "old" ? Math.min(max, rolled) : Math.max(max, rolled);
	return { max: kept, value: Math.min(kept, Math.max(0, value + kept - max)) };
}

/**
 * Legacy (Between Ages, p17): a Knight's successor gains half of their current Glory.
 * @param {number} glory The Knight's Glory.
 * @returns {number} What the successor gains, rounded down.
 */
export const legacyGlory = (glory) => Math.floor(Math.max(0, Number(glory) || 0) / 2);

/**
 * An Old character's VIG at the end of an Age.
 * @param {number} max Their max VIG.
 * @param {number} loss The d12 rolled.
 * @returns {{max: number, diesPeacefully: boolean}}
 */
export function afterOldAge(max, loss) {
	const left = Math.max(0, max - loss);
	return { max: left, diesPeacefully: left === 0 };
}
