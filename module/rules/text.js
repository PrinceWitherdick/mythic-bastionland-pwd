/**
 * Text helpers shared by Import PDF and the stat block reader. Pure, so
 * they can be tested without Foundry.
 */

/**
 * @param {string} text
 * @returns {string} The text, safe to place inside HTML.
 */
export const escapeHTML = (text) => String(text)
	.replaceAll("&", "&amp;")
	.replaceAll("<", "&lt;")
	.replaceAll(">", "&gt;")
	.replaceAll("\"", "&quot;");

/**
 * @param {string} text
 * @returns {string} The text with its first letter capitalised.
 */
export const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * @param {string} text As pdf.js read it.
 * @returns {string} Normalised, with each run of whitespace a single space.
 */
export const cleanText = (text) => text.normalize("NFKC").replace(/\s+/g, " ").trim();

/**
 * Join a wrapped line to the text before it, keeping a hyphen that split a word.
 * @param {string} before
 * @param {string} after
 * @returns {string}
 */
export const joinLines = (before, after) => (/\p{L}-$/u.test(before) ? `${before}${after}` : `${before} ${after}`);

/** The bullet a list line starts with in the book. */
export const BULLET = /^[•●▪]\s*/;

/** Words a wrapped line ends on in the middle of a sentence. */
const JOINING_WORDS = new Set([
	"a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "its", "of", "on", "or", "than", "that", "the",
	"their", "to", "with"
]);

/**
 * @param {string} text
 * @returns {number} Parentheses opened and not yet closed.
 */
const openParentheses = (text) => (text.match(/\(/g)?.length ?? 0) - (text.match(/\)/g)?.length ?? 0);

/**
 * Whether a line is complete, so the next printed line starts a new one.
 * @param {string} line
 * @param {string} next
 */
function endsLine(line, next) {
	if (openParentheses(line) > 0 || /[,;:&]$/.test(line)) return false;
	if (/[.!?)]$/.test(line)) return true;
	const lastWord = line.match(/(\p{L}+)$/u)?.[1].toLowerCase();
	return /^\p{Lu}/u.test(next) && !JOINING_WORDS.has(lastWord);
}

/**
 * Put text the book wrapped to a narrow column back into the lines it was
 * written as. A printed line carries on into the next unless it ends a
 * sentence or a closed parenthesis, or the next starts a capitalised item after
 * a word a line could end on. A bullet always starts a new line.
 * @param {string[]} lines As printed, top to bottom.
 * @returns {string[]}
 */
export function logicalLines(lines) {
	const result = [];
	for (const printed of lines) {
		const bullet = BULLET.test(printed);
		const line = String(printed).replace(BULLET, "").replace(/\s+/g, " ").trim();
		if (!line) continue;
		const current = result.at(-1);
		if (current === undefined || bullet || endsLine(current, line)) result.push(line);
		else result[result.length - 1] = joinLines(current, line);
	}
	return result;
}
