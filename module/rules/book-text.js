/**
 * The book's own words for what the system shows of its rules: Travel and
 * Exploration beside the map, the Knighthood page, the rule word tips, the
 * Scars, the seasonal events, and so on. None of them ship with the system.
 * Each passage is known here only by the page it's printed on and a
 * fingerprint of its letters, which finds it on the GM's own page but can't be
 * read back into words. Import PDF finds them and keeps them in the art index,
 * and the world lays them over the language file under the key each is shown
 * by. Until then each key shows its fallback: a line of the system's own under
 * BOOK_TEXT_FALLBACKS, or nothing.
 *
 * The fingerprints are written by `scripts/book-text.mjs` from the GM's PDF.
 * Pure, so the reading can be tested without Foundry.
 */
import { BOOK_PRINTS } from "./book-prints.js";

export { BOOK_PRINTS };

/**
 * Where a key's words stand in until the book is read, as a key under
 * `bastionland` holding the system's own line. A key not listed here shows
 * nothing: a window that needs to say the book isn't read yet says so once,
 * rather than in every paragraph.
 * @type {Readonly<Record<string, string>>}
 */
export const BOOK_TEXT_FALLBACKS = Object.freeze({
	"feats.smite.use": "feats.smite.summary",
	"feats.focus.use": "feats.focus.summary",
	"feats.deny.use": "feats.deny.summary",
	"scars.distress.effect": "unread.scars.distress",
	"scars.disfigurement.effect": "unread.scars.disfigurement",
	"scars.smash.effect": "unread.scars.smash",
	"scars.stun.effect": "unread.scars.stun",
	"scars.rupture.effect": "unread.scars.rupture",
	"scars.gouge.effect": "unread.scars.gouge",
	"scars.concussion.effect": "unread.scars.concussion",
	"scars.tear.effect": "unread.scars.tear",
	"scars.agony.effect": "unread.scars.agony",
	"scars.mutilation.effect": "unread.scars.mutilation",
	"scars.doom.effect": "unread.scars.doom",
	"scars.humiliation.effect": "unread.scars.humiliation"
});

/** How far either side of its page a passage is looked for, in case a printing moved it. */
const PAGE_SLACK = 1;

/**
 * What a fingerprint is taken of: letters and digits, and the punctuation that
 * marks where a passage ends. Spaces, quotes and dashes are left out, since
 * PDFs differ in how they set them.
 */
const KEPT = /[\p{L}\p{N}.,:;!?()+]/u;

/** Two rolling hashes, each a prime modulus and a base small enough for exact sums in a double. */
const HASHES = Object.freeze([
	{ mod: 2147483647, base: 131 },
	{ mod: 2147483629, base: 257 }
]);

/** Quotes that close a passage ending on a stop, as in “…the woods.” */
const CLOSING = new Set(["”", "’", "\"", "'"]);

/** Quotes that open a passage. */
const OPENING = new Set(["“", "‘", "\"", "'"]);

/**
 * A page's text as one string, from pdf.js text items in the order the page
 * draws them. A line break becomes a space, except after a hyphen joined to a
 * word, as in "non-" and "Exhausted".
 * @param {{str?: string, hasEOL?: boolean}[]} items From `page.getTextContent()`.
 * @returns {string}
 */
export function pageRaw(items) {
	let raw = "";
	for (const { str = "", hasEOL } of items ?? []) {
		raw += str;
		if (hasEOL && !/\p{L}-$/u.test(raw)) raw += " ";
	}
	return raw;
}

/**
 * The letters a fingerprint is taken of, without accents, with
 * where each came from in the raw text. A ligature such as "ﬁ" becomes both
 * its letters.
 * @param {string} raw
 * @returns {{text: string, at: number[]}}
 */
export function fingerprintLetters(raw) {
	let text = "";
	const at = [];
	for (let index = 0; index < raw.length; index++) {
		const plain = raw[index].normalize("NFKD").replace(/\p{M}/gu, "");
		for (const letter of plain) {
			if (!KEPT.test(letter)) continue;
			text += letter;
			at.push(index);
		}
	}
	return { text, at };
}

/**
 * @param {string} text From fingerprintLetters.
 * @returns {string} The fingerprint of all of it.
 */
function hashLetters(text) {
	return HASHES.map(({ mod, base }) => {
		let hash = 0;
		for (let index = 0; index < text.length; index++) hash = ((hash * base) + text.charCodeAt(index)) % mod;
		return hash.toString(36).padStart(6, "0");
	}).join("");
}

/**
 * A passage's fingerprint: how many letters it has, and a hash of them.
 * @param {string} passage Its words, as printed.
 * @returns {[number, string]}
 */
export function fingerprint(passage) {
	const { text } = fingerprintLetters(passage);
	return [text.length, hashLetters(text)];
}

/**
 * Where each wanted fingerprint starts in a page's letters: one rolling pass
 * for each length asked about.
 * @param {string} text From fingerprintLetters.
 * @param {[number, string][]} wanted
 * @returns {Map<string, number>} By `${length}:${hash}`, the index its letters start at.
 */
function locate(text, wanted) {
	const found = new Map();
	// By length, then by the first hash, the second hashes wanted with it.
	const lengths = new Map();
	for (const [length, hash] of wanted) {
		const [first, second] = [parseInt(hash.slice(0, 6), 36), parseInt(hash.slice(6), 36)];
		if (!lengths.has(length)) lengths.set(length, new Map());
		const byFirst = lengths.get(length);
		if (!byFirst.has(first)) byFirst.set(first, new Map());
		byFirst.get(first).set(second, hash);
	}
	for (const [length, byFirst] of lengths) {
		if (!length || length > text.length) continue;
		const powers = HASHES.map(({ mod, base }) => {
			let power = 1;
			for (let step = 0; step < length; step++) power = (power * base) % mod;
			return power;
		});
		const rolling = HASHES.map(() => 0);
		for (let index = 0; index < text.length; index++) {
			for (let which = 0; which < HASHES.length; which++) {
				const { mod, base } = HASHES[which];
				let hash = ((rolling[which] * base) + text.charCodeAt(index)) % mod;
				// Take off the letter that just left the window, worth base^length by now.
				if (index >= length) hash = (((hash - ((text.charCodeAt(index - length) * powers[which]) % mod)) % mod) + mod) % mod;
				rolling[which] = hash;
			}
			if (index < length - 1) continue;
			const hash = byFirst.get(rolling[0])?.get(rolling[1]);
			if (hash && !found.has(`${length}:${hash}`)) found.set(`${length}:${hash}`, index - length + 1);
		}
	}
	return found;
}

/**
 * The words a run of letters came from, as the page prints them, with the
 * quotes around them and single spaces.
 * @param {string} raw
 * @param {number[]} at From fingerprintLetters.
 * @param {number} start The first letter.
 * @param {number} length
 * @returns {string}
 */
function wordsAt(raw, at, start, length) {
	let from = at[start];
	let to = at[start + length - 1] + 1;
	while (from > 0 && OPENING.has(raw[from - 1])) from--;
	while (to < raw.length && CLOSING.has(raw[to])) to++;
	return raw.slice(from, to).replace(/\s+/g, " ").replace(/ ([,.;:!?)])/g, "$1").trim();
}

/**
 * A passage's spans as one run of sentences. Spans are often bullets, which
 * the book leaves without a stop, so each is given one where it has none.
 * @param {string[]} words
 * @returns {string}
 */
function joinSpans(words) {
	if (words.length === 1) return words[0];
	return words.map((span) => (/[.!?:;,]["'”’]?$/u.test(span) ? span : `${span}.`)).join(" ");
}

/**
 * The pages a set of fingerprints is looked for on, with the slack either side.
 * @param {Record<string, Array>} [prints]
 * @returns {number[]} In order.
 */
export function bookTextPages(prints = BOOK_PRINTS) {
	const pages = new Set();
	for (const [page, ...spans] of Object.values(prints)) {
		for (const [, , own] of spans) {
			const at = own ?? page;
			for (let offset = -PAGE_SLACK; offset <= PAGE_SLACK; offset++) if (at + offset > 0) pages.add(at + offset);
		}
	}
	return [...pages].sort((a, b) => a - b);
}

/**
 * Find each passage on the GM's own pages. A passage of several spans is found
 * only if all of them are, and its spans are joined with a space.
 * @param {(page: number) => object[]|null|undefined} itemsOf A page's text items, or nothing for a page not read.
 * @param {Record<string, Array>} [prints] By key, `[page, [length, hash, page?], ...]`.
 * @returns {{texts: Record<string, string>, missing: string[]}}
 */
export function findBookText(itemsOf, prints = BOOK_PRINTS) {
	const read = new Map();
	const pageOf = (number) => {
		if (!read.has(number)) {
			const raw = pageRaw(itemsOf(number) ?? []);
			read.set(number, { raw, ...fingerprintLetters(raw), wanted: [], found: null });
		}
		return read.get(number);
	};

	// Every page a span might be on is asked about all the spans that might be on it, so each is read once.
	const spansOf = Object.entries(prints).map(([key, [page, ...spans]]) => [key, spans.map(([length, hash, own]) => {
		const home = own ?? page;
		const candidates = [home];
		for (let offset = 1; offset <= PAGE_SLACK; offset++) candidates.push(home - offset, home + offset);
		const pages = candidates.filter((number) => number > 0);
		for (const number of pages) pageOf(number).wanted.push([length, hash]);
		return { length, hash, pages };
	})]);

	const texts = {};
	const missing = [];
	for (const [key, spans] of spansOf) {
		const words = spans.map(({ length, hash, pages }) => {
			for (const number of pages) {
				const page = pageOf(number);
				page.found ??= locate(page.text, page.wanted);
				const start = page.found.get(`${length}:${hash}`);
				if (start !== undefined) return wordsAt(page.raw, page.at, start, length);
			}
			return null;
		});
		if (words.every(Boolean)) texts[key] = joinSpans(words);
		else missing.push(key);
	}
	return { texts, missing };
}

/**
 * @param {object} tree
 * @param {string} path Dotted.
 * @returns {*}
 */
const valueAt = (tree, path) => path.split(".").reduce((node, part) => node?.[part], tree);

/**
 * @param {object} tree
 * @param {string} path Dotted.
 * @param {string} value
 */
function setAt(tree, path, value) {
	const parts = path.split(".");
	const last = parts.pop();
	let node = tree;
	for (const part of parts) {
		if (typeof node[part] !== "object" || node[part] === null) node[part] = {};
		node = node[part];
	}
	node[last] = value;
}

/**
 * Lay the book's words over a language tree, under `bastionland`: each key
 * read from the book takes its words, and each other key its fallback.
 * @param {object} translations Such as `game.i18n.translations`, changed in place.
 * @param {Record<string, string>} [texts] The words Import PDF read, by key.
 * @param {Record<string, Array>} [prints]
 * @returns {object} The same tree.
 */
export function withBookText(translations, texts = {}, prints = BOOK_PRINTS) {
	for (const key of Object.keys(prints)) {
		const fallback = BOOK_TEXT_FALLBACKS[key];
		const own = fallback ? valueAt(translations, `bastionland.${fallback}`) : "";
		const text = typeof texts?.[key] === "string" ? texts[key] : own;
		setAt(translations, `bastionland.${key}`, typeof text === "string" ? text : "");
	}
	return translations;
}
