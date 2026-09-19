/**
 * The path a highlight takes down a table before it stops on the row the dice
 * gave, the way a finger runs down a printed table: row by row from where it
 * starts, round again from the top, slowing until it stops on the roll. Pure, so it can be tested without Foundry.
 */

/** Steps the highlight takes before it lands, for the first column rolled. */
export const SPIN_STEPS = 14;

/** Each further column takes this many more, so the columns land one after another. */
export const SPIN_STAGGER = 5;

/** The first step's length, and the last's, in milliseconds. */
export const SPIN_FASTEST = 45;
export const SPIN_SLOWEST = 280;

/**
 * Rows for the highlight to visit, stepping down the table one row at a time
 * and wrapping from the last row to the first, so it ends on the one rolled.
 * @param {number} landing The row it stops on, from 0.
 * @param {number} rows    How many rows the table has.
 * @param {number} steps
 * @returns {number[]} `steps` rows, the last of them `landing`.
 */
export function spinPath(landing, rows, steps) {
	if (rows < 2 || steps < 1) return [landing];
	// Counted back from the landing, so the walk starts wherever it must to end there.
	return Array.from({ length: steps }, (_, index) => (((landing - (steps - 1 - index)) % rows) + rows) % rows);
}

/**
 * The fewest steps, at least `atLeast`, that start the walk on a given row.
 * @param {number} landing The row it stops on, from 0.
 * @param {number} rows
 * @param {number} atLeast
 * @param {number} [start] The row it starts on, from 0.
 * @returns {number}
 */
export function stepsFrom(landing, rows, atLeast, start = 0) {
	if (rows < 2) return 1;
	return atLeast + (((landing - start + 1 - atLeast) % rows) + rows) % rows;
}

/**
 * A different row for each column's highlight to start on.
 * @param {number} columns
 * @param {number} rows
 * @param {() => number} [random] Returns [0, 1).
 * @returns {number[]} One row, from 0, for each column; distinct while there are rows enough.
 */
export function startRows(columns, rows, random = Math.random) {
	const free = Array.from({ length: rows }, (_, row) => row);
	return Array.from({ length: columns }, () => {
		if (!free.length) return Math.floor(random() * rows);
		return free.splice(Math.floor(random() * free.length), 1)[0];
	});
}

/**
 * How long the highlight rests on each step, slowing as it nears the end.
 * @param {number} steps
 * @returns {number[]} Milliseconds, one for each step.
 */
export function spinDelays(steps) {
	return Array.from({ length: steps }, (_, index) => {
		const share = steps > 1 ? index / (steps - 1) : 1;
		return Math.round(SPIN_FASTEST + (SPIN_SLOWEST - SPIN_FASTEST) * share ** 2.5);
	});
}
