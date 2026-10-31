import { askActiveGM } from "./ask-gm.js";
import { warn } from "./chat/cards.js";

/**
 * Ask the active GM's client to do what this user can't, telling this user
 * when nobody could be asked, or the GM didn't do it. Kept apart from
 * ask-gm.js so a test that stands in for `askActiveGM` stands in for it here too.
 * @param {string} name The query, as registered in CONFIG.queries.
 * @param {object} data
 * @param {string} failure What the console says if asking fails.
 * @param {{absent: string, refused?: string, data?: object}} notice The warnings,
 *   as keys below `bastionland.`: `absent` with no GM, `refused` (`absent` if
 *   not given) when the GM didn't do it, both filled in from `data`.
 * @returns {Promise<unknown>} The GM's answer, or false when there was none.
 */
export async function askActiveGMOrWarn(name, data, failure, { absent, refused = absent, data: said }) {
	if (!globalThis.game?.users?.activeGM) {
		warn(absent, said);
		return false;
	}
	const answer = await askActiveGM(name, data, failure);
	if (!answer) warn(refused, said);
	return answer;
}
