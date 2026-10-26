import { SYSTEM_ID } from "./system-id.js";

/**
 * Ask the active GM's client to do what this user can't, giving up after ten
 * seconds. Whoever asks checks first that there is a GM, and says so if not.
 * @param {string} name The query, as registered in CONFIG.queries.
 * @param {object} data
 * @param {string} failure What the console says if asking fails.
 * @returns {Promise<unknown>} The GM's answer, or false when there was none.
 */
export async function askActiveGM(name, data, failure) {
	try {
		return (await globalThis.game?.users?.activeGM?.query(name, data, { timeout: 10000 })) ?? false;
	} catch (error) {
		console.warn(`${SYSTEM_ID} | ${failure}`, error);
		return false;
	}
}
