import { combineDice, harmBarred, newAttackState, poolShare, shareOf, sortDice } from "./attack.js";

/*
 * A Pack card: an Attack gathered before it's rolled, since everybody
 * attacking the same target rolls at the same time (p8). Each who attacks
 * answers their own Attack dialog and brings their dice unrolled; then all of
 * them roll at once into an ordinary Attack card. Where somebody's Ability
 * joins dice into bigger ones, the dice of anybody there may be joined (p56).
 * What the Attack uses up (a thrown weapon, an Ability's use, dice kept for
 * the fight) is spent only once it's rolled, so a Pack called off spends
 * nothing; a Smite's Save, already rolled, is paid for as it's made.
 */

/**
 * @typedef {object} PackDie A die brought to the Pack, not yet rolled.
 * @property {number} faces
 * @property {string} label    What rolls it: the weapon, or a bonus die.
 * @property {string} [item]   Id of the weapon, on the dice of the roller's own weapons.
 * @property {boolean} [weakness] Added for a known weakness, which an Attack gets once (p188).
 * @property {boolean} [trample] A steed's trample, which joins only a charge and is never joined (p10).
 *
 * @typedef {object} PackShare One who attacks with the Pack.
 * @property {string} actor  Their UUID.
 * @property {string} name
 * @property {object} made   What the Attack card says of how they attack, as a card's `join` carries it.
 * @property {PackDie[]} dice
 * @property {object|null} blows What their blows look like on the map, once the dice are rolled.
 * @property {boolean} combine Their Ability joins dice into bigger ones (p56).
 * @property {PackSpend} spend What the Attack uses up of theirs, spent once it's rolled.
 *
 * @typedef {object} PackSpend
 * @property {string[]} items   Ids of what they attack with: a thrown one is used up.
 * @property {boolean} shatters The weapons are shattered as it lands, as a lance in a charge (p92).
 * @property {string[]} abilities Ids of the Abilities used, which spend a use, or are ready again.
 * @property {{faces: number, label: string}[]} keep Bonus dice kept with them for the rest of the fight.
 *
 * @typedef {object} PackState What a Pack card remembers.
 * @property {string} attackId
 * @property {string} attacker  UUID of whoever gathered it.
 * @property {string} attackerName
 * @property {{uuid: string, name: string}[]} targets
 * @property {PackShare[]} shares Whoever gathered it first.
 * @property {boolean} rolled   Closed to anybody else once it rolls.
 * @property {number|null} [rolledAt] When it was closed to roll, by the server's clock.
 * @property {boolean} calledOff Closed with nothing rolled and nothing spent.
 * @property {string|null} message The Attack card it was rolled into.
 * @property {number[]} spent   The shares whose spending is done, once it's rolled.
 */

/** What a share uses up when it spends nothing. */
const NO_SPEND = Object.freeze({ items: [], shatters: false, abilities: [], keep: [] });

/** The flag a Pack card's state is kept under. */
export const PACK_FLAG = "pack";

/**
 * @param {object} die A die as a change brings it.
 * @returns {boolean} Whether it's a die that can be rolled.
 */
const packDie = (die) => Number.isInteger(die?.faces) && die.faces > 0 && typeof die.label === "string";

/**
 * @param {object} die
 * @returns {PackDie} Only what a Pack die keeps.
 */
const keptDie = ({ faces, label, item, weakness, trample }) => ({
	faces,
	label,
	...(typeof item === "string" && item ? { item } : {}),
	...(weakness ? { weakness: true } : {}),
	...(trample ? { trample: true } : {})
});

/**
 * @param {object} change A share as a change brings it.
 * @param {PackDie[]} dice Its dice, already checked.
 * @returns {PackShare}
 */
const shareFrom = (change, dice) => ({
	actor: change.actor,
	name: String(change.name ?? ""),
	made: change.made && typeof change.made === "object" ? change.made : {},
	dice,
	blows: change.blows && typeof change.blows === "object" ? change.blows : null,
	combine: Boolean(change.combine),
	spend: spendFrom(change.spend)
});

/**
 * @param {unknown} list
 * @returns {string[]} The ids in it.
 */
const ids = (list) => (Array.isArray(list) ? list.filter((id) => typeof id === "string" && id) : []);

/**
 * What a share uses up, as a change brings it, or nothing where it isn't that.
 * @param {object} spend
 * @returns {PackSpend}
 */
function spendFrom(spend) {
	if (!spend || typeof spend !== "object") return { ...NO_SPEND };
	return {
		items: ids(spend.items),
		shatters: Boolean(spend.shatters),
		abilities: ids(spend.abilities),
		keep: (Array.isArray(spend.keep) ? spend.keep : []).filter(packDie).map(({ faces, label }) => ({ faces, label }))
	};
}

/**
 * A Pack card as whoever gathers it posts it, with their own dice.
 * @param {{attackId: string, attacker: string, attackerName: string,
 *   targets: {uuid: string, name: string}[], share: object}} options
 * @returns {PackState}
 */
export function newPack({ attackId, attacker, attackerName, targets = [], share }) {
	const first = shareFrom({ ...share, actor: attacker, name: attackerName }, (share.dice ?? []).filter(packDie).map(keptDie));
	return {
		attackId,
		attacker,
		attackerName,
		targets,
		shares: [first],
		rolled: false,
		calledOff: false,
		message: null,
		spent: []
	};
}

/**
 * @param {PackState|null} pack
 * @returns {boolean} Whether others may still bring their dice: not once it's rolled or called off.
 */
export const canJoinPack = (pack) => Boolean(pack) && !pack.rolled && !pack.calledOff;

/**
 * @param {PackState} pack
 * @returns {boolean} Whether somebody's Ability there joins dice into bigger ones (p56).
 */
export const packCombines = (pack) => pack.shares.some((share) => share.combine);

/**
 * @param {PackState|null} pack
 * @returns {boolean} Whether the roll asks which dice to join: somebody's Ability joins them,
 *   and somebody else is there whose dice it could join (p56).
 */
export const packJoinsDice = (pack) => Boolean(pack) && packCombines(pack) && pack.shares.length > 1 && joinablePool(pack).length > 1;

/**
 * The shares whose spending is still to be done, once the Pack is rolled.
 * @param {PackState|null} pack
 * @returns {number[]} Indexes into its shares.
 */
export const unspentShares = (pack) => (pack?.message ? pack.shares.map((_share, index) => index).filter((index) => !pack.spent.includes(index)) : []);

/**
 * @param {PackState} pack
 * @returns {string[]} UUIDs of all who attack with it, the Knight first.
 */
export const packAttackers = (pack) => pack.shares.map((share) => share.actor);

/**
 * Every die brought, each with the index of the share that brought it.
 * @param {PackState} pack
 * @returns {(PackDie & {share: number})[]}
 */
const packPool = (pack) => pack.shares.flatMap((share, index) => share.dice.map((die) => ({ ...die, share: index })));

/**
 * The dice the Knight may join, in the order the dice window lists them:
 * everything but a steed's trample (p10).
 * @param {PackState} pack
 * @returns {(PackDie & {share: number})[]}
 */
export const joinablePool = (pack) => packPool(pack).filter((die) => !die.trample);

/**
 * The Pack as an Attack dialog reads the card somebody joins: who it's aimed
 * at, whose it is, and whether a known weakness is already on it (p188).
 * @param {PackState} pack
 * @returns {{attacker: string, attackerName: string, targets: object[], dice: PackDie[], pack: true}}
 */
export const packAsJoining = (pack) => ({ attacker: pack.attacker, attackerName: pack.attackerName, targets: pack.targets, dice: packPool(pack), pack: true });

/**
 * Apply one change to a Pack card, or null for one it doesn't allow.
 *
 * - `{type: "join", actor, name, made, dice, blows, combine, spend}` brings another's dice,
 *   unrolled. Each attacks with it once, and a known weakness's die comes once however many
 *   know it (p188).
 * - `{type: "roll", shares, at}` closes it as it rolls, only while `shares` is how many have
 *   joined it, so nobody's dice are left out of a roll made as they joined; `at` is when.
 * - `{type: "posted", message}` keeps the Attack card it was rolled into.
 * - `{type: "reopen"}` opens it again where the roll never reached the chat.
 * - `{type: "callOff"}` closes it with nothing rolled and nothing spent.
 * - `{type: "spent", share}` marks one share's spending done, once.
 *
 * @param {PackState|null} pack
 * @param {object} change
 * @returns {PackState|null}
 */
export function changePack(pack, change) {
	if (!pack) return null;
	switch (change?.type) {
		case "join": {
			if (!canJoinPack(pack) || typeof change.actor !== "string" || !change.actor || packAttackers(pack).includes(change.actor)) return null;
			const weakened = packPool(pack).some((die) => die.weakness);
			const dice = (Array.isArray(change.dice) ? change.dice : []).filter(packDie).filter((die) => !(weakened && die.weakness)).map(keptDie);
			if (!dice.length) return null;
			return { ...pack, shares: [...pack.shares, shareFrom(change, dice)] };
		}
		case "roll":
			return canJoinPack(pack) && change.shares === pack.shares.length ? { ...pack, rolled: true, rolledAt: Number.isFinite(change.at) ? change.at : null } : null;
		case "posted":
			return pack.rolled && !pack.message && typeof change.message === "string" && change.message ? { ...pack, message: change.message } : null;
		case "reopen":
			return pack.rolled && !pack.message ? { ...pack, rolled: false, rolledAt: null } : null;
		case "callOff":
			return canJoinPack(pack) ? { ...pack, calledOff: true } : null;
		case "spent":
			return unspentShares(pack).includes(change.share) ? { ...pack, spent: [...pack.spent, change.share] } : null;
		default:
			return null;
	}
}

/**
 * The dice the Pack rolls, as they were grouped: each die left alone stays
 * its bringer's, and each joined die, marked `joined`, is that of whoever
 * brought the most of its faces, the earliest share between equals, so
 * whoever gathered the Attack before anybody (p56). A steed's trample is
 * never joined (p10).
 * @param {PackState} pack
 * @param {number[]} groups The group each of joinablePool's dice joins, by index; 0 leaves it alone.
 * @param {(dice: string, others: string[]) => string} joinedLabel What a joined die is called,
 *   from its faces, such as "d4+d8", and the names of the others whose dice it took in.
 * @returns {{dice: (PackDie & {share: number})[], over: number[]}} `over` as combineDice says.
 */
export function packDice(pack, groups, joinedLabel) {
	const { dice, over } = combineDice(joinablePool(pack), groups);
	const rolled = dice.map((die) => {
		if (!die.members) return die;
		const faces = new Map();
		for (const member of die.members) faces.set(member.share, (faces.get(member.share) ?? 0) + member.faces);
		const share = [...faces].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
		const others = [...new Set(die.members.map((member) => member.share))].filter((index) => index !== share).map((index) => pack.shares[index].name);
		return { faces: die.faces, label: joinedLabel(die.label, others), share, joined: true, ...(die.members.some((member) => member.weakness) ? { weakness: true } : {}) };
	});
	return { dice: [...rolled, ...packPool(pack).filter((die) => die.trample)], over };
}

/**
 * What the dice window says the Pack will roll as it's grouped: each die but
 * a steed's trample, whose it will be, and why it can't harm the target, if
 * it can't (p11). A joined die strikes as its owner's dice do, so one joined
 * from another's dice may harm less than they would have.
 * @param {PackState} pack
 * @param {number[]} groups As packDice takes them.
 * @param {(dice: string, others: string[]) => string} joinedLabel As packDice takes it.
 * @param {{warband?: boolean, structure?: boolean, stone?: boolean}} target What only some Attacks harm, as harmBarred reads it.
 * @returns {{over: number[], dice: {faces: number, owner: string, joined: boolean, barred: string|null}[]}}
 */
export function packPreview(pack, groups, joinedLabel, target = {}) {
	const { dice, over } = packDice(pack, groups, joinedLabel);
	return {
		over,
		dice: dice.filter((die) => !die.trample).map((die) => ({
			faces: die.faces,
			owner: pack.shares[die.share].name,
			joined: Boolean(die.joined),
			barred: harmBarred(shareOf(pack.shares[die.share].made, null), target)
		}))
	};
}

/**
 * The Attack card a Pack rolls into: the Knight's Attack, with each other
 * share pooled into it as one who joins does, so every die says who rolled
 * it and the card weighs each share as a joint Attack's (p8).
 * @param {PackState} pack
 * @param {(PackDie & {share: number})[]} dice As packDice gives them.
 * @param {number[]} results What each of them showed, in the same order.
 * @param {{combat: string, round: number, turn: number}|null} [place] Where in a running Combat
 *   it was rolled, which is when the Attack is made, so a Gambit's mark lapses from there.
 * @returns {import("./attack.js").AttackState}
 */
export function packAttackState(pack, dice, results, place = null) {
	const rolled = dice.map(({ share, trample: _trample, joined: _joined, ...die }, index) => ({ share, die: { ...die, result: results[index], deniedBy: null } }));
	const diceOf = (share) => rolled.filter((entry) => entry.share === share).map((entry) => entry.die);
	const [first, ...others] = pack.shares;
	let state = {
		...newAttackState({ attackId: pack.attackId, attacker: pack.attacker, attackerName: pack.attackerName, place, made: first.made }),
		targets: pack.targets,
		dice: sortDice(diceOf(0))
	};
	others.forEach((share, offset) => {
		state = poolShare(state, { type: "join", ...share.made, actor: share.actor, name: share.name, dice: diceOf(offset + 1) }) ?? state;
	});
	return state;
}
