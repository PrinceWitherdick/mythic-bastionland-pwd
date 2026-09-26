/**
 * A Knight made ahead of the game for a player to pick up (p6): the GM makes
 * them with Create Actor and gives them to a player, who chooses the Knight
 * themself. Until somebody does, the sheet is an empty page with a button for
 * the chooser; see templates/actor/knight-unchosen.hbs.
 */

/** Set on a Knight made blank, and cleared once they're chosen or filled in by hand. */
export const UNCHOSEN_FLAG = "unchosen";

/** The player a GM gave the Knight to, whose sheet opens for them. Cleared once it has. */
export const OFFERED_FLAG = "offeredTo";

/**
 * Whether a Knight is being made blank, as the Create Actor form makes one: a
 * name, a type and a folder, with no system data, items or effects. A Knight
 * that arrives whole, from a compendium, the chooser or as a Squire, brings
 * them along.
 * @param {object} data What the Actor is being created from.
 * @returns {boolean}
 */
export function isBlankKnightData(data) {
	return data?.type === "knight" && !data.system && !data.items?.length && !data.effects?.length;
}

/**
 * The player who holds a Knight: the first one who isn't a GM and owns them.
 * @param {Record<string, number>} ownership The Actor's ownership.
 * @param {{id: string, isGM: boolean}[]} users
 * @param {number} owner The Owner level.
 * @returns {string} Their id, or "" where no player does.
 */
export function playerHolding(ownership, users, owner) {
	return users.find((user) => !user.isGM && ownership?.[user.id] >= owner)?.id ?? "";
}

/**
 * The ownership that gives a Knight to one player in place of whoever held
 * them. The players who did go back to the default; the GMs and the default
 * are left as they were.
 * @param {Record<string, number>} ownership The Actor's ownership.
 * @param {string} userId The player to give them to, or "" for nobody.
 * @param {{id: string, isGM: boolean}[]} users
 * @param {number} owner The Owner level.
 * @returns {Record<string, number>}
 */
export function ownershipGivenTo(ownership, userId, users, owner) {
	const given = { ...ownership };
	for (const user of users) if (!user.isGM && given[user.id] >= owner) delete given[user.id];
	if (userId) given[userId] = owner;
	return given;
}
