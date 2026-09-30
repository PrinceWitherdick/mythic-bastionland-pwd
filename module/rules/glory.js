/**
 * Glory and Rank (Beginnings & Glory, p6). A Knight's Rank follows from their
 * Glory, so Rank is always derived and never stored.
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
 * Glory By Other Means (p6), besides a new Age: a Myth resolved, for every
 * Knight who played a part; a tournament won before significant spectators;
 * and a battle big enough for the chronicles, for every Knight on the winning
 * side. Duels and jousts stake Glory between two Knights.
 */
export const GLORY_AWARDS = Object.freeze(["myth", "tournament", "battle"]);

/**
 * The awards given from a Glory button of their own. A Myth's Glory is given
 * from its row in the GM Toolkit instead, as it is marked resolved.
 */
export const GLORY_BUTTONS = Object.freeze(GLORY_AWARDS.filter((key) => key !== "myth"));

/**
 * Add or take away Glory, which never falls below 0.
 * @param {number} glory
 * @param {number} amount Such as 1 for a Myth resolved, or -1 for a duel lost.
 * @returns {{from: number, to: number, rank: string|null}} `rank` is the key of a Rank newly reached or fallen to, else null.
 */
export function changeGlory(glory, amount) {
	const from = Math.max(0, Math.trunc(Number(glory)) || 0);
	const to = Math.max(0, from + (Math.trunc(Number(amount)) || 0));
	const rank = rankForGlory(to);
	return { from, to, rank: rank === rankForGlory(from) ? null : rank };
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
