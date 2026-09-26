import { reducesMotion } from "../client-settings.js";
import { SPIN_STAGGER, SPIN_STEPS, spinDelays, spinPath, startRows, stepsFrom } from "../rules/roll-spin.js";

/** The class on the cell the highlight is passing over. */
const PASSING = "is-spinning";

/** The class on the cell a roll landed on. */
const LANDED = "is-rolled";

/** The class that flashes a cell as a roll lands on it, and only then. */
const LANDING = "is-landing";

/**
 * Run a highlight down each column of a table until it stops on the row
 * rolled, the columns landing one after another. Without motion, the rows
 * rolled are simply marked.
 * @param {HTMLElement[][]} columns Each column's cells, top row first.
 * @param {number[]} landings      The row rolled in each column, from 0.
 * @param {object} [options]
 * @param {boolean} [options.reduce] Skip the run and mark the rows at once; by
 *   default, when this person asked for less movement.
 * @returns {Promise<void>} Once every column has landed, or its cells have left the page.
 */
export async function spinColumns(columns, landings, { reduce = reducesMotion() } = {}) {
	for (const cells of columns) for (const cell of cells) cell.classList.remove(PASSING, LANDED, LANDING);
	const land = (cells, landing) => cells[landing]?.classList.add(LANDED, LANDING);
	if (reduce) {
		columns.forEach((cells, index) => land(cells, landings[index]));
		return;
	}
	// Each column's highlight sets off from a row of its own.
	const starts = startRows(columns.length, Math.min(...columns.map((cells) => cells.length)));
	await Promise.all(columns.map((cells, index) => spinColumn(cells, landings[index], SPIN_STEPS + index * SPIN_STAGGER, starts[index]).then(() => land(cells, landings[index]))));
}

/**
 * Spin a d6 table drawn with a `data-column` on each cell, for the rolls a
 * table roll gave.
 * @param {HTMLElement|null} table
 * @param {number[]} columns By index.
 * @param {{roll: number}[]} results One for each column, in the same order.
 * @param {object} [options] As spinColumns takes them.
 * @returns {Promise<void>}
 */
export function spinTable(table, columns, results, options) {
	if (!table) return Promise.resolve();
	return spinColumns(
		columns.map((column) => [...table.querySelectorAll(`td[data-column="${column}"]`)]),
		results.map((result) => result.roll - 1),
		options
	);
}

/**
 * @param {HTMLElement[]} cells
 * @param {number} landing
 * @param {number} steps At least this many.
 * @param {number} start  The row it sets off from.
 * @returns {Promise<void>}
 */
async function spinColumn(cells, landing, steps, start) {
	// It goes down the rows in order from where it starts.
	const path = spinPath(landing, cells.length, stepsFrom(landing, cells.length, steps, start));
	const delays = spinDelays(path.length);
	let lit = null;
	for (const [step, row] of path.entries()) {
		// A redraw mid-spin replaces the table; the new one already shows the roll.
		if (!cells[row]?.isConnected) break;
		lit?.classList.remove(PASSING);
		lit = cells[row];
		lit.classList.add(PASSING);
		await new Promise((resolve) => setTimeout(resolve, delays[step]));
	}
	lit?.classList.remove(PASSING);
}
