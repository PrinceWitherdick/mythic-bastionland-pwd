import { hexKey, sameHex } from "../rules/realm-geometry.js";
import { getCalendar } from "./calendar.js";
import { heldBack } from "./journey.js";
import { weatherIn } from "./referee-rolls.js";
import { secretsKeptOn } from "./solo.js";

/**
 * Dire weather keeps the Company in the hex it set off from (p18), so a move
 * made in it may never have reached the hexes it came into on the map. Asked
 * the moment a move is heard of, before anything about it is written, so each
 * rule that follows the Company holds back alike.
 */

/**
 * @param {{entered?: object[], ended?: boolean, from?: object|null}} move
 * @param {import("../rules/time.js").Calendar} [now]
 * @returns {boolean} Whether dire weather keeps the Company in the hex it set off from (p18).
 */
export function keptBackByWeather({ entered = [], ended = false, from = null }, now = getCalendar()) {
	const here = entered.at(-1) ?? null;
	return Boolean(ended && here && from && !sameHex(from, here) && weatherIn(now) === "dire");
}

/**
 * The hexes of a move the Company came into that it may never have reached:
 * played alone, those of a chosen move dire weather may hold back, till the
 * Referee says; and those a move it didn't choose, such as a blind drift on
 * the move held back, puts it in among the hexes already held back from.
 * @param {Scene} scene
 * @param {{entered?: object[], ended?: boolean, from?: object|null, chosen?: boolean}} move
 * @returns {Set<string>} Their hex keys.
 */
function heldHexes(scene, move) {
	if (move.chosen === false) return heldBack(scene).keys;
	return new Set(secretsKeptOn(scene) && keptBackByWeather(move) ? (move.entered ?? []).map(hexKey) : []);
}

/**
 * @param {Scene} scene
 * @param {{entered?: object[], ended?: boolean, from?: object|null, chosen?: boolean}} move
 * @returns {{col: number, row: number}[]} The hexes the move came into that the Company surely reached, so
 *   what's there is found, met or rolled.
 */
export function hexesReached(scene, move) {
	const held = heldHexes(scene, move);
	return (move.entered ?? []).filter((hex) => !held.has(hexKey(hex)));
}
