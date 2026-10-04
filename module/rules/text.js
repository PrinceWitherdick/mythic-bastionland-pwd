/**
 * Text helpers shared by Import PDF, the stat block and Property readers, and
 * the sheets. Pure, so
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
 * @param {string} html
 * @returns {string} Its text alone, on one line.
 */
export function stripHTML(html) {
	return String(html ?? "")
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * @param {string} text
 * @returns {string} The text with its first letter capitalised.
 */
export const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** Words a heading keeps in lower case unless it starts with them. */
export const MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to"]);

/**
 * @param {string} text A heading as printed, in capitals, such as "LAWS OF THE LICH".
 * @param {object} [options]
 * @param {Set<string>} [options.minorWords] Words kept in lower case unless they start it.
 * @param {boolean} [options.apostrophes] Whether an apostrophe stays inside a word, so
 *   "LICH'S" reads "Lich's" rather than "Lich'S".
 * @returns {string} In title case, such as "Laws of the Lich".
 */
export function titleCase(text, { minorWords = MINOR_WORDS, apostrophes = false } = {}) {
	const word = apostrophes ? /[\p{L}’']+/gu : /\p{L}+/gu;
	return text.toLowerCase().replace(word, (found, at) => (at > 0 && minorWords.has(found) ? found : capitalise(found)));
}

/**
 * @param {...string} texts
 * @returns {string} Each text that isn't empty as a paragraph of HTML.
 */
export const paragraphs = (...texts) => texts.filter(Boolean).map((text) => `<p>${escapeHTML(text)}</p>`).join("");

/**
 * "The Heron" reads "the Heron" inside a sentence.
 * @param {string} name
 * @returns {string}
 */
export const midSentence = (name) => name.replace(/^The\b/, "the");

/**
 * @param {string} text
 * @param {RegExp} separator Anchored with ^, tried at each place outside parentheses.
 * @returns {string[]} The text split there, each part trimmed, empty parts dropped.
 */
export function splitOutside(text, separator) {
	const parts = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < text.length; index++) {
		const character = text[index];
		if (character === "(") depth++;
		else if (character === ")") depth = Math.max(0, depth - 1);
		else if (depth === 0) {
			const match = separator.exec(text.slice(index));
			if (!match) continue;
			parts.push(text.slice(start, index));
			index += match[0].length - 1;
			start = index + 1;
		}
	}
	parts.push(text.slice(start));
	return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * @param {string} text
 * @returns {{open: number, close: number, inner: string}[]} Each outermost parenthesis
 *   that closes, in order. A bracket closing nothing is passed over.
 */
export function parentheticals(text) {
	const groups = [];
	let depth = 0;
	let open = -1;
	for (let index = 0; index < text.length; index++) {
		if (text[index] === "(") {
			if (depth === 0) open = index;
			depth++;
		} else if (text[index] === ")" && depth > 0) {
			depth--;
			if (depth === 0) groups.push({ open, close: index, inner: text.slice(open + 1, index) });
		}
	}
	return groups;
}

/**
 * An item name cut where its gloss begins, at the first " (" or ", ", so a
 * row can bold only the lead words and run the gloss on after them:
 * "Iron hand" then "(see below), hidden under a glove, with mail (A1) and a
 * hood". A cutting comma stays on the head as nameSep.
 * @param {string} name
 * @returns {{nameHead: string, nameSep: string, nameRest: string}}
 */
export function splitName(name) {
	const at = name.search(/ \(|, /);
	if (at <= 0) return { nameHead: name, nameSep: "", nameRest: "" };
	const nameSep = name[at] === "," ? "," : "";
	return { nameHead: name.slice(0, at), nameSep, nameRest: name.slice(at + nameSep.length).trimStart() };
}

/**
 * @param {string} text As pdf.js read it.
 * @returns {string} Normalised, with each run of whitespace a single space.
 */
export const cleanText = (text) => text.normalize("NFKC").replace(/\s+/g, " ").trim();

/** An ellipsis at either end of a heading, printed as "…" or as three dots. */
const EDGE_ELLIPSIS = /^\s*(?:…|\.{3,})\s*|\s*(?:…|\.{3,})\s*$/g;

/**
 * A column heading as a window or a chat card shows it. The book leaves an
 * ellipsis where a table's title runs on into its headings, as "Subject…" and
 * "Must…" do under "LAWS OF THE LICH", which reads only as "Subject…:" once
 * the heading stands on its own.
 * @param {string} text As printed.
 * @returns {string} Without the ellipsis at either end.
 */
export const headingText = (text) => String(text ?? "").replace(EDGE_ELLIPSIS, "").trim();

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

/**
 * @param {unknown} value As stored, which may be anything.
 * @returns {string} The text with its edges trimmed, or "" where there is none.
 */
export const trimmedText = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * Text as a search compares it: lower case, and with its accents taken off, so
 * "hollow" finds "Hollow" and "e" finds "é".
 * @param {string} text
 * @returns {string}
 */
export const searchable = (text) => String(text ?? "").normalize("NFD").replace(/\p{Mn}/gu, "").toLocaleLowerCase();

/**
 * Text cut short to fit a line, at a word where one ends near enough.
 * @param {string} text
 * @param {number} most The most characters to keep, the ellipsis among them.
 * @returns {string} One line, its spaces run together, ending "…" where it was cut.
 */
export function clipText(text, most) {
	const line = String(text ?? "").replace(/\s+/g, " ").trim();
	if (line.length <= most) return line;
	const cut = line.slice(0, Math.max(1, most - 1));
	const space = cut.lastIndexOf(" ");
	return `${(space > most * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/**
 * @param {string} path A file's path or URL.
 * @returns {string} Its file name, unescaped: "our%20banner.png" is "our banner.png".
 */
export function fileName(path) {
	const file = String(path ?? "").split(/[\\/]/).at(-1) ?? "";
	try {
		return decodeURIComponent(file);
	} catch {
		// A stray "%" in a local file name.
		return file;
	}
}
