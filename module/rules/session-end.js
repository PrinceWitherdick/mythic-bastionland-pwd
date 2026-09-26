/**
 * Ending a Session (Refereeing p16). The book's procedure is three steps:
 * discuss whether a Season or Age should pass before the next session, carry
 * out the turn if one does, and ask the players what they plan next. Advancing
 * Time (p17) gives the four answers to the first — None, Weeks, Months, Years —
 * and a Passage of Time roll for a group that can't decide. Pure, so it can be
 * tested without Foundry; module/apps/SessionEnd.js puts the window to it.
 */
import { SEASONS } from "./time.js";

/**
 * How much time can pass, in the book's order, each with the turn it makes:
 * Weeks carries the group to the next seasonal event, Months turns the Season,
 * and Years begin a new Age in Spring.
 */
export const TIME_STEPS = Object.freeze([
	Object.freeze({ key: "none", turn: null }),
	Object.freeze({ key: "weeks", turn: "weeks" }),
	Object.freeze({ key: "months", turn: "season" }),
	Object.freeze({ key: "years", turn: "age" })
]);

/** Just the keys, for a caller checking one. */
export const TIME_STEP_KEYS = Object.freeze(TIME_STEPS.map(({ key }) => key));

/**
 * @param {string} key
 * @returns {(typeof TIME_STEPS)[number]|null}
 */
export const timeStep = (key) => TIME_STEPS.find((step) => step.key === key) ?? null;

/**
 * Whether a step moves the game on to the next Season or Age, which is when a
 * situation left unresolved changes (p17). The Weeks step only carries the
 * group to the Season's next event, so nothing is left behind by it.
 * @param {string} key
 * @returns {boolean}
 */
export const turnsSeasonOrAge = (key) => ["season", "age"].includes(timeStep(key)?.turn);

/**
 * @param {"season"|"age"} turn
 * @returns {string} The step that makes that turn: Years for an Age, Months for a Season.
 */
const stepFor = (turn) => (turn === "age" ? "years" : "months");

/**
 * Which turn the calendar calls for at a session's end. A new Age begins in
 * Spring (p17), so the Age turns when Winter ends and the Season turns otherwise.
 * @param {string} season The Season the game stands in.
 * @returns {"season"|"age"}
 */
export const calendarTurn = (season) => (season === SEASONS[SEASONS.length - 1] ? "age" : "season");

/**
 * Which step a Passage of Time roll (p17) points at. The table says only
 * "Season or Age", so which of the two it means is the one the calendar calls
 * for: an Age turn ends Winter, a Season turn every other Season.
 * @param {string} result One of the passage table's results (rules/referee-rolls.js).
 * @param {"season"|"age"} planned Which turn the calendar calls for, from calendarTurn.
 * @returns {{step: string, promised: "season"|"age"|null}} The step it chooses, and a
 *   turn it puts at the end of the *next* session instead, to be remembered until then.
 */
export function passageStep(result, planned) {
	const turn = planned === "age" ? "age" : "season";
	if (result === "now") return { step: stepFor(turn), promised: null };
	if (result === "afterNextSession") return { step: "none", promised: turn };
	return { step: "none", promised: null };
}

/**
 * @typedef {object} SessionEndMemory What a session's end leaves for the next one.
 * @property {"season"|"age"|null} promised A turn a Passage of Time roll put at the end of
 *   the next session, which the window then offers as the step to take.
 */

/**
 * @param {unknown} raw As stored.
 * @returns {SessionEndMemory}
 */
export function normalizeSessionEnd(raw) {
	const promised = raw?.promised;
	return { promised: promised === "season" || promised === "age" ? promised : null };
}

/**
 * Which step the window offers before the Referee has chosen one: the turn a
 * roll promised last session, else nothing, since the book has the group discuss it.
 * @param {object} options
 * @param {"season"|"age"|null} [options.promised] From the last session's Passage of Time roll.
 * @returns {{step: string|null, reason: "promised"|null}}
 */
export function offeredStep({ promised = null } = {}) {
	if (promised) return { step: stepFor(promised), reason: "promised" };
	return { step: null, reason: null };
}

/**
 * A recap written into the Season's notes under a heading of its own, after
 * whatever was written there before. The notes are a plain textarea on the
 * Toolkit's Time page, so this is plain text with blank lines between
 * sessions.
 * @param {unknown} notes What the Season's notes hold now.
 * @param {string} heading Names the session, such as "Session 3 — Morning, 1st of Spring".
 * @param {unknown} recap What the Referee wrote about it.
 * @returns {string} The notes to store. Unchanged when there's nothing to add.
 */
export function appendRecap(notes, heading, recap) {
	const before = String(notes ?? "").replace(/\s+$/, "");
	const written = String(recap ?? "").trim();
	if (!written) return String(notes ?? "");
	const entry = `${heading}\n${written}`;
	return before ? `${before}\n\n${entry}` : entry;
}

/**
 * What a session leaves in the Season's notes: the Referee's recap, then the
 * players' plans for next session (p16) on a line of their own, so they're
 * still there when the Referee prepares.
 * @param {unknown} recap What the Referee wrote about the session.
 * @param {unknown} plans What the players plan next.
 * @param {string} label Heads the plans' line, such as "Next session".
 * @returns {string} Empty when neither was written.
 */
export function sessionRecap(recap, plans, label) {
	const written = String(recap ?? "").trim();
	const next = String(plans ?? "").trim();
	return [written, next ? `${label}: ${next}` : ""].filter(Boolean).join("\n");
}
