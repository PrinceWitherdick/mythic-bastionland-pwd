import { queryAsker } from "./compat.js";

/**
 * Who sent a query, when this client is the GM who answers it. Kept apart from
 * compat.js so a test that stands in for `queryAsker` stands in for it here too.
 * @param {object} context The query's context, as Foundry passes it.
 * @returns {User|null} Null when the asker is unknown, or this client isn't a GM.
 */
export function gmAsker(context) {
	const asker = queryAsker(context);
	return asker && globalThis.game?.user?.isGM ? asker : null;
}
