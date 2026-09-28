/**
 * Flipping the book for a prompt. Along the foot of every spread the book
 * prints prompts for the Referee: a Person, a Name, a Characteristic, an
 * Object, a Beast, a State and a Theme on the Knight's page, and one of each
 * Landmark on the Myth's. They help fill the blanks in a Hex (p19), and
 * flicking to a random page for one spreads the blame for improvising between
 * the Referee and the book (p179). A random page is a random spread, so the
 * Knights' own d6 and d12 find one. Pure, so it can be tested without Foundry.
 */
import { spreadPages } from "./book-art.js";
import { trimmedText } from "./text.js";

/**
 * The `page` a prompt kept in a hex is filed under, beside the Spark Tables'
 * own page keys, so a hex's rolls and its prompts share one list.
 */
export const BOOK_PROMPT_PAGE = "book";

/** The two pages of a spread, in the order the book prints them. */
export const SPREAD_SIDES = Object.freeze(["knight", "myth"]);

/**
 * @typedef {object} BookPrompt
 * @property {string} key   Its side and place, such as "knight:0", unique within its spread.
 * @property {string} side  One of SPREAD_SIDES.
 * @property {number} page  The page it's printed on.
 * @property {string} label Such as "Person".
 * @property {string} value Such as "Tired scout".
 */

/**
 * The prompts along one page's foot, as read, with anything unreadable left out.
 * @param {unknown} raw
 * @param {string} side One of SPREAD_SIDES.
 * @param {number} page
 * @returns {BookPrompt[]}
 */
export function pagePrompts(raw, side, page) {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((prompt) => ({ label: trimmedText(prompt?.label), value: trimmedText(prompt?.value) }))
		.filter(({ label, value }) => label && value)
		.map(({ label, value }, index) => ({ key: `${side}:${index}`, side, page, label, value }));
}

/**
 * Both pages of a spread with the prompts read from each.
 * @param {{d6: number, d12: number}} spread
 * @param {{knight: unknown, myth: unknown}} read The prompts along each page's foot, as read.
 * @returns {{knight: {page: number, prompts: BookPrompt[]}, myth: {page: number, prompts: BookPrompt[]}}}
 */
export function spreadPrompts({ d6, d12 }, read) {
	const pages = spreadPages(d6, d12);
	return Object.fromEntries(SPREAD_SIDES.map((side) => [side, { page: pages[side], prompts: pagePrompts(read?.[side], side, pages[side]) }]));
}

/**
 * The prompts picked out of a spread, in the order the book prints them.
 * @param {{knight: {prompts: BookPrompt[]}, myth: {prompts: BookPrompt[]}}} pages
 * @param {Iterable<string>} keys
 * @returns {BookPrompt[]}
 */
export function chosenPrompts(pages, keys) {
	const chosen = new Set(keys);
	return SPREAD_SIDES.flatMap((side) => pages?.[side]?.prompts ?? []).filter((prompt) => chosen.has(prompt.key));
}

/**
 * A prompt as a hex keeps it, in the same shape as a Spark Table roll, so it's
 * listed, searched and struck out wherever the hex's rolls are.
 * @param {BookPrompt} prompt
 * @param {{d6: number, d12: number}} spread
 * @param {object} options
 * @param {string} options.id
 * @param {string} options.table What the hex's lists show beside it, such as "Person (p30)".
 * @param {object|null} options.when The world's calendar when it was kept.
 * @returns {import("./hex-lore.js").HexSpark}
 */
export function promptSpark(prompt, { d6, d12 }, { id, table, when }) {
	return { id, page: BOOK_PROMPT_PAGE, table, rolls: [d6, d12], entries: [prompt.value], prompt: prompt.value, when };
}
