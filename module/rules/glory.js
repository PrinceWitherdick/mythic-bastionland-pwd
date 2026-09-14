/**
 * Glory and Rank (Beginnings & Glory, p6). A Knight's Glory dictates their
 * Rank, so Rank is always derived and never stored.
 */

/** Ranks in ascending order with the Glory needed to hold each. */
export const RANKS = Object.freeze([
	Object.freeze({ key: "errant", glory: 0 }),
	Object.freeze({ key: "gallant", glory: 3 }),
	Object.freeze({ key: "tenant", glory: 6 }),
	Object.freeze({ key: "dominant", glory: 9 }),
	Object.freeze({ key: "radiant", glory: 12 })
]);

/**
 * @param {number} glory
 * @returns {string} The key of the highest Rank this much Glory reaches.
 */
export function rankForGlory(glory) {
	const value = Number(glory) || 0;
	let reached = RANKS[0];
	for (const rank of RANKS) {
		if (value >= rank.glory) reached = rank;
	}
	return reached.key;
}

/**
 * How far a Knight is from their next Rank.
 * @param {number} glory
 * @returns {{key: string, needed: number}|null} Null once Knight-Radiant.
 */
export function nextRank(glory) {
	const value = Number(glory) || 0;
	const next = RANKS.find((rank) => rank.glory > value);
	return next ? { key: next.key, needed: next.glory - value } : null;
}
