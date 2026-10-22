/**
 * Undo and Redo for anything the GM edits a whole snapshot at a time — a
 * Realm, a Site — kept as it was before each change, newest last. Pure, so it
 * can be tested without Foundry.
 */

/** How many changes Undo can take back. */
export const HISTORY_LIMIT = 100;

/**
 * @typedef {object} History
 * @property {object[]} undo The snapshot before each change, newest last, or the change itself as `{before, after}`.
 * @property {object[]} redo The snapshot before each Undo, newest last, or the change taken back.
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
 * Step back or forward over a change kept whole, as `{before, after}`: the
 * change to take back or put back, and the history once it's done. The same
 * change moves from one list to the other, so it can be stepped over again.
 * @param {History} history Whose lists hold `{before, after}` changes.
 * @param {"undo"|"redo"} way
 * @returns {{change: {before: object, after: object}, history: History}|null} Null when there is nothing that way.
 */
export function stepChange(history, way) {
	const change = (way === "undo" ? history.undo : history.redo).at(-1);
	const step = change ? stepHistory(history, way, change) : null;
	return step ? { change, history: step.history } : null;
}

/** @returns {boolean} Whether two plain values are the same. */
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * What Undo or Redo writes when things have moved on since the change was
 * made, outside the Undo list: a Myth found, an Omen met, a Landmark named.
 * Each listed thing, matched by its key, takes the snapshot's value only in
 * the fields the change itself set; every other field stays as it is now. A
 * thing that has come since and the change knew nothing of is kept, and one on
 * both sides of the change that has gone since stays gone.
 * @param {object} target The snapshot being stepped to.
 * @param {object} base The snapshot on the change's other side.
 * @param {object} current As things stand now.
 * @param {Record<string, (item: object) => string|null>} lists Each list's name, and how its things are keyed.
 * @returns {object} The target with what has happened since carried into it.
 */
export function carryForward(target, base, current, lists) {
	const out = { ...target };
	for (const [name, keyOf] of Object.entries(lists)) {
		const wanted = target?.[name];
		const now = current?.[name];
		if (!Array.isArray(wanted) || !Array.isArray(now)) continue;
		const byKey = (items) => new Map((items ?? []).map((item) => [keyOf(item), item]).filter(([key]) => key != null));
		const was = byKey(base?.[name]);
		const is = byKey(now);
		const merged = wanted.flatMap((item) => {
			const key = keyOf(item);
			const before = was.get(key);
			const live = is.get(key);
			// One the change laid or took away is the change's own to put back.
			if (!before) return [item];
			if (!live) return [];
			const result = {};
			for (const field of new Set([...Object.keys(item), ...Object.keys(live)])) {
				const value = same(before[field], item[field]) ? live[field] : item[field];
				if (value !== undefined) result[field] = value;
			}
			return [result];
		});
		const kept = new Set(wanted.map(keyOf));
		const since = now.filter((item) => {
			const key = keyOf(item);
			return key != null && !kept.has(key) && !was.has(key);
		});
		out[name] = [...merged, ...since];
	}
	return out;
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
