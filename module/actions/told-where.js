import { t } from "../chat/cards.js";
import { placeFrom } from "../rules/exploration.js";
import { directionNames } from "../rules/realm-geometry.js";

/**
 * Where something lies from the hex a teller stands in, in the words the
 * Realm's people use (p19). Kept apart from exploration.js, which much else
 * reaches, so anything telling of a place can use it.
 */

/**
 * @param {object} g The Realm's geometry, which says what each way out of a hex is called.
 * @param {number|null} direction An index into directionNames.
 */
export const directionName = (g, direction) => (direction === null ? null : t(`realm.directions.${directionNames(g)[direction]}`));

/**
 * How far off something lies, as a teller would put it.
 * @param {object} g
 * @param {{distance: number, direction: number|null, here: boolean}} known
 * @returns {string}
 */
export function whereItLies(g, { distance, direction, here }) {
	if (here) return t("explore.here");
	const where = directionName(g, direction);
	return t(distance === 1 ? "explore.awayOne" : "explore.away", { distance, direction: where });
}

/**
 * Where one hex lies from another, as somebody standing in the first would say it.
 * @param {object} g
 * @param {{col: number, row: number}} from
 * @param {{col: number, row: number}} to
 * @returns {string}
 */
export const toldWhere = (g, from, to) => whereItLies(g, placeFrom(g, from, to));
