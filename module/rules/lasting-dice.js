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
 * @property {boolean} [melee] Added only to melee Attacks, as a champion's vow is (p32).
 * @property {string} [item] The weapon it's given to, by id: it joins only blows made with that weapon (p98).
 * @property {string} [itemName] That weapon's name, as the dice are listed.
 */

/**
 * The lasting dice kept on a Combatant, with anything that isn't one left out.
 * @param {unknown} flag
 * @returns {LastingDie[]}
 */
export function lastingOf(flag) {
	return (Array.isArray(flag) ? flag : [])
		.filter((die) => DIE_SIZES.includes(Number(die?.faces)))
		.map((die) => ({
			faces: Number(die.faces),
			label: String(die.label ?? ""),
			...(die.melee ? { melee: true } : {}),
			...(typeof die.item === "string" && die.item ? { item: die.item, itemName: String(die.itemName ?? "") } : {})
		}));
}

/**
 * The lasting dice a blow can have: a ranged one leaves out those kept for
 * melee only (p32, p98), and one given to a weapon sits out a blow made without it (p98).
 * @param {LastingDie[]} dice
 * @param {{melee: boolean, items?: string[]}} blow The ids of the weapons it's made with, where known.
 * @returns {LastingDie[]}
 */
export const diceForBlow = (dice, { melee, items = null }) => dice.filter((die) => (melee || !die.melee) && (!die.item || !items || items.includes(die.item)));

/**
 * @typedef {object} Temper What an Ability that tempers its weapon gives a blow (p98).
 * @property {string} label The Ability's name.
 * @property {number} faces The die a Wound gives the weapon.
 * @property {{id: string, name: string}[]} weapons The melee weapons the blow was made with.
 */

/**
 * The die a Wound gives the weapon that dealt it, for the rest of the fight
 * (p98): the dealer's share must have a tempering Ability, and the weapon is
 * the one whose die counted, or else, where a bonus die of theirs such as
 * Smite's counted, whichever of their weapons rolled highest. A blow the weapon
 * didn't deal tempers nothing: a Dismount's d6, a steed's trample, or another
 * weapon or shield of theirs.
 * @param {{attacker: string, dice: {item?: string, actor?: string, result?: number}[], tempers?: Temper|null, joined?: {actor: string, tempers?: Temper|null}[]}} attack
 * @param {{dealer: string, die: number|null}} blow As damageAgainst weighs it.
 * @returns {LastingDie|null}
 */
export function temperedDie(attack, { dealer, die }) {
	const share = dealer === attack.attacker ? attack : attack.joined?.find((entry) => entry.actor === dealer);
	const temper = share?.tempers;
	if (!temper?.weapons?.length || !DIE_SIZES.includes(temper.faces)) return null;
	const theirs = (each) => (each.actor ?? attack.attacker) === dealer;
	// A Dismount's d6 counted, so the fall did the harm.
	const counted = die === null || die === undefined ? null : attack.dice[die];
	if (!counted || counted.trample) return null;
	const byId = (id) => temper.weapons.find((weapon) => weapon.id === id);
	if (theirs(counted) && counted.item && !byId(counted.item)) return null;
	let weapon = theirs(counted) ? byId(counted.item) : null;
	if (!weapon) {
		const highest = attack.dice.filter((each) => theirs(each) && byId(each.item)).sort((a, b) => (b.result ?? 0) - (a.result ?? 0))[0];
		weapon = highest ? byId(highest.item) : temper.weapons[0];
	}
	return { faces: temper.faces, label: temper.label, melee: true, item: weapon.id, itemName: weapon.name };
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
