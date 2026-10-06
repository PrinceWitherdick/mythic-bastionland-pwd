/**
 * What a Knight rolled on the table from their page, told as a sentence, such
 * as "The armour found you at the **lake**." Each column of each table has a
 * pattern of its own under `bastionland.knightTable.sentences`, by the Knight's
 * roll and the column's number, so each line reads on its own. The patterns
 * only reword the book's headings; the entries still come only from Import PDF.
 * Pure, so every table's sentences can be tested without Foundry.
 *
 * A pattern holds one of four places for the entry:
 * - `{entry}`     takes a capital at the start of a sentence and drops it within one;
 * - `{Entry}`     keeps the entry as the book writes it, as for a title or a line of verse;
 * - `{a entry}`   as `{entry}`, with "a" or "an" before it, unless it has its own or needs none;
 * - `{the entry}` as `{entry}`, with "the" before it, unless it has its own.
 *
 * A column whose entry finishes the line before it, as a tapestry's subject
 * finishes what it shows, is given `{ line, join }`: `join` is used where the
 * column before it was shown too, and the two make one sentence.
 */
import { spreads } from "./book-art.js";
import { capitalise } from "./text.js";

const PLACE = /\{(?:(a|the) )?(entry|Entry)\}/;

/** Words the book capitalises wherever they fall, which keep their capital within a sentence. */
const PROPER = new Set(["seer", "seers", "seer’s", "seer's", "knight", "knights", "knight’s", "knight's", "myth", "myths", "realm", "city", "holding", "seat", "company", "vassal", "vassals", "warband", "warbands"]);

/** Words that already say "a", "the", "your" or how many, so no article goes before them. */
const DETERMINERS = new Set(["a", "an", "the", "some", "your", "his", "her", "their", "its", "one", "another", "all", "every", "two", "three", "four", "five", "six", "many", "no", "only"]);

/**
 * Stuff rather than things, which takes no "a": armour is patched with
 * "flexible leather" but with "a padded coat".
 */
const STUFF = new Set(["leather", "bronze", "steel", "iron", "brass", "copper", "silver", "gold", "mail", "cloth", "wool", "silk", "felt", "fur", "hair", "clay", "stone", "wood", "ivory", "parchment", "velvet", "straw", "glass", "salt", "sand", "smoke", "blood", "milk", "honey", "water", "fire", "light", "string"]);

/** The entry "Self" is the Knight themself, and reads so within a sentence. */
const REFLEXIVE = { self: "yourself" };

/**
 * @param {string} entry
 * @returns {boolean} Whether its first word keeps its capital within a sentence: a word the
 *   book capitalises, one in capitals, or one with a capital or digit past its first letter.
 */
function keepsCapital(entry) {
	const word = /^[\p{L}\p{N}’'-]+/u.exec(entry)?.[0] ?? "";
	if (!word) return true;
	if (PROPER.has(word.toLowerCase())) return true;
	return /[\p{Lu}\p{N}]/u.test(word.slice(1));
}

/**
 * @param {string} entry
 * @param {boolean} starts Whether it starts a sentence.
 * @returns {string} The entry with the capital a sentence gives it there.
 */
function cased(entry, starts) {
	if (starts) return capitalise(entry);
	return keepsCapital(entry) ? entry : entry.charAt(0).toLowerCase() + entry.slice(1);
}

/**
 * @param {string} entry
 * @param {"a"|"the"} [kind]
 * @param {object} [options]
 * @param {boolean} [options.beforeNoun] Whether the pattern's own noun follows, as in "{a entry} helm",
 *   where the article belongs to that noun and the entry only describes it.
 * @returns {string} "a", "an" or "the" for it, or "" when it needs none.
 */
export function articleFor(entry, kind = "a", { beforeNoun = false } = {}) {
	const words = entry.toLowerCase().split(/\s+/);
	if (DETERMINERS.has(words[0])) return "";
	if (kind === "the") return "the";
	const head = entry.replace(/\s*\(.*$/, "").trim().split(/\s+/).at(-1)?.toLowerCase() ?? "";
	if (!beforeNoun) {
		// A plural takes none: "fallen soldiers", "brass studs". Not "moss" or "glass".
		if (/[^s]s$/.test(head)) return "";
		// Nor does stuff: "patched with polished steel", but "with a padded coat".
		if (STUFF.has(head)) return "";
	}
	// Said with a "you" or a "wuh", as "unicorn" and "one-eyed", so "a".
	if (/^(?:uni|use|usu|eu|one)/.test(words[0])) return "a";
	return /^[aeiou]/.test(words[0]) ? "an" : "a";
}

/**
 * @typedef {object} TableSentence
 * @property {string} before What comes before the entry, as plain text.
 * @property {string} entry  The entry, cased for where it falls, to be shown in bold.
 * @property {string} after  What comes after it.
 */

/**
 * @param {string} pattern Such as "The armour found you at the {entry}."
 * @param {string} entry   Such as "Lake".
 * @param {object} [options]
 * @param {boolean} [options.continues] Whether it carries on the line before it, so nothing in it starts a sentence.
 * @returns {TableSentence|null} Null for a pattern without a place for the entry.
 */
export function tableSentence(pattern, entry, { continues = false } = {}) {
	const given = String(entry ?? "").trim();
	const text = REFLEXIVE[given.toLowerCase()] ?? given;
	const match = PLACE.exec(String(pattern ?? ""));
	if (!match || !text) return null;
	let before = pattern.slice(0, match.index);
	let after = pattern.slice(match.index + match[0].length);
	const [, withArticle, kind] = match;
	const starts = !continues && (before.trim() === "" || /[.!?]\s+$/.test(before));

	let shown = kind === "Entry" ? text : cased(text, starts && !withArticle);
	if (withArticle) {
		// "{a entry} helm" has its own noun for the article; "is {a entry}." leaves it to the entry.
		const article = articleFor(text, withArticle, { beforeNoun: /^\s+\p{L}/u.test(after) });
		if (article) before += `${starts ? capitalise(article) : article} `;
		else if (kind !== "Entry") shown = cased(text, starts);
	}
	// An entry with its own stop ends the sentence: "Ghosts!", not "Ghosts!."
	if (/[.!?…]$/.test(shown)) after = after.replace(/^\./, "");
	return { before, entry: shown, after };
}

/**
 * A column's pattern as withSentences wants it, from whatever was found under its key: a line on
 * its own, a joining column's two forms, or null for anything else. Foundry's `localize` hands
 * back only strings, so a joining column has to be read from the translations themselves.
 * @param {unknown} found
 * @returns {string|{line: string, join?: string}|null}
 */
export function asPattern(found) {
	if (typeof found === "string") return found;
	return typeof found?.line === "string" ? found : null;
}

/**
 * @param {number} page A Knight's page.
 * @returns {string|null} Their roll, such as "1-08", which keys their table's patterns.
 */
export function rollForKnightPage(page) {
	return spreads().find((spread) => spread.knightPage === Number(page))?.roll ?? null;
}

/**
 * @param {TableSentence} sentence
 * @returns {{text: string, bold: boolean}[]} Its pieces in order, the entry marked to be shown in bold.
 */
const partsOf = ({ before, entry, after }) => [{ text: before, bold: false }, { text: entry, bold: true }, { text: after, bold: false }].filter((part) => part.text);

/**
 * Each result told as a line, where its table has a pattern for its column. A
 * column that finishes the line before it is joined onto it, so the two are
 * read, and shown, as one sentence with a bold entry in each.
 * @template {{index: number, roll?: number, entry: string|null}} R
 * @param {{page: number}} stored The Knight's table.
 * @param {R[]} results
 * @param {(roll: string, column: number) => string|{line: string, join?: string}|null} patternFor
 *   By the column's number from 1.
 * @returns {(R & {sentence: {parts: {text: string, bold: boolean}[]}|null})[]}
 */
export function withSentences(stored, results, patternFor) {
	const roll = rollForKnightPage(stored?.page);
	// Almost every pattern is just its line, so it may be written as one.
	const shaped = (pattern) => (typeof pattern === "string" ? { line: pattern } : pattern);
	const lines = [];
	for (const result of results) {
		const pattern = roll && result.entry ? shaped(patternFor(roll, result.index + 1)) : null;
		const previous = lines.at(-1);
		const joined = pattern?.join && previous?.sentence && tableSentence(pattern.join, result.entry, { continues: true });
		if (joined) {
			const before = previous.sentence.parts;
			const spaced = /\s$/.test(before.at(-1).text) ? before : [...before, { text: " ", bold: false }];
			previous.sentence = { parts: [...spaced, ...partsOf(joined)] };
			continue;
		}
		const line = pattern ? tableSentence(pattern.line, result.entry) : null;
		lines.push({ ...result, sentence: line ? { parts: partsOf(line) } : null });
	}
	return lines;
}
