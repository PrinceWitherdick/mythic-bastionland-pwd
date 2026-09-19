/**
 * Rules pages of the rulebook, read as the GM's own copy prints them: headed
 * sections of paragraphs, bulleted lists and labelled lines, down each column
 * in turn. Nothing from the pages ships with the system; Import PDF reads
 * them from the GM's own rulebook. Pure, so the page reading can be tested
 * without Foundry.
 */
import { textLines, textRuns } from "./book-art.js";
import { BULLET, joinLines, titleCase } from "./text.js";

/** Headings are title-cased as the rest of the system writes them. */
export { titleCase };

/** The rules pages Import PDF reads, by the key the index keeps each under. */
export const RULE_PAGES = Object.freeze({ creatingRealm: 14 });

/** Rules text is set at 11pt; the page's title and number are larger. */
const TEXT_SIZE = 11;

/** A gap between baselines this many times the text size starts a new paragraph. Lines are 11pt apart, bullets 13 and paragraphs 19. */
const PARAGRAPH_GAP = 1.5;

/** How far left of a column's headings its text may start. */
const COLUMN_SLACK = 2;

const LABELLED = /^([^:]+):\s*(.*)$/;

/**
 * @typedef {{kind: "paragraph"|"bullet", text: string}|{kind: "term", label: string, text: string}} RuleBlock
 * @typedef {{heading: string, blocks: RuleBlock[]}} RuleSection
 */

/**
 * A rules page's headed sections, in reading order. Headings are lines set
 * wholly in capitals in a font other than the text's. A line that starts in
 * that other font, such as "Dwellings: Humble homes", is a labelled line.
 * The page has a column for each place its headings start.
 * @param {object[]} items From `page.getTextContent()`.
 * @returns {RuleSection[]|null} Null without a heading.
 */
export function rulePageFromItems(items) {
	const pairs = items
		.map((item) => ({ item, run: textRuns([item])[0] }))
		.filter(({ run }) => run && run.size <= TEXT_SIZE + 1);
	const runs = pairs.map(({ run }) => run);

	// The text's own font is the one most of the page is set in.
	const letters = new Map();
	for (const run of runs) letters.set(run.font, (letters.get(run.font) ?? 0) + run.str.length);
	const bodyFont = [...letters].sort((a, b) => b[1] - a[1])[0]?.[0];
	const emphasised = (run) => run.font !== bodyFont && run.size > TEXT_SIZE - 1;
	const capitals = (text) => /\p{Lu}/u.test(text) && text === text.toUpperCase();

	const starts = [...new Set(runs.filter((run) => emphasised(run) && capitals(run.str.trim())).map((run) => run.x))].sort((a, b) => a - b);
	// Headings set a few points apart on different lines still start one column.
	const columnStarts = starts.filter((x, index) => index === 0 || x - starts[index - 1] > TEXT_SIZE * 4);
	if (!columnStarts.length) return null;
	const columnOf = (run) => Math.max(0, columnStarts.findLastIndex((x) => run.x >= x - COLUMN_SLACK));
	const columns = columnStarts.map((_, column) => textLines(pairs.filter(({ run }) => columnOf(run) === column).map(({ item }) => item)));

	const sections = [];
	for (const lines of columns) {
		let previous = null;
		for (const line of lines) {
			const gap = previous ? previous.y - line.y : Infinity;
			previous = line;
			const runs = [...line.runs].sort((a, b) => a.x - b.x);
			const section = sections.at(-1);
			if (runs.every(emphasised) && capitals(line.text)) {
				sections.push({ heading: titleCase(line.text), blocks: [] });
				continue;
			}
			// Anything above the first heading, such as a running head, isn't part of a section.
			if (!section) continue;

			const block = section.blocks.at(-1);
			const labelled = emphasised(runs[0]) && line.text.match(LABELLED);
			if (BULLET.test(line.text)) section.blocks.push({ kind: "bullet", text: line.text.replace(BULLET, "") });
			else if (labelled) section.blocks.push({ kind: "term", label: labelled[1].trim(), text: labelled[2] });
			else if (block && gap <= TEXT_SIZE * PARAGRAPH_GAP) block.text = joinLines(block.text, line.text);
			else section.blocks.push({ kind: "paragraph", text: line.text });
		}
	}
	return sections.length ? sections : null;
}
