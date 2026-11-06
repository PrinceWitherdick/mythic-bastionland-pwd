import { SYSTEM_ID } from "./system-id.js";

/**
 * Ask the active GM's client to do what this user can't, giving up after ten
 * seconds. With no GM there's nobody to ask, and the answer is false; to tell
 * the user so, ask through ask-gm-warn.js's askActiveGMOrWarn.
 * @param {string} name The query, as registered in CONFIG.queries.
 * @param {object} data
 * @param {string} failure What the console says if asking fails.
 * @returns {Promise<unknown>} The GM's answer, or false when there was none.
 */
export const askActiveGM = (name, data, failure) => askUser(globalThis.game?.users?.activeGM, name, data, failure);

/**
 * Ask a user's client a query, giving up after the timeout.
 * @param {User|null|undefined} user Who to ask; with nobody, the answer is the fallback.
 * @param {string} name The query, as registered in CONFIG.queries.
 * @param {object} data
 * @param {string} failure What the console says if asking fails.
 * @param {object} [options]
 * @param {number} [options.timeout] How long to wait, in milliseconds.
 * @param {unknown} [options.fallback] The answer when there was none.
 * @returns {Promise<unknown>} Their answer, or the fallback.
 */
export async function askUser(user, name, data, failure, { timeout = 10000, fallback = false } = {}) {
	try {
		return (await user?.query(name, data, { timeout })) ?? fallback;
	} catch (error) {
		console.warn(`${SYSTEM_ID} | ${failure}`, error);
		return fallback;
	}
}
