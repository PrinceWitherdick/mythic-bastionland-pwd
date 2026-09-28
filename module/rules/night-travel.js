/**
 * Travelling at night (Night, p18). A Company lacking a guide and light is
 * travelling blind, which is rolled each time it tries to move to a new Hex.
 * What the Night costs in SPI is taken as the Night ends (rules/phase-end.js),
 * which is why a Company seen on the move by night is remembered. Pure, so it
 * can be tested without Foundry.
 */
import { samePhase } from "./time.js";

/**
 * @typedef {object} NightTravel The Company's Night on the move.
 * @property {import("./time.js").Calendar} when The Night it moved in.
 * @property {boolean|null} blind Whether it lacks a guide and light, or null until the Referee says.
 */

/**
 * Whether the Company moved to a new Hex in this Night.
 * @param {NightTravel|null} said As stored.
 * @param {import("./time.js").Calendar} now
 * @returns {boolean}
 */
export const movedThisNight = (said, now) => now?.phase === "night" && samePhase(said?.when, now);

/**
 * What a move of the Company to a new Hex calls for.
 * @param {NightTravel|null} said As stored.
 * @param {import("./time.js").Calendar} now
 * @returns {"day"|"ask"|"blind"|"sighted"} Nothing by day; the question until the
 *   Referee has answered it this Night; after that, a blind roll or nothing more.
 */
export function nightMove(said, now) {
	if (now?.phase !== "night") return "day";
	if (!movedThisNight(said, now) || typeof said.blind !== "boolean") return "ask";
	return said.blind ? "blind" : "sighted";
}

/**
 * What a move of the Company to a new Hex calls for while fog hides the way by
 * day (p197). The Referee is asked once a Phase whether the Company can keep
 * its course; without a way to, it travels blind as by night.
 * @param {NightTravel|null} said As stored for fog, with the Phase it was said in.
 * @param {import("./time.js").Calendar} now
 * @param {boolean} fogged Whether fog hides the way now (rules/sky-weather.js).
 * @returns {"clear"|"ask"|"blind"|"course"} Nothing without fog, or by night,
 *   which asks for itself; the question until it's answered this Phase; after
 *   that, a blind roll or nothing more.
 */
export function fogMove(said, now, fogged) {
	if (!fogged || now?.phase === "night") return "clear";
	if (!samePhase(said?.when, now) || typeof said.blind !== "boolean") return "ask";
	return said.blind ? "blind" : "course";
}
