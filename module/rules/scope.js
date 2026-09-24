/**
 * Scope (p6): how long the group expects the game to run for, both in and out
 * of game. An Adventure is one session, a Saga an indeterminate number, and a
 * Chronicle "a known number of sessions" whose "Season and Age turns are
 * planned out ahead of time". Only a Chronicle has a plan to keep, so only a
 * Chronicle counts its sessions. Pure, so it can be tested without Foundry.
 */
import { SEASONS } from "./time.js";

/** The three the book gives, in its order. */
export const SCOPES = Object.freeze(["adventure", "chronicle", "saga"]);

/** The Scope that counts sessions and plans the turns ahead. */
export const PLANNED_SCOPE = "chronicle";

/** Before a group has settled on one. */
export const NO_SCOPE = "";

/**
 * A game with no Scope chosen yet, holding the book's own example of a
 * Chronicle ready for one: six sessions, a turn at the end of each.
 */
export const DEFAULT_SCOPE = Object.freeze({ scope: NO_SCOPE, sessions: 6, session: 1, turnEvery: 1 });

/** The counts of a Chronicle's plan the Referee sets by hand, apart from the Scope itself. */
export const PLAN_FIELDS = Object.freeze(["sessions", "session", "turnEvery"]);

/** @returns {number} A whole count of 1 or more, or the fallback. */
function count(value, fallback) {
	const number = Number(value);
	return Number.isInteger(number) && number >= 1 ? number : fallback;
}

/**
 * @typedef {object} Scope
 * @property {string} scope     One of SCOPES, or NO_SCOPE.
 * @property {number} sessions  How many sessions a Chronicle is planned to run for.
 * @property {number} session   Which session is being played, counted from 1.
 * @property {number} turnEvery How many sessions between planned turns.
 */

/**
 * A Scope with anything missing or unreadable set back to where a game begins.
 * @param {object|null|undefined} raw As stored.
 * @returns {Scope}
 */
export function normalizeScope(raw) {
	return {
		scope: SCOPES.includes(raw?.scope) ? raw.scope : DEFAULT_SCOPE.scope,
		sessions: count(raw?.sessions, DEFAULT_SCOPE.sessions),
		session: count(raw?.session, DEFAULT_SCOPE.session),
		turnEvery: count(raw?.turnEvery, DEFAULT_SCOPE.turnEvery)
	};
}

/**
 * Whether a turn falls at the end of the session being played. The book's own
 * example plans one at the end of each session; a longer Chronicle can space
 * them further apart.
 * @param {object} plan
 * @returns {boolean}
 */
export function turnDue(plan) {
	const { session, turnEvery } = normalizeScope(plan);
	return session % turnEvery === 0;
}

/**
 * Which turn a session's end calls for. A new Age begins in Spring (p17), so
 * the Age turns when Winter ends and the Season turns otherwise: the book's "a
 * Season turn at the end of each session, and an Age turn at the end of each
 * Winter".
 * @param {string} season The Season the game stands in.
 * @returns {"season"|"age"}
 */
export const plannedTurn = (season) => (season === SEASONS[SEASONS.length - 1] ? "age" : "season");

/**
 * @param {object} plan
 * @returns {number} Sessions left after the one being played. None once the
 *   Chronicle has run as long as it was planned to.
 */
export function sessionsLeft(plan) {
	const { sessions, session } = normalizeScope(plan);
	return Math.max(0, sessions - session);
}

/**
 * @param {object} plan
 * @returns {boolean} Whether the Chronicle has already run past the sessions planned for it.
 */
export function sessionsSpent(plan) {
	const { sessions, session } = normalizeScope(plan);
	return session > sessions;
}

/**
 * The plan with the session just played counted, so the next one begins.
 * Nothing stops a Chronicle running past its plan; the group can plan further
 * ahead instead.
 * @param {object} plan
 * @returns {Scope}
 */
export function endedSession(plan) {
	const ended = normalizeScope(plan);
	return { ...ended, session: ended.session + 1 };
}
