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
