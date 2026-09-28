/**
 * The Welcome's Company: how many Knights have followed the call to glory,
 * and which player each one made there is given to. The Knights are made
 * blank, for their players to choose; see module/rules/unchosen-knight.js.
 */

/** The fewest and most Knights the Welcome makes at once. */
export const COMPANY_MIN = 1;
export const COMPANY_MAX = 12;

/**
 * @param {number} count
 * @returns {number} The count held within what the Welcome makes.
 */
export function clampCompany(count) {
	const whole = Math.round(Number(count));
	if (!Number.isFinite(whole)) return COMPANY_MIN;
	return Math.min(COMPANY_MAX, Math.max(COMPANY_MIN, whole));
}

/**
 * The players signed in who are still waiting for a Knight: not GMs, and
 * holding none already.
 * @param {{id: string, isGM: boolean, active: boolean}[]} users
 * @param {Set<string>} holding The ids of the players who hold a Knight.
 * @returns {{id: string, isGM: boolean, active: boolean}[]} In the world's order.
 */
export function playersAwaitingKnights(users, holding) {
	return users.filter((user) => user.active && !user.isGM && !holding.has(user.id));
}

/**
 * How many Knights the Welcome offers to make, until the GM counts them
 * themself: one for each player waiting, and at least one.
 * @param {number} waiting
 * @returns {number}
 */
export const suggestedCompany = (waiting) => clampCompany(Math.max(COMPANY_MIN, waiting));

/**
 * Names for Knights still to be chosen: each one given to a player is named
 * for them, and the rest take the stand-in Create Actor gives, which the
 * chooser starts with an empty name box. A name already taken is numbered as
 * Foundry numbers them.
 * @param {number} count
 * @param {{name: string}[]} players The players the first Knights go to, in order.
 * @param {string} standIn  "Knight", in the world's language.
 * @param {Iterable<string>} taken The names already in the world.
 * @returns {string[]}
 */
export function unchosenNames(count, players, standIn, taken) {
	const used = new Set(taken);
	const names = [];
	for (let index = 0; index < count; index++) {
		const base = players[index]?.name?.trim() || standIn;
		let name = base;
		for (let n = 2; used.has(name); n++) name = `${base} (${n})`;
		used.add(name);
		names.push(name);
	}
	return names;
}

/**
 * Pair the Knights with the players waiting, one each, in order. Knights
 * beyond the players go to nobody yet.
 * @template T
 * @param {T[]} knights
 * @param {{id: string}[]} players
 * @returns {{knight: T, userId: string}[]}
 */
export function pairKnights(knights, players) {
	return knights.map((knight, index) => ({ knight, userId: players[index]?.id ?? "" }));
}
