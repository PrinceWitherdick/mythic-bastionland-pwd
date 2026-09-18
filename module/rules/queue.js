/**
 * Writes taken one at a time. Pure, so it can be tested without Foundry.
 */

/**
 * A queue that runs each write once the one before it has finished. Otherwise
 * edits made in quick succession — ticking a box straight after typing a name,
 * a roll landing while a note is still being saved — each start from the
 * document as it was before the other, and rub each other out.
 *
 * A write that throws doesn't stop the ones behind it; its own caller still
 * sees the rejection.
 *
 * The queue carries a `settled()`, for waiting on everything put in so far
 * without adding anything: what a window does on its way out.
 *
 * @returns {(<T>(write: () => Promise<T>) => Promise<T>) & {settled: () => Promise<void>}}
 */
export function serialWrites() {
	let pending = Promise.resolve();
	const queue = (write) => {
		const run = pending.then(write);
		pending = run.catch(() => {});
		return run;
	};
	/** @returns {Promise<void>} Once everything queued so far has finished, whether it worked or not. */
	queue.settled = () => pending;
	return queue;
}
