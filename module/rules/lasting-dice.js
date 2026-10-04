/**
 * Dice that stay with somebody for the rest of a fight, as some Knights'
 * Abilities give them: a die added to every Attack until the Combat ends, or
 * one that grows with each blow. Pure, so it can be tested without Foundry.
 */
import { DIE_SIZES } from "./attack.js";

/**
 * @typedef {object} LastingDie
 * @property {number} faces One of DIE_SIZES.
 * @property {string} label What gives it, such as an Ability's name.
 */

/**
 * The lasting dice kept on a Combatant, with anything that isn't one left out.
 * @param {unknown} flag
 * @returns {LastingDie[]}
 */
export function lastingOf(flag) {
	return (Array.isArray(flag) ? flag : [])
		.filter((die) => DIE_SIZES.includes(Number(die?.faces)))
		.map((die) => ({ faces: Number(die.faces), label: String(die.label ?? "") }));
}

/**
 * @param {unknown} list The dice kept so far.
 * @param {unknown} dice Dice to keep as well.
 * @returns {LastingDie[]}
 */
export const withLasting = (list, dice) => [...lastingOf(list), ...lastingOf(dice)];

/**
 * @param {unknown} list The dice kept so far.
 * @param {number} index The one to drop.
 * @returns {LastingDie[]}
 */
export const withoutLasting = (list, index) => lastingOf(list).filter((_die, at) => at !== index);
