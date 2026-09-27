/**
 * Attack dice (Attacks p8, Gambits p10). Pure so the dice arithmetic can be
 * tested without Foundry.
 */

import { GAMBITS } from "../config.js";
import { MARK_GAMBITS } from "./gambit-marks.js";

/** Die sizes offered for shields, bonuses and Scars. */
export const DIE_SIZES = Object.freeze([4, 6, 8, 10, 12]);

/** Dice showing this or higher may be discarded to perform a Gambit. */
export const GAMBIT_MINIMUM = 4;

/** A melee die showing this or higher performs a Strong Gambit. */
export const STRONG_GAMBIT_MINIMUM = 8;

/** Being dismounted causes d6 Damage, added to the dice when it happens in combat (p10). */
export const DISMOUNT_FACES = 6;

/**
 * Whether an Attack card's Dismount Gambit landed: declared, not taken back,
 * and not ignored with a passed Save.
 * @param {{gambits: {key: string, dismissed?: boolean, save?: {passed: boolean}|null}[]}} attack
 * @returns {boolean}
 */
export const dismountLanded = (attack) => attack.gambits.some((gambit) => gambit.key === "dismount" && !gambit.dismissed && !gambit.save?.passed);

/** Gambits the target gets no VIG Save to ignore. */
export const UNSAVED_GAMBITS = Object.freeze(["bolster", "move"]);

/** A Strong Gambit adds one of these: No Save for the target, or a Greater effect. */
export const STRONG_GAMBITS = Object.freeze(["noSave", "greater"]);

/**
 * A specialist weapon's extra die, gained in one situation. The book's rule
 * gives +d8 or +d10 (Specialist Weapons, p12), but some Knights' own weapons
 * carry +d6, such as an axe "+d6 when mounted".
 */
export const SPECIALIST_DICE = Object.freeze(["d6", "d8", "d10"]);

/**
 * @param {{specialist?: {die: string}}} weapon An item's system data.
 * @returns {string|null} Its specialist die, such as "d10", or null for an ordinary weapon.
 */
export const specialistDie = (weapon) => (SPECIALIST_DICE.includes(weapon?.specialist?.die) ? weapon.specialist.die : null);

/** Guards against a typo such as "99d6" flooding the chat card. */
const MAX_DICE_PER_TERM = 10;

const DICE_TERM = /^(\d*)d(\d+)$/i;

/** Dice may be joined however they come to hand: "d6+d12", "d6, d12", "d6 d12". */
const DICE_SEPARATOR = /[+,;]|\s+/;

/**
 * Turn damage notation typed on an item into one entry per die, so "2d6"
 * becomes [6, 6] and "d8" becomes [8]. Unreadable terms are skipped rather
 * than thrown, because the notation is free text.
 * @param {string} notation e.g. "d8", "2d10", "d6+d4", "d6, d12"
 * @returns {number[]} Die sizes.
 */
export function parseDice(notation) {
	const faces = [];
	for (const term of String(notation ?? "").split(DICE_SEPARATOR)) {
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

/** A Knight has two hands, and every weapon or shield fills at least one (p12). */
export const HANDS = 2;

/** Qualities a weapon's other way to fight can have, as its main one can. */
export const ALTERNATE_QUALITIES = Object.freeze(["hefty", "long", "slow", "ranged", "blast"]);

/**
 * Why an Attack can't be made as chosen: Exhausted after moving (p9), charging
 * a spearwall (p10), more than two hands can hold (p12), every weapon chosen
 * sitting out, or Smite with nothing to strike in melee (p10).
 */
export const ATTACK_REFUSALS = Object.freeze(["exhausted", "spearwall", "twoWays", "hefty", "long", "hands", "allSetAside", "smiteRanged"]);

/**
 * @typedef {object} WieldedItem A weapon or shield chosen for an Attack.
 * @property {boolean} [hefty]
 * @property {boolean} [long]
 * @property {boolean} [slow]         Slow weapons are also Long.
 * @property {boolean} [ranged]
 * @property {boolean} [heftyMounted] Counts as Hefty rather than Long when mounted, as a lance does (p12).
 * @property {string} [of]            The weapon it is one way of fighting with, for a weapon fought two ways.
 */

/**
 * How an item is held right now. A lance is couched under one arm on horseback,
 * and a greatlance that is Slow on foot is Hefty, and no longer Slow, mounted.
 * @param {WieldedItem} item
 * @param {boolean} mounted
 * @returns {{hefty: boolean, long: boolean, slow: boolean}} `long` includes Slow.
 */
export function heldAs(item, mounted = false) {
	if (mounted && item.heftyMounted) return { hefty: true, long: false, slow: false };
	return { hefty: Boolean(item.hefty), long: Boolean(item.long || item.slow), slow: Boolean(item.slow) };
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
 * @param {boolean} [situation.smite]     Smite is declared, which only a melee Attack can use.
 * @returns {{refusal: string|null, usable: number[], setAside: {index: number, reason: string}[], impaired: boolean}}
 *   `usable` and `setAside` are indexes into `items`. `impaired` is a Long weapon used in a confined space.
 */
export function checkWielding(items, { moved = false, engaged = false, confined = false, exhausted = false, mounted = false, spearwall = false, hands = false, smite = false } = {}) {
	const usable = [];
	const setAside = [];
	items.forEach((item, index) => {
		if (heldAs(item, mounted).slow && moved) setAside.push({ index, reason: "slow" });
		else if (item.ranged && engaged) setAside.push({ index, reason: "ranged" });
		else usable.push(index);
	});

	const isLong = (item) => heldAs(item, mounted).long;
	let refusal = null;
	if (exhausted && moved) refusal = "exhausted";
	// Enemies of a spearwall can't Attack on the turn that they charge.
	else if (spearwall) refusal = "spearwall";
	// A weapon fought two ways, such as a bolt-guisarme, is fought one way at a time.
	else if (items.some((item, index) => item.of && items.findIndex((other) => other.of === item.of) !== index)) refusal = "twoWays";
	else if (hands && items.filter((item) => heldAs(item, mounted).hefty).length > 1) refusal = "hefty";
	else if (hands && items.length > 1 && items.some(isLong)) refusal = "long";
	// Anything else still takes a hand each, and there are only two.
	else if (hands && items.length > HANDS) refusal = "hands";
	// Weapons chosen and all of them sitting out leave nothing to Attack with,
	// which is not the same as fighting unarmed.
	else if (items.length && !usable.length) refusal = "allSetAside";
	// Smite is used before rolling a melee Attack.
	else if (smite && usable.length && usable.every((index) => items[index].ranged)) refusal = "smiteRanged";

	return { refusal, usable, setAside, impaired: confined && usable.some((index) => isLong(items[index])) };
}

/**
 * The most a weapon or shield could roll, used to choose between items that
 * can't be held together.
 * @param {{damage?: string}} item An item's system data.
 * @returns {number}
 */
const damagePotential = (item) => parseDice(item?.damage).reduce((sum, faces) => sum + faces, 0);

/**
 * Which of the items offered to tick when the Attack dialog opens: as many as
 * the hands allow, the hardest-hitting first. A Knight holding a Long weapon
 * needs both hands for it (p12), so only that weapon opens ticked, of two
 * Hefty items only the better one does, and never more than two items in all.
 * @param {WieldedItem[]} items Each also carrying its `damage` notation.
 * @param {object} [situation]
 * @param {boolean} [situation.mounted] On a steed, so a lance counts as Hefty.
 * @param {boolean} [situation.hands]   Hold the items to what two hands can wield, as for a Knight.
 * @returns {number[]} Indexes into `items`, in the order they were offered.
 */
export function defaultWielded(items, { mounted = false, hands = false } = {}) {
	// Between two items that hit equally hard the one listed first is taken.
	const order = items.map((_item, index) => index)
		.sort((a, b) => damagePotential(items[b]) - damagePotential(items[a]) || a - b);
	const kept = [];
	for (const index of order) {
		const tried = [...kept, index].sort((a, b) => a - b);
		if (checkWielding(tried.map((i) => items[i]), { mounted, hands }).refusal) continue;
		kept.push(index);
	}
	return kept.sort((a, b) => a - b);
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
 * @property {GambitSave|null} save The target's VIG Save against it, or null while it stands unanswered.
 * @property {boolean} dismissed Whether the mark it left on the foe has been cleared by hand.
 * @property {FocusSave|null} [focus] The attacker's CLA Save for a Gambit Focus paid for.
 *
 * @typedef {object} FocusSave
 * @property {string} by       Name of whoever Focused.
 * @property {number} total    What the d20 showed.
 * @property {number} target   The CLA it had to meet.
 * @property {boolean} passed  A failed Save leaves them Fatigued (p10).
 *
 * @typedef {object} GambitSave
 * @property {string} by       Name of whoever Saved.
 * @property {number} total    What the d20 showed.
 * @property {number} target   The VIG it had to meet.
 * @property {boolean} passed  A passed Save ignores the Gambit.
 *
 * @typedef {object} AttackState What an Attack card remembers between clicks.
 * @property {AttackDie[]} dice
 * @property {{combat: string, round: number, turn: number}|null} place Where in a
 *   running Combat's turn order the Attack was rolled, so a Gambit's mark knows
 *   when it lapses. Null when no Combat was running.
 * @property {boolean} melee
 * @property {boolean} impaired
 * @property {string} attacker Actor UUID of whoever rolled it.
 * @property {{uuid: string, name: string}[]} targets The Tokens it was rolled against.
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
 * Foes get a VIG Save against every Gambit but Bolster and Move, unless a
 * Strong Gambit spends its 8+ die to deny them one (p10).
 * @param {Gambit} gambit
 * @returns {boolean}
 */
export const gambitAllowsSave = (gambit) => !UNSAVED_GAMBITS.includes(gambit.key) && gambit.strong !== "noSave";

/**
 * @param {Gambit} gambit
 * @returns {boolean} Whether the target Saved and so ignores it. A Gambit
 *   nobody has Saved against yet counts until they do.
 */
export const gambitIgnored = (gambit) => Boolean(gambit.save?.passed);

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
	for (const gambit of attack.gambits) {
		const { bonus } = gambit;
		if (!gambitIgnored(gambit) && bonus > highest) {
			highest = bonus;
			faces = DISMOUNT_FACES;
			die = null;
		}
	}
	const bolster = attack.gambits.filter((gambit) => gambit.key === "bolster" && !gambitIgnored(gambit)).length;
	return { highest, bolster, damage: highest + bolster, die, faces };
}

/**
 * @param {{key: string, bonus?: number}} change
 * @returns {number|null} The d6 a Dismount Gambit adds, or null for any other Gambit.
 */
const dismountBonus = ({ key, bonus }) =>
	(key === "dismount" && Number.isInteger(bonus) && bonus >= 1 && bonus <= DISMOUNT_FACES ? bonus : null);

/**
 * @param {object} [save] The CLA Save Focus cost, as `{by, total, target, passed}`.
 * @returns {FocusSave|null}
 */
function focusSave(save) {
	if (!Number.isInteger(save?.total) || !Number.isInteger(save?.target)) return null;
	return { by: String(save.by ?? ""), total: save.total, target: save.target, passed: Boolean(save.passed) };
}

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
 * @param {AttackState} attack
 * @returns {boolean} Whether a die is left for Deny to discard.
 */
export function hasDeniableDie(attack) {
	return attack.dice.some((_die, index) => !isDieSpent(attack, index));
}

/**
 * Whether somebody could still Deny one of this Attack's dice (p10): a die is
 * left to discard, the Damage hasn't landed, they aren't the one attacking,
 * they aren't Fatigued, and they haven't already Denied this Attack.
 * @param {AttackState} attack
 * @param {{uuid: string, fatigued?: boolean}} combatant
 * @returns {boolean}
 */
export function canDeny(attack, { uuid, fatigued = false }) {
	if (!attack || attack.appliedTo.length || fatigued) return false;
	if (uuid === attack.attacker || hasUsedFeat(attack, "deny", uuid)) return false;
	return hasDeniableDie(attack);
}

/**
 * Apply one change to an Attack card, returning the new state, or null for a
 * change the Attack doesn't allow, such as spending a die that's already gone
 * or changing anything once the Damage is applied.
 *
 * - `{type: "gambit", die, key, strong, bonus}` spends a die of 4+ on a Gambit.
 *   A Dismount carries the d6 it adds as `bonus`.
 * - `{type: "withdraw", die}` takes back the Gambit a die was spent on.
 * - `{type: "focus", key, actor, bonus, save}` performs a Gambit without a die,
 *   keeping the CLA Save it cost as `save: {by, total, target, passed}`.
 * - `{type: "gambitSave", index, by, total, target, passed}` records the target's VIG Save against one Gambit.
 * - `{type: "deny", die, actor, name}` discards any die.
 * - `{type: "applied", names}` settles the Attack.
 * - `{type: "dismissMark", index}` clears the mark a Gambit left on the foe, which
 *   outlives the Damage, so it is the one change a settled card still takes.
 *
 * @param {AttackState} attack
 * @param {object} change
 * @returns {AttackState|null}
 */
export function changeAttack(attack, change) {
	if (!attack) return null;

	// A mark holds into the turns after the Damage, so it can still be cleared.
	if (change?.type === "dismissMark") {
		const marked = attack.gambits[change.index];
		if (!marked || marked.dismissed || !MARK_GAMBITS.includes(marked.key)) return null;
		return { ...attack, gambits: attack.gambits.map((entry, index) => (index === change.index ? { ...entry, dismissed: true } : entry)) };
	}
	if (attack.appliedTo.length) return null;

	switch (change?.type) {
		case "gambit": {
			if (!GAMBITS.includes(change.key) || !canFundGambit(attack, change.die)) return null;
			const strong = STRONG_GAMBITS.includes(change.strong) && canFundStrongGambit(attack, change.die) ? change.strong : null;
			return { ...attack, gambits: [...attack.gambits, { key: change.key, die: change.die, strong, bonus: dismountBonus(change), save: null, dismissed: false }] };
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
				gambits: [...attack.gambits, { key: change.key, die: null, strong: null, bonus: dismountBonus(change), save: null, dismissed: false, focus: focusSave(change.save) }],
				feats: [...attack.feats, { key: "focus", actor: change.actor }]
			};
		}
		case "gambitSave": {
			const gambit = attack.gambits[change.index];
			// Each Gambit is Saved against once, and only when it offers a Save at all.
			if (!gambit || gambit.save || !gambitAllowsSave(gambit)) return null;
			if (!Number.isInteger(change.total) || !Number.isInteger(change.target)) return null;
			const save = { by: String(change.by ?? ""), total: change.total, target: change.target, passed: Boolean(change.passed) };
			return { ...attack, gambits: attack.gambits.map((entry, index) => (index === change.index ? { ...entry, save } : entry)) };
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
