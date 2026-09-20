/**
 * The harm a Knight's Seer has taken, kept on the Knight's sheet since a Seer
 * has no Actor of their own. The scores the book gives them are their
 * maximums, and a score left blank is still at the book's. Pure, so it can be
 * tested without Foundry.
 */
import { SCORES } from "./virtues.js";

/** A Seer whole again: every score back at the book's, and no Mortal Wound. */
export const SEER_UNHARMED = Object.freeze({ vig: null, cla: null, spi: null, guard: null, mortalWound: false });

/**
 * @param {import("./stat-blocks.js").Stats|null} stats The book's, from seerStats.
 * @param {object} [state] The Knight's `seerState`.
 * @returns {Record<string, number|null>} Each score as it stands now, or null where the book gives none.
 */
export function seerCurrent(stats, state = {}) {
	return Object.fromEntries(SCORES.map((key) => {
		if (!Number.isInteger(stats?.[key])) return [key, null];
		const value = state?.[key];
		return [key, Number.isInteger(value) ? value : stats[key]];
	}));
}

/**
 * Whether an update names someone else as the Knight's Seer, so the harm on
 * the sheet belonged to the Seer before.
 * @param {object} changes An Actor update, expanded.
 * @param {string} seer Who knighted them until now.
 * @returns {boolean}
 */
export function namesNewSeer(changes, seer) {
	const named = changes?.system?.seer;
	return typeof named === "string" && named.trim() !== String(seer ?? "").trim();
}
