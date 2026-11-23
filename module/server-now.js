/**
 * Two clocks every client shares.
 *
 * Foundry's server time counts milliseconds from the moment the server
 * started, so it is exact between the clients playing now but starts again
 * from nought each time the server does. It suits what lives only while they
 * play: how long to wait for an answer, which of two notes came first.
 *
 * What is kept for later sessions (when a card was posted, when the map grew)
 * needs the time of day instead, so it is told apart across a restart. Each
 * client's own clock may run apart from the others', so it is set by the
 * server's once, when the world loads; a stamp that can wait for that does.
 */

/** @returns {number} Now, by the server's clock since it started: exact between clients, but begun again on a restart. */
export const serverNow = () => globalThis.game?.time?.serverTime ?? Date.now();

/** How far the server's time of day runs ahead of this computer's, in milliseconds. */
let skew = 0;

/** The asking of the server's clock last begun, settled once it has answered or given up. */
let learning = Promise.resolve(0);

/** @returns {number} The time of day, by the server's clock as near as it could be read: for times kept across sessions. */
export const wallNow = () => Date.now() + skew;

/**
 * The time of day once the server's clock has been asked, for a stamp that can
 * wait for it: one made as the world loads would otherwise be by this computer's own clock.
 * @returns {Promise<number>}
 */
export async function learntWallNow() {
	await learning;
	return wallNow();
}

/**
 * Stamps kept by 1.0.2 and earlier counted how long the server had been up, not
 * the time of day, so they read as 1969. Any stamp before 2001 is one of those.
 */
const DATED_SINCE = Date.UTC(2001, 0, 1);

/**
 * @param {unknown} when
 * @returns {boolean} Whether a stamp kept is a time of day, which can be shown as a date.
 */
export const isTimeOfDay = (when) => Number.isFinite(when) && when >= DATED_SINCE;

/**
 * The server answers in whole seconds, so a gap smaller than one can't be told
 * from its rounding: this computer's clock is then taken as right, to the millisecond.
 */
const SECOND = 1000;

/** How long to wait for the server's answer, so a stamp waiting on it isn't held up for long. */
const ANSWER_MS = 5000;

/** How many times the server is asked before this computer's own clock is left to stand. */
const TRIES = 2;

/**
 * Set this computer's clock by the server's, read from the date its reply carries.
 * @param {(url: string, init: object) => Promise<{headers: {get: (name: string) => string|null}}>} [fetcher]
 * @param {string} [url] Any of the server's own pages; its status is small.
 * @returns {Promise<number>} The skew taken.
 */
export function learnServerClock(fetcher = globalThis.fetch, url = globalThis.foundry?.utils?.getRoute?.("api/status") ?? "/api/status") {
	learning = askServerClock(fetcher, url);
	return learning;
}

/**
 * @param {Function} fetcher
 * @param {string} url
 * @returns {Promise<number>} The skew taken, or the one there was if the server never gave its date.
 */
async function askServerClock(fetcher, url) {
	for (let tried = 0; tried < TRIES; tried++) {
		const gap = await serverGap(fetcher, url);
		if (gap === null) continue;
		skew = Math.abs(gap) < SECOND ? 0 : Math.round(gap);
		break;
	}
	return skew;
}

/**
 * @param {Function} fetcher
 * @param {string} url
 * @returns {Promise<number|null>} How far the server's clock ran ahead of this one's, or null with no answer dated.
 */
async function serverGap(fetcher, url) {
	try {
		const sent = Date.now();
		const reply = await inTime(fetcher(url, { cache: "no-store" }));
		const back = Date.now();
		const stamped = Date.parse(reply?.headers?.get("date") ?? "");
		if (!Number.isFinite(stamped)) return null;
		// The server wrote the date sometime in the second it names, between the asking and the answer.
		return stamped + SECOND / 2 - (sent + back) / 2;
	} catch {
		// No answer.
		return null;
	}
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @returns {Promise<T>} The promise, or a refusal should it take longer than ANSWER_MS.
 */
function inTime(promise) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("The server's clock didn't answer in time")), ANSWER_MS);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

/** For tests: forget the skew learnt. */
export function forgetServerClock() {
	skew = 0;
	learning = Promise.resolve(0);
}
