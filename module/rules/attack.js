/**
 * Attack dice (Attacks p8, Gambits p10). Pure so the dice arithmetic can be
 * tested without Foundry.
 */

import { GAMBITS, WEAKNESS_DICE } from "../config.js";
import { MARK_GAMBITS } from "./gambit-marks.js";
import { harmsStructure } from "./structures.js";

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

/**
 * The Virtues a foe may Save in against a Gambit: VIG as the book has it
 * (p10), or another where the Referee rules so, as a Clarity Save to dodge a
 * stab at the eye (p187).
 */
export const SAVE_VIRTUES = Object.freeze(["vig", "cla", "spi"]);

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
 * Dice joined into one die as big as their faces together, as an Ability may
 * let its Knight do before an Attack with allies: a d4 and a d8 make a d12
 * (p56). Nothing joins past a d12.
 * @param {{faces: number, label: string}[]} dice What would be rolled.
 * @param {number[]} groups The group each die joins, by index; 0 or anything
 *   missing leaves it alone. A group of one is that die alone.
 * @returns {{dice: {faces: number, label: string, joined?: number[]}[], over: number[]}} The dice to
 *   roll, the joined ones after those left alone, each carrying the faces it was made of. `over`
 *   lists the groups that came to more than a d12, or to no die there is, which join nothing.
 */
export function combineDice(dice, groups = []) {
	const byGroup = new Map();
	const alone = [];
	dice.forEach((die, index) => {
		const group = Number(groups[index]) || 0;
		if (group <= 0) alone.push(die);
		else byGroup.set(group, [...(byGroup.get(group) ?? []), die]);
	});
	const joined = [];
	const over = [];
	for (const [group, members] of [...byGroup].sort((a, b) => a[0] - b[0])) {
		if (members.length === 1) {
			alone.push(members[0]);
			continue;
		}
		const faces = members.reduce((sum, die) => sum + die.faces, 0);
		if (!DIE_SIZES.includes(faces)) {
			over.push(group);
			alone.push(...members);
			continue;
		}
		joined.push({ faces, label: members.map((die) => `d${die.faces}`).join("+"), joined: members.map((die) => die.faces) });
	}
	return { dice: [...alone, ...joined], over };
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
 * @property {boolean} [noHand]       Fills no hand, as a bite or a shockwave doesn't.
 * @property {string} [of]            The weapon it is one way of fighting with, for a weapon fought two ways,
 *                                    or the attacks printed with "or" between them that it is one of.
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
	// A bite or a shockwave fills no hand, so only the rest are weighed against two.
	const held = items.filter((item) => !item.noHand);
	let refusal = null;
	if (exhausted && moved) refusal = "exhausted";
	// Charging a spearwall leaves no Attack that turn.
	else if (spearwall) refusal = "spearwall";
	// A weapon fought two ways, such as a spear that can be thrown, is fought one way at a time.
	else if (items.some((item, index) => item.of && items.findIndex((other) => other.of === item.of) !== index)) refusal = "twoWays";
	else if (hands && held.filter((item) => heldAs(item, mounted).hefty).length > 1) refusal = "hefty";
	else if (hands && held.length > 1 && held.some(isLong)) refusal = "long";
	// Anything else still takes a hand each, and there are only two.
	else if (hands && held.length > HANDS) refusal = "hands";
	// Weapons chosen and all of them sitting out leave nothing to Attack with,
	// which is not the same as fighting unarmed.
	else if (items.length && !usable.length) refusal = "allSetAside";
	// Smite is used before rolling a melee Attack.
	else if (smite && usable.length && usable.every((index) => items[index].ranged)) refusal = "smiteRanged";

	return { refusal, usable, setAside, impaired: confined && usable.some((index) => isLong(items[index])) };
}

/** A shield's name, as "kite shield", "redshield" or "bronze buckler". */
const SHIELD_NAME = /shield|buckler/i;

/**
 * Whether an NPC's gear says it holds its weapons in hands (p12): a Hefty,
 * Long or Slow weapon or a shield is held, as the armed Cast's are. Claws,
 * teeth and screams carry no such quality, and are all used at once.
 * @param {{name: string, type: string, system: object}[]} items
 * @returns {boolean}
 */
export function gearHeldInHands(items) {
	return items.some(({ name, type, system }) => {
		if (type === "armour") return system.kind === "shield";
		if (type !== "weapon") return false;
		return Boolean(system.hefty || system.long || system.slow || system.heftyMounted) || SHIELD_NAME.test(name);
	});
}

/**
 * Whether an NPC is held to what two hands can wield, as a Knight is (p12):
 * as its sheet says, or else as its gear does.
 * @param {""|"hands"|"free"} wields
 * @param {{name: string, type: string, system: object}[]} items
 * @returns {boolean}
 */
export function wieldsInHands(wields, items) {
	if (wields === "hands") return true;
	if (wields === "free") return false;
	return gearHeldInHands(items);
}

/**
 * @typedef {object} EitherWeapon A weapon as the "Instead of" choice on a weapon's sheet weighs it.
 * @property {string|null} id Null for one not added yet.
 * @property {string} [name]
 * @property {string} either Shared by attacks printed with "or" between them, or blank.
 */

/** @param {EitherWeapon} weapon @returns {string} What the attacks used instead of it would share. */
const eitherKey = (weapon) => weapon.either || weapon.id;

/**
 * What a weapon's sheet offers it to be used instead of: each other attack,
 * or each set of attacks already one or the other, as "Pound or sweep".
 * @param {EitherWeapon} self
 * @param {EitherWeapon[]} others Its actor's other weapons.
 * @returns {{options: {key: string, label: string}[], selected: string}} `selected` is blank
 *   when it joins the others, as it does unless one of them shares its mark.
 */
export function insteadOfOptions(self, others) {
	const groups = new Map();
	for (const weapon of others) {
		const key = eitherKey(weapon);
		groups.set(key, [...(groups.get(key) ?? []), weapon.name]);
	}
	const options = [...groups].map(([key, names]) => ({ key, label: names.join(" or ") }));
	return { options, selected: self.either && groups.has(self.either) ? self.either : "" };
}

/**
 * What picking which attack a weapon is used instead of changes: its own mark,
 * and the one picked, which starts a set of its own if it wasn't in one. A set
 * left with a single attack in it is no set any more.
 * @param {EitherWeapon} self
 * @param {EitherWeapon[]} others Its actor's other weapons.
 * @param {string} pick A key from insteadOfOptions, or blank to join the others.
 * @returns {{either: string, others: {_id: string, "system.either": string}[]}} Its new mark, and item updates.
 */
export function insteadOfChanges(self, others, pick) {
	const updates = others
		.filter((weapon) => pick && !weapon.either && weapon.id === pick)
		.map((weapon) => ({ _id: weapon.id, "system.either": pick }));
	if (self.either && self.either !== pick) {
		const left = others.filter((weapon) => weapon.either === self.either);
		if (left.length === 1) updates.push({ _id: left[0].id, "system.either": "" });
	}
	return { either: pick, others: updates };
}

/**
 * Whether a steed's trample joins a charge at these targets (p10): only
 * enemies on foot are trampled, so not a rider, a ship or a wall. With no
 * target known, the charging player's word is taken.
 * @param {{mounted?: boolean, structure?: boolean}[]} targets
 * @returns {boolean}
 */
export function trampleJoins(targets) {
	return !targets.length || targets.some(({ mounted = false, structure = false }) => !mounted && !structure);
}

/**
 * Whether somebody struck at is an individual: one person or beast, not a
 * Warband, a swarm or a ship or wall (p11, p61).
 * @param {{warband?: boolean, swarm?: boolean, structure?: boolean}} target
 * @returns {boolean}
 */
export const isIndividual = ({ warband = false, swarm = false, structure = false }) => !warband && !swarm && !structure;

/**
 * Whether a Warband's Attack at these targets is one at individuals, which
 * gets +d12 and causes Blast Damage (p11, p189).
 * @param {{warband?: boolean, swarm?: boolean, structure?: boolean}[]} targets
 * @returns {boolean|null} Null with nobody targeted, when only the Referee can say.
 */
export function atIndividuals(targets) {
	return targets.length ? targets.every(isIndividual) : null;
}

/**
 * Whether a card is Impaired for striking at a swarm, which one person's Attack
 * only harms Impaired unless it's a Blast (p61). A Warband's Attack
 * is no individual's, so it isn't.
 * @param {{blast?: boolean, largeScale?: boolean}} attack
 * @param {{swarm?: boolean}[]} targets The card's targets.
 * @returns {boolean}
 */
export function swarmImpairs({ blast = false, largeScale = false }, targets) {
	return !blast && !largeScale && targets.some(({ swarm = false }) => swarm);
}

/**
 * A foe's weakness once the Knights have learned it, which gives every Attack
 * that uses it a bonus die (p188). One nobody knows of yet gives nothing, and
 * isn't shown to whoever attacks.
 * @param {object} [system] An actor's system data.
 * @returns {{text: string, die: string}|null}
 */
export function knownWeakness(system) {
	const weakness = system?.weakness;
	if (!weakness?.known || !WEAKNESS_DICE.includes(weakness.die)) return null;
	return { text: String(weakness.text ?? "").trim(), die: weakness.die };
}

/**
 * The die an Attack gains from the weaknesses it uses. A card at several foes
 * gets one bonus, not one for each, so the biggest die stands for them all.
 * @param {{die: string}[]} weaknesses
 * @returns {number|null} The die's faces, or null for none.
 */
export function weaknessFaces(weaknesses) {
	const faces = weaknesses.flatMap(({ die }) => parseDice(die));
	return faces.length ? Math.max(...faces) : null;
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
 * What fills no hand, such as a bite, is a blow of its own and opens unticked.
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
		if (hands && items[index].noHand) continue;
		const tried = [...kept, index].sort((a, b) => a - b);
		if (checkWielding(tried.map((i) => items[i]), { mounted, hands }).refusal) continue;
		kept.push(index);
	}
	return kept.sort((a, b) => a - b);
}

/**
 * @typedef {object} AttackDie
 * @property {number} faces
 * @property {number} result
 * @property {string} label
 * @property {string|null} deniedBy Name of whoever discarded it with Deny.
 * @property {string} [item]    Id of the weapon it was rolled for, on the dice of the roller's own weapons.
 * @property {boolean} [weakness] Added for a known weakness, which a joint Attack gets once (p188).
 * @property {string} [actor]   UUID of whoever rolled it, once others have joined the Attack.
 * @property {string} [by]      Their name, which labels it on the card.
 * @property {boolean} [melee]  Whether it came from a melee Attack, which only can make a Strong Gambit.
 * @property {boolean} [ignoresArmour] Whether the Attack it came from ignores Armour.
 * @property {boolean} [nonLethal] Whether that Attack never Slays.
 * @property {boolean} [blast]     Whether it was a Blast, which harms a Warband (p11).
 * @property {boolean} [largeScale] Whether it was a Warband's, which harms a Warband.
 * @property {object|null} [structureHarm] What in it harms a structure, from structureHarm.
 * @property {boolean} [drain]  Whether its maker takes back the VIG a Wound from it costs the target.
 * @property {boolean} [spirit] Whether its Damage comes off SPI rather than VIG.
 * @property {{by: string, from: number}} [adjusted] Turned to another face after the roll, by whose rune, from what.
 *
 * @typedef {object} Gambit
 * @property {string} key         One of GAMBITS.
 * @property {number|null} die    Index of the die spent on it, or null when Focus paid instead.
 * @property {string|null} strong One of STRONG_GAMBITS.
 * @property {number|null} bonus  The d6 a Dismount adds to the dice.
 * @property {GambitSave|null} save The target's VIG Save against it, or null while it stands unanswered.
 * @property {boolean} dismissed Whether the mark it left on the foe has been cleared by hand.
 * @property {FocusSave|null} [focus] The attacker's CLA Save for a Gambit Focus paid for.
 * @property {string} [greater] What its Greater effect did, once carried out.
 * @property {ImpairedWeapon} [weapon] The one weapon an Impair holds, as p186's crocodile has its jaw
 *   Impaired. Without one it holds the foe's whole next Attack.
 * @property {string|null} [payer] UUID of whoever Focused for it. A die's Gambit is paid by whoever rolled the die.
 *
 * @typedef {object} ImpairedWeapon
 * @property {string} id    The item's id on the foe's sheet.
 * @property {string} name  Its name, which also finds it on a Token's copy of the foe.
 * @property {string|null} actor UUID of the foe who holds it, for a card aimed at several.
 *
 * @typedef {object} JoinedAttacker Somebody who rolled into another's Attack (p8).
 * @property {string} actor  Their UUID.
 * @property {string} name
 * @property {boolean} impaired Whether their share was Impaired, and so can't benefit from Feats.
 * @property {boolean} confined A Long weapon in a confined space is why.
 * @property {boolean} swarm    Striking at a swarm without a Blast is why.
 * @property {string|null} impairedWeapon A foe's Impair on this weapon of theirs is why.
 * @property {object|null} smite The Smite they declared, as the card shows it.
 * @property {boolean} smiteMark Whether they Smote for a lasting mark.
 * @property {{name: string, reason: string}[]} setAside
 * @property {{uuid: string, name: string}|null} [leader] Whoever leads a joining Warband from the front.
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
 * @property {JoinedAttacker[]} [joined] Those who joined the Attack, rolling with the attacker (p8).
 * @property {boolean} [declared] Whether a Deny, Gambit or Focus has been declared, which closes it to joiners.
 * @property {boolean} [alone]    Made alone, as an Ability may say, so nobody joins it.
 * @property {{by: string}|null} [rerolled] Who rolled the whole pool again, which is done once (p62).
 * @property {string[]} [shattered] What the Attack broke as it landed, as a lance a charge shatters (p92).
 * @property {string[]} [onWound] What a Wound from it does besides, from ON_WOUND (p166).
 */

/** What a Wound can do besides its Damage, said on the card and once it lands: normal sleep, or a memory shown (p166). */
export const ON_WOUND = Object.freeze(["sleep", "memory"]);

/**
 * Whoever rolled into an Attack card: the attacker, and each who joined them (p8).
 * @param {AttackState} attack
 * @returns {string[]} Actor UUIDs.
 */
export const attackersOf = (attack) => [attack.attacker, ...(attack.joined ?? []).map((entry) => entry.actor)].filter(Boolean);

/**
 * @param {AttackState} attack
 * @param {string} uuid
 * @returns {boolean} Whether this actor is one of those making the Attack.
 */
export const isAttacker = (attack, uuid) => attackersOf(attack).includes(uuid);

/**
 * Whether an attacker's share of the Attack was Impaired, so they can't
 * benefit from Feats (p8). Anybody who didn't join is read as the attacker.
 * @param {AttackState} attack
 * @param {string} uuid
 * @returns {boolean}
 */
export function attackerImpaired(attack, uuid) {
	const joined = (attack.joined ?? []).find((entry) => entry.actor === uuid);
	return Boolean(joined ? joined.impaired : attack.impaired);
}

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
 * @returns {string} The Virtue the foe Saves in against it, one of SAVE_VIRTUES.
 */
export const gambitSaveVirtue = (gambit) => (SAVE_VIRTUES.includes(gambit?.saveIn) ? gambit.saveIn : SAVE_VIRTUES[0]);

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
	if (!canFundGambit(attack, index)) return false;
	// In a joint Attack each die is melee or not as its own attacker's was. An Ability may make
	// every Gambit from its maker's dice Strong, whatever they show.
	const share = shareOf(attack, attack.dice[index]);
	return share.strongGambits || (share.melee && attack.dice[index].result >= STRONG_GAMBIT_MINIMUM);
}

/**
 * Whether a Gambit bought with this attacker's Focus may be Strong: an Ability
 * declared for their share of the Attack makes it so.
 * @param {AttackState} attack
 * @param {string} actor The uuid of whoever Focuses.
 * @returns {boolean}
 */
export function focusCanBeStrong(attack, actor) {
	return attack.dice.some((die) => (die.actor ?? attack.attacker) === actor && shareOf(attack, die).strongGambits);
}

/**
 * The Damage an Attack causes before Armour: the highest die left after Deny
 * and Gambits, including any d6 a Dismount added, plus 1 for each Bolster (p8).
 * @param {AttackState} attack
 * @param {((share: ReturnType<typeof shareOf>) => boolean)|null} [counts] Which shares' dice
 *   may count, for a target only some of a joint Attack can harm.
 * @returns {{highest: number, bolster: number, damage: number, die: number|null, faces: number|null}}
 *   `die` is the index of the rolled die that counts, null when none is left or
 *   a Dismount's d6 is higher. `faces` is the size of the die that counts,
 *   which is the die to roll if it causes a Scar.
 */
export function attackDamage(attack, counts = null) {
	let die = null;
	attack.dice.forEach((candidate, index) => {
		if (isDieSpent(attack, index)) return;
		// In a joint Attack, dice from a share that can't harm the target don't count against it.
		if (counts && !counts(shareOf(attack, candidate))) return;
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
 * What a die's share of the Attack was made with: the joiner's own, once
 * others have joined it, and the card's for a die rolled by one attacker alone.
 * @param {AttackState} attack
 * @param {AttackDie|null} die Null for the card as a whole.
 * @returns {{melee: boolean, ignoresArmour: boolean, nonLethal: boolean, blast: boolean, largeScale: boolean,
 *   drain: boolean, spirit: boolean, structureHarm: object|null}}
 */
export function shareOf(attack, die) {
	return {
		melee: Boolean(die?.melee ?? attack.melee),
		ignoresArmour: Boolean(die?.ignoresArmour ?? attack.ignoresArmour),
		nonLethal: Boolean(die?.nonLethal ?? attack.nonLethal),
		strongGambits: Boolean(die?.strongGambits ?? attack.strongGambits),
		blast: Boolean(die?.blast ?? attack.blast),
		largeScale: Boolean(die?.largeScale ?? attack.largeScale),
		// Its maker takes back the VIG a Wound costs, or it harms SPI rather than VIG, as Abilities may say.
		drain: Boolean(die?.drain ?? attack.drain),
		spirit: Boolean(die?.spirit ?? attack.spirit),
		// A share stamped with none harms no structure, whatever the whole card could.
		structureHarm: (die && "structureHarm" in die ? die.structureHarm : attack.structureHarm) ?? null
	};
}

/** Why a share's dice can't harm a target: a Warband, a structure, or a stone wall (p11). */
export const HARM_BARS = Object.freeze(["warband", "structure", "stone"]);

/**
 * @param {object} system A target's system data.
 * @returns {{warband: boolean, structure: boolean, stone: boolean}} What only some Attacks can harm, as harmBarred and damageAgainst read it.
 */
export const harmTargetOf = (system) => ({
	warband: system?.scale === "warband",
	structure: Boolean(system?.structure),
	stone: Boolean(system?.stone)
});

/**
 * Why one share of an Attack can't harm a target (p11): a Warband is harmed
 * only by Blast or large-scale Attacks, a structure only by fire, siege
 * weapons or large creatures, and a stone wall only by siege weapons.
 * @param {ReturnType<typeof shareOf>} share
 * @param {{warband?: boolean, structure?: boolean, stone?: boolean}} [target]
 * @returns {string|null} One of HARM_BARS, or null when it can harm them.
 */
export function harmBarred(share, { warband = false, structure = false, stone = false } = {}) {
	if (warband && !(share.blast || share.largeScale)) return "warband";
	if (structure && !harmsStructure(share.structureHarm, stone)) return stone ? "stone" : "structure";
	return null;
}

/**
 * The Damage an Attack deals to one target, and what the Damage dialog weighs
 * with it. A Warband is harmed only by Blast or large-scale Attacks, and a
 * structure only by fire, siege weapons or large creatures, or stone by siege
 * weapons alone (p11), so in a joint Attack only the dice of shares that can
 * harm the target count against it. Whether cover counts (a ranged Attack,
 * p10), Armour is ignored or the blow can't Slay follows the die that counts.
 * When no share can harm them, the whole Attack is weighed and the dialog finds them unharmed.
 * @param {AttackState} attack
 * @param {{warband?: boolean, structure?: boolean, stone?: boolean}} [target]
 * @returns {ReturnType<typeof attackDamage> & {ranged: boolean, ignoresArmour: boolean,
 *   nonLethal: boolean, drain: boolean, spirit: boolean, harm: {warband: boolean, structure: boolean},
 *   unharmed: boolean, dealer: string}}
 */
export function damageAgainst(attack, { warband = false, structure = false, stone = false } = {}) {
	const harmsWarband = (share) => share.blast || share.largeScale;
	const harmsIt = (share) => harmsStructure(share.structureHarm, stone);
	const canHarm = (share) => !harmBarred(share, { warband, structure, stone });
	const shares = attack.dice.map((die) => shareOf(attack, die));
	const anyHarms = shares.some(canHarm);
	const counted = attackDamage(attack, anyHarms ? canHarm : null);
	const share = shareOf(attack, counted.die === null ? null : attack.dice[counted.die]);
	return {
		...counted,
		ranged: !share.melee,
		ignoresArmour: share.ignoresArmour,
		nonLethal: share.nonLethal,
		drain: share.drain,
		spirit: share.spirit,
		harm: { warband: shares.some(harmsWarband), structure: shares.some(harmsIt) },
		// Nobody's share can harm them at all.
		unharmed: !anyHarms,
		dealer: (counted.die !== null && attack.dice[counted.die].actor) || attack.attacker
	};
}

/**
 * Whether others may still join an Attack card (p8): everybody attacking the
 * same target rolls at the same time, before any Deny or Gambit, so once one
 * is declared the roll is closed. Never a duel's blow, nor a settled Attack.
 * @param {AttackState|null} attack
 * @returns {boolean}
 */
export function canJoin(attack) {
	if (!attack || attack.appliedTo.length || attack.duel || attack.declared || attack.alone) return false;
	// Cards from before `declared` was kept still show what was declared on them.
	return !attack.gambits.length && !attack.feats.length && !attack.dice.some((die) => die.deniedBy);
}

/**
 * Whether the whole pool of a joint Attack may still be rolled again, as an
 * Ability carried into a group Attack lets its Knight do once (p62): others
 * have joined, the dice haven't been rolled again already, and nothing has
 * been spent or declared on them yet, since all of it would be on dice gone.
 * @param {AttackState|null} attack
 * @returns {boolean}
 */
export function canReroll(attack) {
	if (!attack || attack.appliedTo.length || attack.rerolled || !attack.joined?.length) return false;
	return !attack.gambits.length && !attack.feats.length && !attack.dice.some((die) => die.deniedBy || die.adjusted);
}

/**
 * The dice on a card a rune for this number could turn (p100): those showing
 * it, not yet spent, and only while the Damage hasn't landed.
 * @param {AttackState|null} attack
 * @param {number|null} number
 * @returns {number[]} Indexes into the card's dice.
 */
export function diceShowing(attack, number) {
	if (!attack || attack.appliedTo.length || !Number.isInteger(number)) return [];
	return attack.dice.flatMap((die, index) => (die.result === number && !isDieSpent(attack, index) ? [index] : []));
}

/**
 * @param {number} value The face a die is to be turned to.
 * @param {number} faces How many faces it has.
 * @param {number} from What it shows now.
 * @returns {boolean} Whether it can be turned there: another of its own faces (p100).
 */
export const canTurnDie = (value, faces, from) => Number.isInteger(value) && value >= 1 && value <= faces && value !== from;

/**
 * New dice for a card, sorted highest first again, with each Gambit still on
 * the die that paid for it.
 * @param {AttackState} attack
 * @param {AttackDie[]} dice In the card's order, some of them changed.
 * @returns {AttackState}
 */
function withDiceSorted(attack, dice) {
	const order = dice.map((_die, index) => index)
		.sort((a, b) => dice[b].result - dice[a].result || dice[b].faces - dice[a].faces || a - b);
	const moved = new Map(order.map((from, to) => [from, to]));
	return {
		...attack,
		dice: order.map((index) => dice[index]),
		gambits: attack.gambits.map((gambit) => (gambit.die === null ? gambit : { ...gambit, die: moved.get(gambit.die) }))
	};
}

/**
 * @param {object} entry A weapon whose Damage keeps on, as a change brings it.
 * @returns {boolean} Whether it reads as one: a name, its dice, and each round or each day.
 */
const lingerEntry = (entry) => typeof entry?.name === "string" && typeof entry.damage === "string" && ["round", "day"].includes(entry.when);

/**
 * Who Smote for a lasting mark on this Attack (p187): the attacker, or the
 * first who joined them to do so.
 * @param {AttackState} attack
 * @returns {string|null} Their name, or null when nobody did.
 */
export function lastingMarkBy(attack) {
	if (attack.smiteMark) return attack.attackerName ?? "";
	return (attack.joined ?? []).find((entry) => entry.smiteMark)?.name ?? null;
}

/**
 * @param {{key: string, bonus?: number}} change
 * @returns {number|null} The d6 a Dismount Gambit adds, or null for any other Gambit.
 */
const dismountBonus = ({ key, bonus }) =>
	(key === "dismount" && Number.isInteger(bonus) && bonus >= 1 && bonus <= DISMOUNT_FACES ? bonus : null);

/**
 * The one weapon an Impair Gambit names (p10, p186), kept on the Gambit.
 * @param {{key: string, weapon?: object}} change
 * @returns {{weapon?: ImpairedWeapon}} Nothing for any other Gambit, or an Impair on the foe's whole next Attack.
 */
function impairedWeaponOf({ key, weapon }) {
	const name = typeof weapon?.name === "string" ? weapon.name.trim() : "";
	if (key !== "impair" || typeof weapon?.id !== "string" || !weapon.id || !name) return {};
	return { weapon: { id: weapon.id, name, actor: typeof weapon.actor === "string" && weapon.actor ? weapon.actor : null } };
}

/**
 * @param {object} die A die as a change brings it.
 * @returns {boolean} Whether it's a die that was really rolled.
 */
const rolledDie = (die) => Number.isInteger(die?.faces) && die.faces > 0 && Number.isInteger(die.result)
	&& die.result >= 1 && die.result <= die.faces && typeof die.label === "string";

/**
 * @param {object|null|undefined} a From structureHarm.
 * @param {object|null|undefined} b
 * @returns {object|null} What harms a structure in either.
 */
function eitherHarm(a, b) {
	if (!a || !b) return a ?? b ?? null;
	return { siege: Boolean(a.siege || b.siege), fire: Boolean(a.fire || b.fire), large: Boolean(a.large || b.large) };
}

/**
 * Pool another combatant's dice into an Attack card, since everybody
 * attacking the same target rolls at the same time (p8). Each die remembers
 * who rolled it and how, the dice are sorted highest first again, and the
 * Gambits and Denials made so far follow their dice.
 * @param {AttackState} attack
 * @param {object} change See changeAttack's `join`.
 * @returns {AttackState|null}
 */
function joinAttack(attack, change) {
	const dice = Array.isArray(change.dice) ? change.dice.filter(rolledDie) : [];
	// All roll before any Deny or Gambit, a duel is fought one on one, and each combatant rolls into an Attack once.
	if (!canJoin(attack) || typeof change.actor !== "string" || !change.actor || isAttacker(attack, change.actor) || !dice.length) return null;
	const name = String(change.name ?? "");
	const stamp = (die, who) => ({ ...who, ...die });
	// Each die carries its own share's traits, so what depends on the Damage follows the die that counts.
	const first = { actor: attack.attacker, by: attack.attackerName ?? "", ...shareOf(attack, null) };
	const joiner = {
		actor: change.actor,
		by: name,
		melee: Boolean(change.melee),
		ignoresArmour: Boolean(change.ignoresArmour),
		nonLethal: Boolean(change.nonLethal),
		strongGambits: Boolean(change.strongGambits),
		blast: Boolean(change.blast),
		largeScale: Boolean(change.largeScale),
		drain: Boolean(change.drain),
		spirit: Boolean(change.spirit),
		structureHarm: change.structureHarm && typeof change.structureHarm === "object" ? change.structureHarm : null
	};
	// A die keeps the weapon it was rolled for, so a foe can Impair what the joiner showed (p186).
	const fresh = dice.map(({ faces, result, label, weakness, item }) => ({
		faces,
		result,
		label,
		deniedBy: null,
		...(typeof item === "string" && item ? { item } : {}),
		...(weakness ? { weakness: true } : {})
	}));
	const pooled = [...attack.dice.map((die) => stamp(die, first)), ...fresh.map((die) => stamp(die, joiner))];
	const setAside = (Array.isArray(change.setAside) ? change.setAside : [])
		.filter((entry) => typeof entry?.name === "string" && typeof entry.reason === "string")
		.map(({ name: item, reason }) => ({ name: item, reason }));
	const notes = (Array.isArray(change.notes) ? change.notes : [])
		.filter((entry) => typeof entry?.name === "string" && typeof entry.note === "string")
		.map(({ name: item, note }) => ({ name: item, note }));
	return {
		...withDiceSorted(attack, pooled),
		// What the card says of the whole: ranged if any of it is, a Blast if any of it is. The
		// Damage itself is weighed by the die that counts (damageAgainst).
		melee: Boolean(attack.melee && joiner.melee),
		blast: Boolean(attack.blast || joiner.blast),
		largeScale: Boolean(attack.largeScale || joiner.largeScale),
		structureHarm: eitherHarm(attack.structureHarm, joiner.structureHarm),
		nonLethal: Boolean(attack.nonLethal && joiner.nonLethal),
		notes: [...(attack.notes ?? []), ...notes],
		lingers: [...(attack.lingers ?? []), ...(Array.isArray(change.lingers) ? change.lingers.filter(lingerEntry) : [])],
		shattered: [...(attack.shattered ?? []), ...(Array.isArray(change.shattered) ? change.shattered.filter((name) => typeof name === "string") : [])],
		onWound: [...new Set([...(attack.onWound ?? []), ...(Array.isArray(change.onWound) ? change.onWound.filter((key) => ON_WOUND.includes(key)) : [])])],
		joined: [...(attack.joined ?? []), {
			actor: change.actor,
			name,
			impaired: Boolean(change.impaired),
			confined: Boolean(change.confined),
			swarm: Boolean(change.swarm),
			impairedWeapon: typeof change.impairedWeapon === "string" && change.impairedWeapon ? change.impairedWeapon : null,
			smite: change.smite && typeof change.smite === "object" ? change.smite : null,
			smiteMark: Boolean(change.smiteMark),
			setAside,
			// Whoever leads a joining Warband from the front (p11).
			leader: typeof change.leader?.uuid === "string" && typeof change.leader.name === "string" ? { uuid: change.leader.uuid, name: change.leader.name } : null
		}]
	};
}

/**
 * @param {object} [save] The CLA Save Focus cost, as `{by, total, target, passed}`.
 * @returns {FocusSave|null}
 */
function focusSave(save) {
	if (!Number.isInteger(save?.total) || !Number.isInteger(save?.target)) return null;
	return { by: String(save.by ?? ""), total: save.total, target: save.target, passed: Boolean(save.passed) };
}

/**
 * No combatant uses the same Feat twice in one Attack (p10).
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
 * left to discard, the Damage hasn't landed, they aren't one of those
 * attacking, they aren't Fatigued, Slain or dying, and they haven't already
 * Denied this Attack.
 * @param {AttackState} attack
 * @param {{uuid: string, fatigued?: boolean, down?: boolean}} combatant `down` while Slain or Mortally Wounded.
 * @returns {boolean}
 */
export function canDeny(attack, { uuid, fatigued = false, down = false }) {
	if (!attack || attack.appliedTo.length || fatigued || down) return false;
	if (isAttacker(attack, uuid) || hasUsedFeat(attack, "deny", uuid)) return false;
	return hasDeniableDie(attack);
}

/**
 * Apply one change to an Attack card, returning the new state, or null for a
 * change the Attack doesn't allow, such as spending a die that's already gone
 * or changing anything once the Damage is applied.
 *
 * - `{type: "gambit", die, key, strong, bonus, weapon}` spends a die of 4+ on a Gambit.
 *   A Dismount carries the d6 it adds as `bonus`, and an Impair the one weapon
 *   it holds as `weapon: {id, name, actor}`, or none for the foe's whole next Attack.
 * - `{type: "withdraw", die}` takes back the Gambit a die was spent on.
 * - `{type: "focus", key, actor, bonus, save, weapon}` performs a Gambit without a die,
 *   keeping the CLA Save it cost as `save: {by, total, target, passed}`.
 * - `{type: "join", actor, name, dice, melee, impaired, leader, ...}` pools another
 *   combatant's dice into the Attack (p8), with what the card says of their share.
 *   Only before any Deny, Gambit or Focus is declared (canJoin).
 * - `{type: "gambitSave", index, by, total, target, passed}` records the target's VIG Save against one Gambit.
 * - `{type: "deny", die, actor, name}` discards any die.
 * - `{type: "applied", names}` settles the Attack.
 * - `{type: "dismissMark", index}` clears the mark a Gambit left on the foe, which
 *   outlives the Damage, so a settled card still takes it.
 * - `{type: "greater", index, text}` records what a Strong Gambit's Greater
 *   effect did, such as "Eve loses hold of the Longsword". It is carried out
 *   on the foe's sheet, often after the Damage, so a settled card takes it too.
 * - `{type: "reroll", results, by}` rolls the whole pool of a joint Attack again,
 *   once, with a result for each die in the card's order (canReroll, p62).
 * - `{type: "sigil", die, from, value, by}` turns a die showing `from` to another of
 *   its faces, as a rune etched for that number lets its Knight do (p100).
 *
 * @param {AttackState} attack
 * @param {object} change
 * @returns {AttackState|null}
 */
export function changeAttack(attack, change) {
	// A Gambit Saved against in a Virtue other than VIG remembers which (p187).
	const saveInOf = ({ saveIn }) => (SAVE_VIRTUES.includes(saveIn) && saveIn !== SAVE_VIRTUES[0] ? { saveIn } : {});
	if (!attack) return null;

	// A mark holds into the turns after the Damage, so it can still be cleared.
	if (change?.type === "dismissMark") {
		const marked = attack.gambits[change.index];
		if (!marked || marked.dismissed || !MARK_GAMBITS.includes(marked.key)) return null;
		return { ...attack, gambits: attack.gambits.map((entry, index) => (index === change.index ? { ...entry, dismissed: true } : entry)) };
	}
	// One Greater effect per Strong Gambit, and none once the foe has Saved against it (p10).
	if (change?.type === "greater") {
		const gambit = attack.gambits[change.index];
		const text = typeof change.text === "string" ? change.text.trim() : "";
		if (!gambit || gambit.strong !== "greater" || gambit.greater || gambitIgnored(gambit) || !text) return null;
		return { ...attack, gambits: attack.gambits.map((entry, index) => (index === change.index ? { ...entry, greater: text } : entry)) };
	}
	if (attack.appliedTo.length) return null;

	switch (change?.type) {
		case "gambit": {
			if (!GAMBITS.includes(change.key) || !canFundGambit(attack, change.die)) return null;
			const strong = STRONG_GAMBITS.includes(change.strong) && canFundStrongGambit(attack, change.die) ? change.strong : null;
			// Declaring one closes the roll to anybody else joining (p8), even if it's taken back.
			return { ...attack, declared: true, gambits: [...attack.gambits, { key: change.key, die: change.die, strong, bonus: dismountBonus(change), save: null, dismissed: false, ...saveInOf(change), ...impairedWeaponOf(change) }] };
		}
		case "withdraw": {
			const index = attack.gambits.findIndex((gambit) => gambit.die !== null && gambit.die === change.die);
			if (index < 0) return null;
			return { ...attack, gambits: attack.gambits.toSpliced(index, 1) };
		}
		case "focus": {
			// Impaired Attacks can't benefit from Feats (p8), so in a joint Attack it's the one Focusing whose share counts.
			if (attackerImpaired(attack, change.actor) || !GAMBITS.includes(change.key) || hasUsedFeat(attack, "focus", change.actor)) return null;
			return {
				...attack,
				declared: true,
				// `payer` is whoever Focused, whose mark it is (p10).
				gambits: [...attack.gambits, { key: change.key, die: null, strong: STRONG_GAMBITS.includes(change.strong) && focusCanBeStrong(attack, change.actor) ? change.strong : null, bonus: dismountBonus(change), save: null, dismissed: false, focus: focusSave(change.save), payer: change.actor ?? null, ...saveInOf(change), ...impairedWeaponOf(change) }],
				feats: [...attack.feats, { key: "focus", actor: change.actor }]
			};
		}
		case "join":
			return joinAttack(attack, change);
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
				declared: true,
				dice: attack.dice.map((die, index) => (index === change.die ? { ...die, deniedBy: change.name } : die)),
				feats: [...attack.feats, { key: "deny", actor: change.actor }]
			};
		}
		case "applied": {
			const names = (change.names ?? []).filter((name) => typeof name === "string" && name);
			return names.length ? { ...attack, appliedTo: names } : null;
		}
		case "reroll": {
			const results = Array.isArray(change.results) ? change.results : [];
			if (!canReroll(attack) || results.length !== attack.dice.length) return null;
			if (!results.every((result, index) => Number.isInteger(result) && result >= 1 && result <= attack.dice[index].faces)) return null;
			// Nobody joins once the pool has been rolled again, since all roll together (p8).
			const sorted = withDiceSorted(attack, attack.dice.map((die, index) => ({ ...die, result: results[index] })));
			return { ...sorted, declared: true, rerolled: { by: String(change.by ?? "") } };
		}
		case "sigil": {
			const die = attack.dice[change.die];
			const { value } = change;
			if (!die || isDieSpent(attack, change.die) || die.result !== change.from) return null;
			if (!canTurnDie(value, die.faces, die.result)) return null;
			const turned = attack.dice.map((each, index) => (index === change.die ? { ...each, result: value, adjusted: { by: String(change.by ?? ""), from: each.result } } : each));
			return { ...withDiceSorted(attack, turned), declared: true };
		}
		default:
			return null;
	}
}
