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

/**
 * One serialWrites queue for each key, such as a document's id, so writes to
 * one document wait for each other but not for another's.
 * @returns {(key: string) => ReturnType<typeof serialWrites>}
 */
export function keyedSerialWrites() {
	const queues = new Map();
	return (key) => {
		if (!queues.has(key)) queues.set(key, serialWrites());
		return queues.get(key);
	};
}

/**
 * Work taken on once per key at a time, such as a button a second click would
 * otherwise press twice while the first is still working. A call whose key (or
 * any of its keys) is already under way does nothing but call `whenBusy`.
 * @returns {<T>(keys: string|string[], work: () => Promise<T>, whenBusy?: () => unknown) => Promise<T|undefined>}
 */
export function oncePerKey() {
	const busy = new Set();
	return async (keys, work, whenBusy) => {
		const held = [keys].flat();
		if (held.some((key) => busy.has(key))) return whenBusy?.();
		for (const key of held) busy.add(key);
		try {
			return await work();
		} finally {
			for (const key of held) busy.delete(key);
		}
	};
}
