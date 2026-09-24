/**
 * Where the Company stands on a Realm. The Seers who knighted the players
 * deemed that they travel as a Company (p7) — "While some of you may rest,
 * roam, or die, your collective journey will be as one" — so one Token on the
 * map stands for all of them, and where it begins follows the Start the
 * players chose for the Company (p6). Pure, so it can be tested without
 * Foundry.
 */
import { STARTS } from "./creation.js";

/** The Starts, in the book's order. Where the Company begins follows from which one they took. */
export const COMPANY_STARTS = Object.freeze(STARTS.map((start) => start.key));

/**
 * Where the Company begins, by the Start the players chose (p6).
 *
 * The book only names a place for one Start: a **Courtier** has "a place in
 * Court at the Seat of Power". A **Wanderer** "arrives in the Realm" and a
 * **Ruler**'s Knight "rules a Holding", but neither says where, so the
 * Referee chooses and nothing is rolled for them. Nor is anything rolled for
 * a Courtier in a Realm with no Seat.
 *
 * @param {object} realm
 * @param {string} start One of COMPANY_STARTS.
 * @returns {{col: number, row: number}|null} The Seat's hex, or null when the Referee chooses.
 */
export function companyStart(realm, start) {
	if (start !== "courtier") return null;
	return realm?.holdings?.find((holding) => holding.seat)?.hex ?? null;
}

/**
 * Where the button that hands the Referee the Company sits: centred over the
 * Realm's map, above its top edge. A map panned up under the scene navigation
 * pushes the button down to `ceiling`, below the navigation's own buttons, but
 * never past the map itself: wherever the map is, the button is on it or just
 * over it, and never left floating below.
 * @param {{left: number, right: number, top: number, bottom: number}} map The map on screen, in CSS pixels.
 * @param {object} options
 * @param {number} options.width The button's own width, before the interface scale.
 * @param {number} options.height The button's own height, before the interface scale.
 * @param {number} [options.ceiling] The foot of whatever the button must stay clear of at the top of the screen, in CSS pixels.
 * @param {number} [options.gap] Between the button and the map's top, and between the ceiling and the button.
 * @param {number} [options.scale] The interface scale, which the button grows with.
 * @returns {{left: number, top: number}}
 */
export function companyButtonPlacement(map, { width, height, ceiling = 0, gap = 12, scale = 1 }) {
	const [wide, tall, space] = [width, height, gap].map((length) => length * scale);
	const above = map.top - space - tall;
	const clear = Math.max(above, ceiling + space);
	return {
		left: Math.round(((map.left + map.right) / 2) - (wide / 2)),
		// The foot of the map is the lowest it may fall, so it's never adrift below the Realm.
		top: Math.round(Math.min(clear, Math.max(above, map.bottom - space - tall)))
	};
}
