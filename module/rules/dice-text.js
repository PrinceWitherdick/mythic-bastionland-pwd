/**
 * Dice written into printed rules, such as the "d12" a patch of terrain is
 * sized by (p14). Found in the text as it stands,
 * so a window can offer to roll the die where the book writes it without the
 * words being touched. Pure, so it can be tested without Foundry.
 */

/**
 * A die in a run of text: "d12", or "2d6" where the book asks for more than
 * one. A letter or digit on either side makes it something else, such as the
 * "d6" already counted in "2d6".
 */
const DICE = /(?<![\p{L}\p{N}])(\d{1,2})?d(\d{1,3})(?![\p{L}\p{N}])/gu;

/** The dice the book rolls. Anything else read as a die is left as plain text. */
const FACES = new Set([2, 3, 4, 6, 8, 10, 12, 20, 100]);

/**
 * @typedef {object} DiceMatch
 * @property {number} index  Where the die starts in the text.
 * @property {number} length
 * @property {number} count  How many are rolled.
 * @property {number} faces
 * @property {string} formula As Foundry's Roll takes it, such as "1d12".
 */

/**
 * The dice written in a run of text, in the order they're printed.
 * @param {string} text
 * @returns {DiceMatch[]}
 */
export function findDiceText(text) {
	const found = [];
	for (const match of String(text ?? "").matchAll(DICE)) {
		const count = Number(match[1] ?? 1);
		const faces = Number(match[2]);
		if (!count || !FACES.has(faces)) continue;
		found.push({ index: match.index, length: match[0].length, count, faces, formula: `${count}d${faces}` });
	}
	return found;
}

/**
 * What to call a die that's been rolled more than once in the same text, so
 * its result finds its way back to it when the window draws again.
 * @param {string} formula
 * @param {number} at How many of that same die came before it.
 * @returns {string}
 */
export const diceKey = (formula, at) => `${formula}#${at}`;
