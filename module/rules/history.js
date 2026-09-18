/**
 * Undo and Redo for anything the GM edits a whole snapshot at a time — a
 * Realm, a Site — kept as it was before each change, newest last. Pure, so it
 * can be tested without Foundry.
 */

/** How many changes Undo can take back. */
export const HISTORY_LIMIT = 100;

/**
 * @typedef {object} History
 * @property {object[]} undo The snapshot before each change, newest last.
 * @property {object[]} redo The snapshot before each Undo, newest last.
 */

/** @returns {History} */
export const emptyHistory = () => ({ undo: [], redo: [] });

/**
 * Remember the snapshot as it was before a change. A new change can't be redone past.
 * @param {History} history
 * @param {object} before
 * @param {number} [limit]
 * @returns {History}
 */
export function recordChange(history, before, limit = HISTORY_LIMIT) {
	return { undo: [...history.undo, before].slice(-limit), redo: [] };
}

/**
 * Step back or forward: the snapshot to write, and the history once it's written.
 * @param {History} history
 * @param {"undo"|"redo"} way
 * @param {object} current The snapshot as it is now, so the step can be taken back.
 * @param {number} [limit]
 * @returns {{target: object, history: History}|null} Null when there is nothing that way.
 */
export function stepHistory(history, way, current, limit = HISTORY_LIMIT) {
	const from = way === "undo" ? history.undo : history.redo;
	const to = way === "undo" ? history.redo : history.undo;
	if (!from.length) return null;
	const target = from.at(-1);
	const rest = from.slice(0, -1);
	const pushed = [...to, current].slice(-limit);
	return { target, history: way === "undo" ? { undo: rest, redo: pushed } : { undo: pushed, redo: rest } };
}
