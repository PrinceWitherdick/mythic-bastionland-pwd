/**
 * Attack dice (Attacks p8, Gambits p10). Pure so the dice arithmetic can be
 * tested without Foundry.
 */

/** Die sizes offered for shields, bonuses and Scars. */
export const DIE_SIZES = Object.freeze([4, 6, 8, 10, 12]);

/** Dice showing this or higher may be discarded to perform a Gambit. */
export const GAMBIT_MINIMUM = 4;

/** A melee die showing this or higher performs a Strong Gambit. */
export const STRONG_GAMBIT_MINIMUM = 8;

/** Guards against a typo such as "99d6" flooding the chat card. */
const MAX_DICE_PER_TERM = 10;

const DICE_TERM = /^(\d*)d(\d+)$/i;

/**
 * Turn damage notation typed on an item into one entry per die, so "2d6"
 * becomes [6, 6] and "d8" becomes [8]. Unreadable terms are skipped rather
 * than thrown, because the notation is free text.
 * @param {string} notation e.g. "d8", "2d10", "d6+d4"
 * @returns {number[]} Die sizes.
 */
export function parseDice(notation) {
	const faces = [];
	for (const term of String(notation ?? "").split("+")) {
		const match = term.trim().match(DICE_TERM);
		if (!match) continue;
		const count = Math.min(match[1] === "" ? 1 : Number(match[1]), MAX_DICE_PER_TERM);
		const size = Number(match[2]);
		if (!count || !size) continue;
		for (let i = 0; i < count; i++) faces.push(size);
	}
	return faces;
}

/**
 * Gather the dice for one Attack. An Attack with no weapon dice is unarmed,
 * and unarmed or Impaired Attacks roll a single d4 with no bonus dice.
 * @param {object} args
 * @param {string[]} [args.sources]  Damage notation of each weapon and shield used.
 * @param {number[]} [args.bonus]    Extra die sizes, such as Smite's d12.
 * @param {boolean} [args.impaired]
 * @returns {{dice: number[], impaired: boolean}}
 */
export function buildAttackPool({ sources = [], bonus = [], impaired = false }) {
	const weaponDice = sources.flatMap(parseDice);
	if (impaired || weaponDice.length === 0) return { dice: [4], impaired: true };
	return { dice: [...weaponDice, ...bonus], impaired: false };
}

/**
 * Summarise rolled Attack dice before any Deny or Gambits are declared.
 * @param {number[]} results The face shown on each die.
 * @param {object} [options]
 * @param {boolean} [options.melee=true] Only melee dice make Strong Gambits.
 * @returns {{highest: number, gambitDice: number, strongDice: number}}
 */
export function summarizeAttack(results, { melee = true } = {}) {
	return {
		highest: results.length ? Math.max(...results) : 0,
		gambitDice: results.filter((result) => result >= GAMBIT_MINIMUM).length,
		strongDice: melee ? results.filter((result) => result >= STRONG_GAMBIT_MINIMUM).length : 0
	};
}
