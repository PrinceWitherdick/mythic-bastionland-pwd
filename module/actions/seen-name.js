/**
 * Somebody named as the table saw them: by their Token, which the Referee may
 * have given a name kept from the players, such as "Hooded Stranger" for an
 * Actor whose real name would give the game away. As a duel names its opponent.
 */

/**
 * @param {string|null|undefined} uuid An Actor's, a Token's own Actor's among them.
 * @returns {string} Their Token's name, if they have one on the map, else the Actor's; "" when there's nobody by it.
 */
export function seenName(uuid) {
	const actor = uuid ? fromUuidSync(uuid) : null;
	if (!actor) return "";
	const token = actor.token ?? (canvas?.ready ? actor.getActiveTokens(false, true)[0] : null);
	return token?.name || actor.name || "";
}
