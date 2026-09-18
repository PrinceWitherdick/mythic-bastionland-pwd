/**
 * The Spark Tables (p22-25): four pages of nine tables, each with two columns
 * of twelve entries. Rolling 2d12, one die for each column, and combining the
 * two entries gives a prompt to improvise from. Nothing from the tables ships
 * with the system; Import PDF reads them from the GM's own rulebook.
 * Pure, so the page reading can be tested without Foundry.
 */
import { runMiddle, textRuns } from "./book-art.js";
import { cleanText } from "./text.js";

/** The pages holding Spark Tables, in book order. */
export const SPARK_PAGES = Object.freeze([
	Object.freeze({ key: "nature", page: 22 }),
	Object.freeze({ key: "civilisation", page: 23 }),
	Object.freeze({ key: "people", page: 24 }),
	Object.freeze({ key: "combat", page: 25 })
]);

export const SPARK_TABLES_PER_PAGE = 9;

const SPARK_ROWS = 12;

/** Titles, column headings, row numbers and entries are all set at 10pt. */
const TABLE_TEXT_SIZE = 10;

/** Each page is headed in a large display face. */
const PAGE_TITLE_MIN_SIZE = 40;

/** Table titles are printed in capitals, which sets them apart from the column headings. */
const TITLE = /^\p{Lu}[\p{Lu}\s&'’-]*\p{Lu}$/u;

const ROW_NUMBER = /^\d{1,2}$/;

/** Runs this close to the same baseline share a line. */
const SAME_LINE = 2;

/** Titles this close vertically head the same row of the page's grid. */
const SAME_GRID_ROW = 20;

/** Titles whose centres are this close stand in the same column of the page's grid. */
const GRID_COLUMN_GAP = 60;

/**
 * @param {string} text Such as "OTHERWORLD".
 * @returns {string} Such as "Otherworld".
 */
const titleCase = (text) => text.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_match, before, letter) => before + letter.toUpperCase());

/**
 * @typedef {object} SparkTable
 * @property {string} name     Such as "Land".
 * @property {string[]} columns The two column headings.
 * @property {string[][]} rows  Twelve rows in roll order, each with one entry per column.
 */

/**
 * Read one page of Spark Tables.
 * @param {object[]} items From `page.getTextContent()`.
 * @returns {{name: string|null, tables: SparkTable[], unread: string[]}}
 *   `name` heads the page. `tables` are in reading order, left to right along
 *   each row of the page. `unread` names the tables whose rows couldn't be read,
 *   which are left out.
 */
export function sparkTablesFromItems(items) {
	const runs = textRuns(items);
	const [pageTitle] = runs.filter((run) => run.size >= PAGE_TITLE_MIN_SIZE).sort((a, b) => b.size - a.size);
	const small = runs.filter((run) => Math.abs(run.size - TABLE_TEXT_SIZE) <= 0.5);
	const titles = small.filter((run) => TITLE.test(run.str.trim()));

	// Group the titles into the page's columns, then give every other run to the
	// nearest title above it in the nearest column.
	const columns = [];
	for (const title of [...titles].sort((a, b) => runMiddle(a) - runMiddle(b))) {
		const last = columns.at(-1);
		if (last && runMiddle(title) - runMiddle(last.at(-1)) <= GRID_COLUMN_GAP) last.push(title);
		else columns.push([title]);
	}
	const centre = (column) => column.reduce((sum, title) => sum + runMiddle(title), 0) / column.length;

	const owned = new Map(titles.map((title) => [title, []]));
	if (columns.length) {
		for (const run of small) {
			if (owned.has(run)) continue;
			const distance = (column) => Math.abs(centre(column) - runMiddle(run));
			const column = columns.reduce((best, candidate) => (distance(candidate) < distance(best) ? candidate : best));
			const [title] = column.filter((candidate) => candidate.y > run.y + SAME_LINE).sort((a, b) => a.y - b.y);
			owned.get(title)?.push(run);
		}
	}

	const tables = [];
	const unread = [];
	const readingOrder = (a, b) => (Math.abs(a.y - b.y) <= SAME_GRID_ROW ? a.x - b.x : b.y - a.y);
	for (const title of [...titles].sort(readingOrder)) {
		const name = titleCase(cleanText(title.str));
		const table = readTable(owned.get(title));
		if (table) tables.push({ name, ...table });
		else unread.push(name);
	}
	return { name: pageTitle ? cleanText(pageTitle.str) : null, tables, unread };
}

/**
 * A table's column headings and rows, from the runs below its title.
 * @param {ReturnType<typeof textRuns>} runs
 * @returns {{columns: string[], rows: string[][]}|null} Null unless it has two
 *   columns and every row from 1 to 12 has an entry in each.
 */
function readTable(runs) {
	const numbers = runs.filter((run) => ROW_NUMBER.test(run.str.trim()));
	const words = runs.filter((run) => !numbers.includes(run));
	if (!words.length) return null;

	const headingY = Math.max(...words.map((run) => run.y));
	const headings = words.filter((run) => Math.abs(run.y - headingY) <= SAME_LINE).sort((a, b) => a.x - b.x);
	if (headings.length !== 2) return null;

	const rows = [];
	for (let number = 1; number <= SPARK_ROWS; number++) {
		const marks = numbers.filter((run) => Number(run.str.trim()) === number && run.y < headingY - SAME_LINE);
		if (marks.length !== 1) return null;
		const [mark] = marks;

		const cells = headings.map(() => []);
		for (const run of words) {
			if (Math.abs(run.y - mark.y) > SAME_LINE || run.x <= mark.x) continue;
			const distances = headings.map((heading) => Math.abs(runMiddle(heading) - runMiddle(run)));
			cells[distances.indexOf(Math.min(...distances))].push(run);
		}
		const entries = cells.map((cell) => cleanText(cell.sort((a, b) => a.x - b.x).map((run) => run.str).join(" ")));
		if (entries.some((entry) => !entry)) return null;
		rows.push(entries);
	}
	return { columns: headings.map((run) => cleanText(run.str)), rows };
}

/**
 * Read a roll on a Spark Table, one d12 for each column.
 * @param {SparkTable} table
 * @param {number[]} rolls
 * @returns {{column: string, roll: number, entry: string|null}[]}
 */
export function sparkPrompt(table, rolls) {
	return table.columns.map((column, index) => ({
		column,
		roll: rolls[index],
		entry: table.rows[rolls[index] - 1]?.[index] ?? null
	}));
}
