/**
 * Attack dice (Attacks p8, Gambits p10). Pure so the dice arithmetic can be
 * tested without Foundry.
 */

import { GAMBITS } from "../config.js";

/** Die sizes offered for shields, bonuses and Scars. */
export const DIE_SIZES = Object.freeze([4, 6, 8, 10, 12]);

/** Dice showing this or higher may be discarded to perform a Gambit. */
export const GAMBIT_MINIMUM = 4;

/** A melee die showing this or higher performs a Strong Gambit. */
export const STRONG_GAMBIT_MINIMUM = 8;

/** Being dismounted causes d6 Damage, added to the dice when it happens in combat (p10). */
export const DISMOUNT_FACES = 6;

/** Gambits the target gets no VIG Save to ignore. */
export const UNSAVED_GAMBITS = Object.freeze(["bolster", "move"]);

/** A Strong Gambit adds one of these: No Save for the target, or a Greater effect. */
export const STRONG_GAMBITS = Object.freeze(["noSave", "greater"]);

/** A specialist weapon's extra die, gained in one situation (Specialist Weapons, p12). */
export const SPECIALIST_DICE = Object.freeze(["d8", "d10"]);

/**
 * @param {{specialist?: {die: string}}} weapon An item's system data.
 * @returns {string|null} Its specialist die, such as "d10", or null for an ordinary weapon.
 */
export const specialistDie = (weapon) => (SPECIALIST_DICE.includes(weapon?.specialist?.die) ? weapon.specialist.die : null);

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

/** Why a chosen weapon sits out an Attack: Slow after moving (p12), or purely ranged when engaged in melee (p10). */
export const SET_ASIDE_REASONS = Object.freeze(["slow", "ranged"]);

/**
 * Why an Attack can't be made as chosen: Exhausted after moving (p9), charging
 * a spearwall (p10), or more than two hands can hold (p12).
 */
export const ATTACK_REFUSALS = Object.freeze(["exhausted", "spearwall", "hefty", "long"]);

/**
 * @typedef {object} WieldedItem A weapon or shield chosen for an Attack.
 * @property {boolean} [hefty]
 * @property {boolean} [long]
 * @property {boolean} [slow]         Slow weapons are also Long.
 * @property {boolean} [ranged]
 * @property {boolean} [heftyMounted] Counts as Hefty rather than Long when mounted, as a lance does (p12).
 */

/**
 * How an item is held right now. A lance is couched under one arm on horseback.
 * @param {WieldedItem} item
 * @param {boolean} mounted
 * @returns {{hefty: boolean, long: boolean}} `long` includes Slow.
 */
export function heldAs(item, mounted = false) {
	if (mounted && item.heftyMounted) return { hefty: true, long: false };
	return { hefty: Boolean(item.hefty), long: Boolean(item.long || item.slow) };
}

/**
 * Check the weapons and shields chosen for an Attack against the situation
 * (Wielding Weapons p12, Ranged Combat p10, Shieldwalls & Spearwalls p10, Exhausted p9).
 * @param {WieldedItem[]} items
 * @param {object} [situation]
 * @param {boolean} [situation.moved]     Moved this turn.
 * @param {boolean} [situation.engaged]   Began the turn engaged in melee.
 * @param {boolean} [situation.confined]  Fighting in a confined environment.
 * @param {boolean} [situation.exhausted] At VIG 0.
 * @param {boolean} [situation.mounted]   On a steed, so a lance counts as Hefty.
 * @param {boolean} [situation.spearwall] Charged a spearwall this turn.
 * @param {boolean} [situation.hands]     Hold the items to what two hands can wield, as for a Knight.
 *                                        Stat blocks list a creature's attacks without saying how it holds them.
 * @returns {{refusal: string|null, usable: number[], setAside: {index: number, reason: string}[], impaired: boolean}}
 *   `usable` and `setAside` are indexes into `items`. `impaired` is a Long weapon used in a confined space.
 */
export function checkWielding(items, { moved = false, engaged = false, confined = false, exhausted = false, mounted = false, spearwall = false, hands = false } = {}) {
	const usable = [];
	const setAside = [];
	items.forEach((item, index) => {
		if (item.slow && moved) setAside.push({ index, reason: "slow" });
		else if (item.ranged && engaged) setAside.push({ index, reason: "ranged" });
		else usable.push(index);
	});

	const isLong = (item) => heldAs(item, mounted).long;
	let refusal = null;
	if (exhausted && moved) refusal = "exhausted";
	// Enemies of a spearwall can't Attack on the turn that they charge.
	else if (spearwall) refusal = "spearwall";
	else if (hands && items.filter((item) => heldAs(item, mounted).hefty).length > 1) refusal = "hefty";
	else if (hands && items.length > 1 && items.some(isLong)) refusal = "long";

	return { refusal, usable, setAside, impaired: confined && usable.some((index) => isLong(items[index])) };
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

/**
 * @typedef {object} AttackDie
 * @property {number} faces
 * @property {number} result
 * @property {string} label
 * @property {string|null} deniedBy Name of whoever discarded it with Deny.
 *
 * @typedef {object} Gambit
 * @property {string} key         One of GAMBITS.
 * @property {number|null} die    Index of the die spent on it, or null when Focus paid instead.
 * @property {string|null} strong One of STRONG_GAMBITS.
 * @property {number|null} bonus  The d6 a Dismount adds to the dice.
 *
 * @typedef {object} AttackState What an Attack card remembers between clicks.
 * @property {AttackDie[]} dice
 * @property {boolean} melee
 * @property {boolean} impaired
 * @property {Gambit[]} gambits
 * @property {{key: string, actor: string}[]} feats Feats used after the roll, by actor UUID.
 * @property {string[]} appliedTo Who the Damage was applied to. Once set, the Attack is settled.
 */

/**
 * Highest first, so the card reads left to right the way Damage is taken.
 * Between equal results the larger die comes first, since it would be the
 * one that causes a Scar.
 * @param {AttackDie[]} dice
 * @returns {AttackDie[]}
 */
export function sortDice(dice) {
	return [...dice].sort((a, b) => b.result - a.result || b.faces - a.faces);
}

/**
 * @param {AttackState} attack
 * @param {number} index
 * @returns {boolean} Whether Deny or a Gambit has discarded the die.
 */
export function isDieSpent(attack, index) {
	return Boolean(attack.dice[index]?.deniedBy) || attack.gambits.some((gambit) => gambit.die === index);
}

/**
 * @param {AttackState} attack
 * @param {number} index
 * @returns {boolean}
 */
export function canFundGambit(attack, index) {
	const die = attack.dice[index];
	return Boolean(die) && !isDieSpent(attack, index) && die.result >= GAMBIT_MINIMUM;
}

/**
 * @param {AttackState} attack
 * @param {number} index
 * @returns {boolean}
 */
export function canFundStrongGambit(attack, index) {
	return attack.melee && canFundGambit(attack, index) && attack.dice[index].result >= STRONG_GAMBIT_MINIMUM;
}

/**
 * The Damage an Attack causes before Armour: the highest die left after Deny
 * and Gambits, including any d6 a Dismount added, plus 1 for each Bolster (p8).
 * @param {AttackState} attack
 * @returns {{highest: number, bolster: number, damage: number, die: number|null, faces: number|null}}
 *   `die` is the index of the rolled die that counts, null when none is left or
 *   a Dismount's d6 is higher. `faces` is the size of the die that counts,
 *   which is the die to roll if it causes a Scar.
 */
export function attackDamage(attack) {
	let die = null;
	attack.dice.forEach((candidate, index) => {
		if (isDieSpent(attack, index)) return;
		if (die === null || candidate.result > attack.dice[die].result) die = index;
	});
	let highest = die === null ? 0 : attack.dice[die].result;
	let faces = die === null ? null : attack.dice[die].faces;
	for (const { bonus } of attack.gambits) {
		if (bonus > highest) {
			highest = bonus;
			faces = DISMOUNT_FACES;
			die = null;
		}
	}
	const bolster = attack.gambits.filter((gambit) => gambit.key === "bolster").length;
	return { highest, bolster, damage: highest + bolster, die, faces };
}

/**
 * @param {{key: string, bonus?: number}} change
 * @returns {number|null} The d6 a Dismount Gambit adds, or null for any other Gambit.
 */
const dismountBonus = ({ key, bonus }) =>
	(key === "dismount" && Number.isInteger(bonus) && bonus >= 1 && bonus <= DISMOUNT_FACES ? bonus : null);

/**
 * Each Feat can only be used once per Attack by each combatant (p10).
 * @param {AttackState} attack
 * @param {string} key
 * @param {string} actor Actor UUID.
 * @returns {boolean}
 */
export function hasUsedFeat(attack, key, actor) {
	return attack.feats.some((feat) => feat.key === key && feat.actor === actor);
}

/**
 * Apply one change to an Attack card, returning the new state, or null for a
 * change the Attack doesn't allow, such as spending a die that's already gone
 * or changing anything once the Damage is applied.
 *
 * - `{type: "gambit", die, key, strong, bonus}` spends a die of 4+ on a Gambit.
 *   A Dismount carries the d6 it adds as `bonus`.
 * - `{type: "withdraw", die}` takes back the Gambit a die was spent on.
 * - `{type: "focus", key, actor, bonus}` performs a Gambit without a die.
 * - `{type: "deny", die, actor, name}` discards any die.
 * - `{type: "applied", names}` settles the Attack.
 *
 * @param {AttackState} attack
 * @param {object} change
 * @returns {AttackState|null}
 */
export function changeAttack(attack, change) {
	if (!attack || attack.appliedTo.length) return null;

	switch (change?.type) {
		case "gambit": {
			if (!GAMBITS.includes(change.key) || !canFundGambit(attack, change.die)) return null;
			const strong = STRONG_GAMBITS.includes(change.strong) && canFundStrongGambit(attack, change.die) ? change.strong : null;
			return { ...attack, gambits: [...attack.gambits, { key: change.key, die: change.die, strong, bonus: dismountBonus(change) }] };
		}
		case "withdraw": {
			const index = attack.gambits.findIndex((gambit) => gambit.die !== null && gambit.die === change.die);
			if (index < 0) return null;
			return { ...attack, gambits: attack.gambits.toSpliced(index, 1) };
		}
		case "focus": {
			// Impaired Attacks can't benefit from Feats (p8).
			if (attack.impaired || !GAMBITS.includes(change.key) || hasUsedFeat(attack, "focus", change.actor)) return null;
			return {
				...attack,
				gambits: [...attack.gambits, { key: change.key, die: null, strong: null, bonus: dismountBonus(change) }],
				feats: [...attack.feats, { key: "focus", actor: change.actor }]
			};
		}
		case "deny": {
			if (!attack.dice[change.die] || isDieSpent(attack, change.die) || hasUsedFeat(attack, "deny", change.actor)) return null;
			return {
				...attack,
				dice: attack.dice.map((die, index) => (index === change.die ? { ...die, deniedBy: change.name } : die)),
				feats: [...attack.feats, { key: "deny", actor: change.actor }]
			};
		}
		case "applied": {
			const names = (change.names ?? []).filter((name) => typeof name === "string" && name);
			return names.length ? { ...attack, appliedTo: names } : null;
		}
		default:
			return null;
	}
}
