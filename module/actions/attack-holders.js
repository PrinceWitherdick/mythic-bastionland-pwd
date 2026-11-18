import { attackersOf, diceShowing } from "../rules/attack.js";
import { abilitiesWith, etchedNumber, readyForAttack } from "../rules/ability-uses.js";
import { worldKnights } from "./knights.js";

/**
 * Who could change an Attack card's dice once they're rolled: those making a
 * joint Attack who could roll its whole pool again (p62), and the Knights whose
 * rune could turn one of its dice (p100).
 */

/**
 * Who could be asked: everybody, or only those this user owns.
 * @param {{owned?: boolean}} [options]
 * @returns {(actor: Actor) => boolean}
 */
const askable = ({ owned = false } = {}) => (owned ? (actor) => Boolean(actor.isOwner) : () => true);

/**
 * Those making a joint Attack, as actors, less any that can't be found.
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {{owned?: boolean}} [options] `owned`: only those this user owns.
 * @returns {Actor[]}
 */
const attackingActors = (attack, options) => attackersOf(attack).map((uuid) => fromUuidSync(uuid)).filter(Boolean).filter(askable(options));

/**
 * An attacker's Abilities that roll a joint Attack's whole pool again (p62).
 * @param {Actor} actor
 * @returns {Item[]}
 */
const poolRerollsOf = (actor) => abilitiesWith(actor.items?.contents ?? [], "rerollPool");

/**
 * @param {Item} item One of poolRerollsOf.
 * @returns {boolean} Whether it's ready for this Attack.
 */
const readyToReroll = (item) => readyForAttack(item.system);

/**
 * Those making a joint Attack who could roll its whole pool again: each with
 * an Ability that does it, ready for this Attack (p62).
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {{owned?: boolean}} [options] `owned`: only those this user owns.
 * @returns {{actor: Actor, item: Item}[]}
 */
export function poolRerollers(attack, options) {
	return attackingActors(attack, options).flatMap((actor) => poolRerollsOf(actor).filter(readyToReroll).map((item) => ({ actor, item })));
}

/**
 * Whether anybody making a joint Attack could roll its whole pool again, as
 * poolRerollers finds them, stopping at the first.
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {{owned?: boolean}} [options]
 * @returns {boolean}
 */
export const hasPoolReroller = (attack, options) => attackingActors(attack, options).some((actor) => poolRerollsOf(actor).some(readyToReroll));

/**
 * The number a Knight's rune could turn on this card: the one it's etched
 * for, where a die shows it, with turns left (p100).
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {Item} item One of their Abilities with a sigil.
 * @returns {number|null}
 */
function sigilTurns(attack, item) {
	const number = etchedNumber(item.system);
	return number !== null && diceShowing(attack, number).length ? number : null;
}

/**
 * A Knight's Abilities with a sigil.
 * @param {Actor} actor
 * @returns {Item[]}
 */
const sigilsOf = (actor) => abilitiesWith(actor.items.contents, "sigil");

/**
 * The Knights whose rune could turn one of a card's dice: etched for a number
 * one of them shows, with turns left (p100). Any die, whoever rolled it.
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {{owned?: boolean}} [options] `owned`: only Knights this user owns, so nobody else's items are scanned.
 * @returns {{actor: Actor, item: Item, number: number}[]}
 */
export function sigilHolders(attack, options) {
	return worldKnights(askable(options)).flatMap((actor) => sigilsOf(actor).flatMap((item) => {
		const number = sigilTurns(attack, item);
		return number === null ? [] : [{ actor, item, number }];
	}));
}

/**
 * Whether any Knight's rune could turn one of a card's dice, as sigilHolders
 * finds them, stopping at the first.
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {{owned?: boolean}} [options]
 * @returns {boolean}
 */
export const hasSigilHolder = (attack, options) => worldKnights(askable(options)).some((actor) => sigilsOf(actor).some((item) => sigilTurns(attack, item) !== null));
