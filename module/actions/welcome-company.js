/**
 * The Welcome's Knight Those Subjects: blank Knights for the Company, one
 * given to each player signed in, whose sheet opens on their screen for them
 * to choose. See module/rules/welcome-company.js.
 */

import { pairKnights, playersAwaitingKnights, unchosenNames } from "../rules/welcome-company.js";
import { giveKnightTo, knightPlayer } from "./new-knight.js";

/** @returns {User[]} The players signed in now who hold no Knight yet, in the world's order. */
export function waitingPlayers() {
	const holding = new Set();
	for (const actor of game.actors) {
		if (actor.type !== "knight" || actor.system.isSquire) continue;
		const player = knightPlayer(actor);
		if (player) holding.add(player);
	}
	return playersAwaitingKnights(game.users.contents, holding);
}

/**
 * Make that many Knights still to be chosen, and give one to each player
 * waiting. The rest wait in the Actors tab for the GM to give them.
 * @param {number} count
 * @returns {Promise<{made: Actor[], given: User[]}>}
 */
export async function knightTheCompany(count) {
	if (!game.user.isGM || count < 1) return { made: [], given: [] };
	const players = waitingPlayers();
	const standIn = game.i18n.localize(CONFIG.Actor.typeLabels.knight);
	const names = unchosenNames(count, players, standIn, game.actors.map((actor) => actor.name));
	// Made blank, so the unchosen-Knight hooks mark them and the filing hooks give each a folder.
	const made = await Actor.implementation.createDocuments(names.map((name) => ({ name, type: "knight" })));
	// Each goes to a player of their own, so they're given all at once.
	const pairs = pairKnights(made, players).filter(({ userId }) => userId);
	await Promise.all(pairs.map(({ knight, userId }) => giveKnightTo(knight, userId)));
	return { made, given: pairs.map(({ userId }) => game.users.get(userId)) };
}
