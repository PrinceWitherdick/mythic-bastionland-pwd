/**
 * Council tasks (p20): "Members of your Council can be assigned to tasks.
 * Depending on the scope these could take a Phase, a Week, or a full Season.
 * These are handled just as normal actions (p16), with failure typically
 * causing a Crisis."
 *
 * The Action Procedure (p16) settles a normal action on its fourth step,
 * Risk: "No risk, no roll. Otherwise make a Save or a Luck Roll." So a task is
 * written down with what settles it, and the Luck Roll's own bands carry the
 * rest: a Crisis on a 1, a Problem on 2-3, and the work done on 4-6. A failed
 * Save brings a Crisis the same way.
 *
 * Each task remembers the calendar it was taken up on, so its scope says when
 * it comes due: the next Phase, the next Day, or the next Season. Kept by an id
 * in an object, as the Court is, so the sheet can write one line at a time.
 * Pure, so it can be tested without Foundry.
 */
import { COUNCIL_SEATS } from "./dominion.js";
import { d6Band } from "./referee-rolls.js";
import { trimmedText } from "./text.js";
import { compareCalendars, nextDay, nextPhase, nextSeason, normalizeCalendar } from "./time.js";
import { VIRTUES } from "./virtues.js";

/** How long a task takes, in the order the book gives them. */
export const TASK_SCOPES = Object.freeze(["phase", "week", "season"]);

/** Each scope's icon, on the sheet and its cards. */
export const TASK_SCOPE_ICONS = Object.freeze({
	phase: "fa-regular fa-clock",
	week: "fa-solid fa-calendar-week",
	season: "fa-solid fa-leaf"
});

/** What settles a task (p16): no risk and no roll, a Luck Roll, or a Save in one Virtue. */
export const TASK_RISKS = Object.freeze(["none", "luck", ...VIRTUES]);

/** What comes of a task. A Crisis is what failure typically brings (p20). */
export const TASK_OUTCOMES = Object.freeze(["success", "problem", "crisis"]);

/** The Luck Roll's three bands (p16) as task outcomes, in d6Band order. */
const LUCK_OUTCOMES = Object.freeze(["crisis", "problem", "success"]);

/** How each scope's due time is reached from the one it was taken up on. */
const SCOPE_ENDS = Object.freeze({ phase: nextPhase, week: nextDay, season: nextSeason });

/**
 * @param {string} risk One of TASK_RISKS.
 * @returns {boolean} Whether it's settled by a Save, which names the Virtue saved in.
 */
export const isSaveRisk = (risk) => VIRTUES.includes(risk);

/**
 * @typedef {object} CouncilTask
 * @property {string} seat     The Council seat given the task, one of COUNCIL_SEATS.
 * @property {string} what     What they're to do, written as the GM likes.
 * @property {string} scope    One of TASK_SCOPES: how long the work takes.
 * @property {string} risk     One of TASK_RISKS: what settles it.
 * @property {import("./time.js").Calendar} started When it was taken up.
 * @property {number} at       When it was written down, to keep the list in that order.
 */

/**
 * @param {unknown} raw As stored.
 * @returns {CouncilTask|null} Null for anything that isn't a task of a Council seat.
 */
export function normalizeTask(raw) {
	if (!raw || typeof raw !== "object" || !COUNCIL_SEATS.includes(raw.seat)) return null;
	return {
		seat: raw.seat,
		what: trimmedText(raw.what),
		scope: TASK_SCOPES.includes(raw.scope) ? raw.scope : TASK_SCOPES[0],
		risk: TASK_RISKS.includes(raw.risk) ? raw.risk : "none",
		started: normalizeCalendar(raw.started),
		at: Number.isFinite(raw.at) ? raw.at : 0
	};
}

/**
 * Every task from whatever is stored, however old or bad.
 * @param {unknown} raw
 * @returns {Record<string, CouncilTask>} By id.
 */
export function normalizeTasks(raw) {
	if (!raw || typeof raw !== "object") return {};
	const tasks = {};
	for (const [id, value] of Object.entries(raw)) {
		const task = normalizeTask(value);
		if (task) tasks[id] = task;
	}
	return tasks;
}

/**
 * The tasks as a list: by seat in the order the book gives them, and within a
 * seat in the order they were set, so a row doesn't move as it's settled.
 * @param {unknown} tasks As stored.
 * @returns {(CouncilTask & {id: string})[]}
 */
export function councilTasks(tasks) {
	return Object.entries(normalizeTasks(tasks))
		.map(([id, task]) => ({ id, ...task }))
		.sort((a, b) => COUNCIL_SEATS.indexOf(a.seat) - COUNCIL_SEATS.indexOf(b.seat) || a.at - b.at || a.id.localeCompare(b.id));
}

/**
 * @param {unknown} tasks As stored.
 * @returns {number} How many tasks the Council has in hand.
 */
export const taskCount = (tasks) => Object.keys(normalizeTasks(tasks)).length;

/**
 * A task ready to store.
 * @param {string} seat One of COUNCIL_SEATS.
 * @param {object} details
 * @param {string} [details.what]
 * @param {string} [details.scope]
 * @param {string} [details.risk]
 * @param {import("./time.js").Calendar} [details.started] Now, when the work begins.
 * @param {number} [details.at] Usually Date.now().
 * @returns {CouncilTask|null} Null for a seat that isn't the Council's.
 */
export function newTask(seat, { what = "", scope = TASK_SCOPES[0], risk = "none", started = null, at = 0 } = {}) {
	return normalizeTask({ seat, what, scope, risk, started, at });
}

/**
 * When a task's work is done and it can be settled: the Phase, Day or Season
 * after the one it was taken up on.
 * @param {CouncilTask} task
 * @returns {import("./time.js").Calendar}
 */
export function taskDueAt(task) {
	const started = normalizeCalendar(task?.started);
	return (SCOPE_ENDS[task?.scope] ?? SCOPE_ENDS.phase)(started);
}

/**
 * @param {CouncilTask} task
 * @param {import("./time.js").Calendar} now
 * @returns {boolean} Whether its time has come. A calendar set back by hand
 *   leaves the work unfinished again, which is what setting it back says.
 */
export const isTaskDue = (task, now) => compareCalendars(now, taskDueAt(task)) >= 0;

/**
 * @param {unknown} tasks As stored.
 * @param {import("./time.js").Calendar} now
 * @returns {(CouncilTask & {id: string})[]} Those waiting to be settled.
 */
export const tasksDue = (tasks, now) => councilTasks(tasks).filter((task) => isTaskDue(task, now));

/**
 * What comes of a task, once whatever settles it has been rolled.
 * @param {string} risk One of TASK_RISKS.
 * @param {object} [rolled]
 * @param {number|null} [rolled.d6]      The Luck Roll.
 * @param {boolean|null} [rolled.passed] Whether the Save passed.
 * @returns {string} One of TASK_OUTCOMES. An action with no risk needs no roll,
 *   so it's simply done.
 */
export function taskOutcome(risk, { d6 = null, passed = null } = {}) {
	if (isSaveRisk(risk)) return passed ? "success" : "crisis";
	if (risk === "luck") return LUCK_OUTCOMES[d6Band(d6)];
	return "success";
}

/**
 * @param {string} outcome One of TASK_OUTCOMES.
 * @returns {boolean} Whether the Domain takes a Crisis from it.
 */
export const bringsCrisis = (outcome) => outcome === "crisis";
