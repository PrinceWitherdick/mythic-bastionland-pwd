import { serverNow } from "./server-now.js";
import { SYSTEM_ID } from "./system-id.js";

/** Where a dated query's data says when the asker stops waiting, by the server's clock. */
const ANSWER_BY = "answerBy";

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
 * @param {boolean} [options.dated] Whether the data says when the asker stops waiting, for a window
 *   the answer waits on to close by (see answerBy).
 * @returns {Promise<unknown>} Their answer, or the fallback.
 */
export async function askUser(user, name, data, failure, { timeout = 10000, fallback = false, dated = false } = {}) {
	try {
		const sent = dated ? { ...data, [ANSWER_BY]: serverNow() + timeout } : data;
		return (await user?.query(name, sent, { timeout })) ?? fallback;
	} catch (error) {
		console.warn(`${SYSTEM_ID} | ${failure}`, error);
		return fallback;
	}
}

/**
 * @param {object} data A query's, asked with `dated`.
 * @returns {number|null} When its asker stops waiting, by the server's clock, or null when it doesn't say.
 */
export const answerBy = (data) => (Number.isFinite(data?.[ANSWER_BY]) ? data[ANSWER_BY] : null);
