/**
 * Time (p17). Each Day has 3 Phases, each Year 3 Seasons, and each Life 3 Ages.
 * The world's calendar counts Ages from 1, with the Season and Phase within
 * it. The book never numbers the Days, so the Day is a tally kept out of
 * sight: it only tells one Day's Phases from the next, for whatever comes due
 * a Phase or a Day on (hardship, Council tasks, the order of visits). Pure, so
 * it can be tested without Foundry.
 */
import { AGES } from "../config.js";

export const PHASES = Object.freeze(["morning", "afternoon", "night"]);

export const SEASONS = Object.freeze(["spring", "harvest", "winter"]);

/** Each Phase's icon, on its card. */
export const PHASE_ICONS = Object.freeze({ morning: "fa-solid fa-sun", afternoon: "fa-solid fa-cloud-sun", night: "fa-solid fa-moon" });

/** Each Season's icon, on its card and the Toolkit's Time page. */
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

export const DEFAULT_CALENDAR = Object.freeze({ age: 1, year: 1, season: SEASONS[0], day: 1, phase: PHASES[0] });

const isCount = (value) => Number.isInteger(value) && value >= 1;

/**
 * @typedef {object} Calendar
 * @property {number} age    Counted from 1.
 * @property {number} year   Counted from 1 across the whole game, and never shown: it goes up
 *   each time Winter gives way to Spring, or an Age turns, so one Spring can be told from the next.
 * @property {string} season One of SEASONS.
 * @property {number} day    Counted from 1 within the Season, and never shown.
 * @property {string} phase  One of PHASES.
 */

/**
 * Whether something stored reads as a whole calendar in its own right, rather
 * than being mended into one. What was never written down is told apart from a
 * date that was, which is how a Scar or a Curse knows it holds nothing yet.
 * @param {unknown} value
 * @returns {boolean}
 */
export const isCalendar = (value) =>
	Boolean(value) &&
	isCount(value.age) &&
	// A calendar written down before the year was counted is still one.
	(value.year === undefined || isCount(value.year)) &&
	SEASONS.includes(value.season) &&
	isCount(value.day) &&
	PHASES.includes(value.phase);

/**
 * A calendar with anything missing or unreadable set to where a game begins.
 * @param {object|null|undefined} raw As stored.
 * @returns {Calendar}
 */
export function normalizeCalendar(raw) {
	return {
		age: isCount(raw?.age) ? raw.age : DEFAULT_CALENDAR.age,
		year: isCount(raw?.year) ? raw.year : DEFAULT_CALENDAR.year,
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
	return nextDay(now);
}

/**
 * The Morning a new Day dawns on. The book counts a Day's 3 Phases but never
 * numbers the Days of a Season, so the Day count only tallies the Days played;
 * weeks passing moves the calendar on one Morning rather than claiming a figure
 * the book doesn't give.
 * @param {Calendar} calendar
 * @returns {Calendar}
 */
export function nextDay(calendar) {
	const now = normalizeCalendar(calendar);
	return { ...now, day: now.day + 1, phase: PHASES[0] };
}

/**
 * @param {Calendar} calendar
 * @returns {Calendar} The first Morning of the next Season. Winter gives way to
 *   the next year's Spring, but the Age turns only when the group decides it does.
 */
export function nextSeason(calendar) {
	const now = normalizeCalendar(calendar);
	const index = SEASONS.indexOf(now.season) + 1;
	const year = index < SEASONS.length ? now.year : now.year + 1;
	return { ...now, year, season: SEASONS[index % SEASONS.length], day: 1, phase: PHASES[0] };
}

/**
 * @param {Calendar} calendar
 * @returns {Calendar} The next Age, which begins in the next year's Spring.
 */
export function nextAge(calendar) {
	const now = normalizeCalendar(calendar);
	return { age: now.age + 1, year: now.year + 1, season: SEASONS[0], day: 1, phase: PHASES[0] };
}

/**
 * Where a calendar stands, weighed part by part: the Age, the year, the
 * Season, the Day (which runs within a Season), then the Phase.
 * @param {Calendar} calendar
 * @returns {number[]}
 */
function calendarRank(calendar) {
	const { age, year, season, day, phase } = normalizeCalendar(calendar);
	return [age, year, SEASONS.indexOf(season), day, PHASES.indexOf(phase)];
}

/**
 * @param {number[]} left
 * @param {number[]} right
 * @returns {-1|0|1}
 */
function compareRanks(left, right) {
	for (let part = 0; part < left.length; part++) {
		if (left[part] !== right[part]) return left[part] < right[part] ? -1 : 1;
	}
	return 0;
}

/** How much of a calendar's rank names its Season, and its Day. */
const SEASON_PARTS = 3;
const DAY_PARTS = 4;

/**
 * Where a calendar stands against another, so that something set for a later
 * Phase, Day or Season can tell whether its time has come.
 * @param {Calendar} a
 * @param {Calendar} b
 * @returns {-1|0|1} Negative where `a` comes first.
 */
export function compareCalendars(a, b) {
	return compareRanks(calendarRank(a), calendarRank(b));
}

/**
 * Which cadences a change of calendar brings round: a new Season (which is
 * also a new Day), a new Day's Morning, or Night falling. A calendar set back
 * brings nothing round.
 * @param {Calendar} before
 * @param {Calendar} after
 * @returns {string[]} Some of "season", "day" and "night".
 */
export function cadencesTurned(before, after) {
	const then = calendarRank(before);
	const now = calendarRank(after);
	const byDay = compareRanks(now.slice(0, DAY_PARTS), then.slice(0, DAY_PARTS));
	const turned = [];
	if (compareRanks(now.slice(0, SEASON_PARTS), then.slice(0, SEASON_PARTS)) > 0) turned.push("season");
	if (byDay > 0) turned.push("day");
	const night = PHASES.indexOf("night");
	if (now[DAY_PARTS] === night && (byDay > 0 || (byDay === 0 && then[DAY_PARTS] !== night))) turned.push("night");
	return turned;
}

/**
 * One Season of the game, which is all a Scar needs to remember. The first
 * year's keys are written as they were before the year was counted, so what
 * was stored then still matches.
 * @param {Calendar} calendar
 * @returns {string} The Age, the year past the first, and the Season: "2-winter", or "2-3-winter" in the third year.
 */
export function seasonKey(calendar) {
	const { age, year, season } = normalizeCalendar(calendar);
	return year === 1 ? `${age}-${season}` : `${age}-${year}-${season}`;
}

/**
 * The inverse of seasonKey.
 * @param {string} key Such as "2-winter" or "2-3-winter".
 * @returns {{age: number, year: number, season: string}|null} Null for a key that isn't a Season's.
 */
export function parseSeasonKey(key) {
	const match = /^(\d+)-(?:(\d+)-)?(\w+)$/.exec(String(key ?? ""));
	if (!match || !SEASONS.includes(match[3]) || Number(match[1]) < 1) return null;
	const year = match[2] === undefined ? 1 : Number(match[2]);
	if (year < 1) return null;
	return { age: Number(match[1]), year, season: match[3] };
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
