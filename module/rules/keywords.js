/**
 * The book's rule words, such as Exposed, Hefty and Gambit, and where each is
 * explained, so hovering one anywhere in the system's text says what it means,
 * as Stonetop's gear tags do.
 *
 * The book capitalises its rule words, so they are matched as written: "Save"
 * is the rule, "save" is only a word. "Long" and "Slow" are ordinary words
 * even capitalised, so they count only where a weapon's qualities are listed:
 * after its dice ("d10 long"), in a tag list ("(d8, Long)" or "d8 · Long"), or
 * naming the kind of weapon ("Slow weapons").
 */

/** A weapon's dice, such as "d8", "2d10" or "d6+d8", and the space after them. */
const AFTER_DICE = String.raw`(?<=(?<![\p{L}\p{N}])\d*d\d+(?:\s*\+\s*\d*d\d+)*\s+)`;

/**
 * Inside a list of tags, written either way the system writes one: between
 * brackets and commas, as an item row does in "(d10, Long)", or set off by the
 * middle dot the Attack dialog joins a weapon's qualities with, as in
 * "d10 · Long". Nothing else writes that dot, so one side of it is enough.
 */
const IN_TAGS = (word) => [
	String.raw`(?<=[(,]\s*)${word}(?=\s*[,)])`,
	String.raw`(?<=·\s*)${word}`,
	String.raw`${word}(?=\s*·)`
].join("|");

/**
 * A weapon quality: capitalised anywhere it's unmistakable, and otherwise
 * only after dice, in a tag list or before "weapon".
 * @param {string} word Lower case.
 * @param {boolean} capitalAnywhere
 */
function quality(word, capitalAnywhere) {
	const capital = word[0].toUpperCase() + word.slice(1);
	const forms = [`${AFTER_DICE}(?:${word}|${capital})`, IN_TAGS(capital), `${capital}(?= weapons?)`];
	if (capitalAnywhere) forms.push(capital);
	return forms.join("|");
}

/**
 * Each rule word, the patterns that find it, and the page explaining it. A
 * longer phrase is listed before any word inside it, so "Strong Gambit" and
 * "Mortal Wound" are matched whole.
 *
 * The tip for each is `bastionland.keywords.<key>` in the language file.
 */
export const KEYWORDS = Object.freeze([
	{ key: "strongGambit", pattern: "Strong Gambits?", page: 10 },
	{ key: "mortalWound", pattern: "Mortal(?:ly)? Wound(?:ed|s)?", page: 8 },
	{ key: "virtueLoss", pattern: "Virtue Loss", page: 9 },
	{ key: "guard", pattern: "Guard|GD", page: 8 },
	{ key: "vigour", pattern: "Vigour|VIG", page: 9 },
	{ key: "clarity", pattern: "Clarity|CLA", page: 9 },
	{ key: "spirit", pattern: "Spirit|SPI", page: 9 },
	{ key: "save", pattern: "Saves?", page: 8 },
	{ key: "armour", pattern: "Armour", page: 12 },
	{ key: "exposed", pattern: "Exposed", page: 8 },
	{ key: "fatigue", pattern: "Fatigued?", page: 10 },
	{ key: "exhausted", pattern: "Exhausted", page: 9 },
	{ key: "impaired", pattern: "Impaired", page: 8 },
	{ key: "wounded", pattern: "Wound(?:ed|s)?", page: 8 },
	{ key: "slain", pattern: "Slain", page: 8 },
	{ key: "evade", pattern: "Evade", page: 8 },
	{ key: "scar", pattern: "Scars?", page: 9 },
	{ key: "gambit", pattern: "Gambits?", page: 10 },
	{ key: "bolster", pattern: "Bolster(?:s|ed|ing)?", page: 10 },
	{ key: "feat", pattern: "Feats?", page: 10 },
	{ key: "smite", pattern: "Smite", page: 10 },
	{ key: "focus", pattern: "Focus", page: 10 },
	{ key: "deny", pattern: "Deny", page: 10 },
	{ key: "blast", pattern: quality("blast", true), page: 8 },
	{ key: "hefty", pattern: quality("hefty", true), page: 12 },
	{ key: "long", pattern: quality("long", false), page: 12 },
	{ key: "slow", pattern: quality("slow", false), page: 12 },
	{ key: "ranged", pattern: quality("ranged", false), page: 10 },
	{ key: "trample", pattern: quality("trample", true), page: 10 },
	{ key: "wall", pattern: "[Ss]hieldwalls?|[Ss]pearwalls?", page: 10 },
	{ key: "warband", pattern: "Warbands?", page: 11 },
	{ key: "remedy", pattern: "Remed(?:y|ies)|Sustenance|Stimulant|Sacrament", page: 9 },
	{ key: "glory", pattern: "Glory", page: 6 }
]);

/**
 * Every rule word at once, each in its own group so a match says which it
 * was. Words aren't matched inside longer ones ("Spirited", "Feathers"), but
 * may follow a number, as in "3GD".
 */
const MATCHER = new RegExp(
	String.raw`(?<!\p{L})(?:${KEYWORDS.map(({ pattern }) => `(${pattern})`).join("|")})(?!\p{L})`,
	"gu"
);

/**
 * @typedef {object} KeywordMatch
 * @property {number} index  Where the word starts in the text.
 * @property {number} length
 * @property {string} key    Its entry in KEYWORDS.
 * @property {number} page   The page explaining it.
 */

/**
 * The rule words in a piece of text, in order and never overlapping.
 * @param {string} text
 * @returns {KeywordMatch[]}
 */
export function findKeywords(text) {
	if (!text) return [];
	const found = [];
	for (const match of String(text).matchAll(MATCHER)) {
		const which = match.slice(1).findIndex((group) => group !== undefined);
		if (which < 0 || !match[0]) continue;
		const { key, page } = KEYWORDS[which];
		found.push({ index: match.index, length: match[0].length, key, page });
	}
	return found;
}
