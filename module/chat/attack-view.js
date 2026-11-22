import { plural, t } from "./cards.js";
import { GAMBITS } from "../config.js";
import {
	canFundGambit,
	canFundStrongGambit,
	canJoin,
	canReroll,
	damageAgainst,
	gambitAllowsSave,
	gambitIgnored,
	gambitSaveVirtue,
	harmBarred,
	hasDeniableDie,
	impairment,
	isSettled,
	jointHarmTarget,
	shareOf,
	unappliedTargets,
	withdrawLocked
} from "../rules/attack.js";
import { dieMask } from "../rules/die-shapes.js";
import { canJoinPack, packCombines } from "../rules/pack.js";
import { stripHTML } from "../rules/text.js";
import { templatePath } from "../system-id.js";
import { canDenyAttack } from "../actions/feats.js";
import { hasPoolReroller, hasSigilHolder } from "../actions/attack-holders.js";

/**
 * What an Attack card and a Pack card show of their state (module/actions/attack.js
 * makes and rolls them, attack-card.js and pack-card.js keep them up to date).
 */

/**
 * The line under a card's title naming who it's aimed at, alike on an Attack card and a Pack card.
 * @param {{name: string}[]} targets
 * @returns {string|null} Null where it's aimed at nobody in particular.
 */
export const againstLine = (targets) => (targets.length ? t("attack.against", { names: targets.map((target) => target.name).join(", ") }) : null);

/**
 * What a Pack card shows: who has brought which dice, and whether it still
 * waits for more, was rolled, or was called off. Which Attack card it was
 * rolled into, and whose spending is done, it never shows (packShown).
 * @param {import("../rules/pack.js").PackState} pack
 * @returns {object}
 */
export function packCardContext(pack) {
	const open = canJoinPack(pack);
	const combine = packCombines(pack);
	let closed = null;
	if (pack.calledOff) closed = t("attack.pack.calledOff");
	else if (!open) closed = t("attack.pack.rolled");
	return {
		targets: againstLine(pack.targets),
		shares: pack.shares.map((share) => ({
			name: share.name,
			smite: share.made.smite ?? null,
			dice: share.dice.map((die) => ({ faces: die.faces, shape: dieMask(die.faces), label: die.label }))
		})),
		waiting: open ? t(combine ? "attack.pack.waitingCombine" : "attack.pack.waiting", { name: pack.attackerName }) : null,
		// Where somebody's Ability joins dice, the roll asks which first (p56).
		rollLabel: t(combine ? "attack.pack.roll" : "attack.pack.rollPlain"),
		rollHint: t(combine ? "attack.pack.rollHint" : "attack.pack.rollPlainHint"),
		closed,
		// Closed for a roll, so it may yet need opening again if the Attack card never comes.
		stalled: pack.rolled,
		open
	};
}

/**
 * @param {import("../rules/pack.js").PackState} pack
 * @returns {Promise<string>} The card's HTML.
 */
export function renderPackCard(pack) {
	return foundry.applications.handlebars.renderTemplate(templatePath("chat/pack.hbs"), packCardContext(pack));
}

/**
 * The part of a Pack card's state that packCardContext draws: all of it but
 * the Attack card it was rolled into and whose spending is done, so marking
 * either writes the card's flag without drawing it again.
 * @param {import("../rules/pack.js").PackState} pack
 * @returns {object}
 */
export const packShown = ({ message: _message, spent: _spent, ...shown }) => shown;

/** The longest weapon note an Attack card repeats; anything longer is on the weapon itself. */
const NOTE_LENGTH = 160;

/**
 * A weapon's note as one short line of plain text for a card.
 * @param {string} html
 * @returns {string} Empty for a note too long to repeat, or none.
 */
export function plainNote(html) {
	const text = stripHTML(html);
	return text.length <= NOTE_LENGTH ? text : "";
}

/**
 * @param {import("../rules/attack.js").FocusSave|null|undefined} save
 * @returns {{passed: boolean, result: string}|null}
 */
function focusSaveContext(save) {
	if (!save) return null;
	const { by, total, target, passed } = save;
	return { passed, result: t(passed ? "attack.focusPassed" : "attack.focusFailed", { name: by, total, target }) };
}

/**
 * @param {import("../rules/attack.js").Gambit} gambit
 * @returns {string} The Virtue the foe Saves in against it, as its short name.
 */
const virtueOf = (gambit) => t(`virtues.${gambitSaveVirtue(gambit)}.abbr`);

/**
 * Where a declared Gambit stands with the foe it was aimed at: no Save to be
 * had, one still to roll, or one already rolled (p10).
 * @param {import("../rules/attack.js").Gambit} gambit
 * @param {number} index
 * @param {boolean} settled Whether the Damage has been applied.
 * @returns {object|null} Null once a settled Attack leaves a Save unrolled.
 */
function gambitSaveContext(gambit, index, settled) {
	// A Strong Gambit that denies the Save already says so in its tag.
	if (!gambitAllowsSave(gambit)) return gambit.strong === "noSave" ? null : { none: t("attack.gambitNoSave") };
	if (gambit.save) {
		const { by, total, target, passed } = gambit.save;
		return { passed, result: t(passed ? "attack.gambitSaved" : "attack.gambitFailed", { name: by, total, target, virtue: virtueOf(gambit) }) };
	}
	return settled ? null : { index, button: t("attack.gambitSave", { virtue: virtueOf(gambit) }) };
}

/**
 * A Strong Gambit's Greater effect (p10): disarming, taking off a helm or
 * breaking something wooden, carried out on the foe's sheet from the card.
 * It waits while the foe's VIG Save is still to roll, and once done the card
 * says what it did.
 * @param {import("../rules/attack.js").Gambit} gambit
 * @param {number} index
 * @param {boolean} settled Whether the Damage has been applied.
 * @returns {{done?: string, waiting?: string, index?: number, label?: string, hint?: string}|null}
 */
function greaterContext(gambit, index, settled) {
	if (gambit.strong !== "greater" || gambitIgnored(gambit)) return null;
	if (gambit.greater) return { done: gambit.greater };
	if (gambitAllowsSave(gambit) && !gambit.save && !settled) return { waiting: t("attack.greater.waiting", { virtue: virtueOf(gambit) }) };
	return { index, label: t("attack.greater.button"), hint: t("attack.greater.hint") };
}

/**
 * The book's line for each Gambit, folded into the card so somebody who
 * doesn't know the rule can see what a die of 4+ would buy them (p10).
 * @returns {{label: string, lines: string[], strong: string, hint: string}}
 */
function gambitHelp() {
	return {
		label: t("attack.gambitHelp"),
		lines: GAMBITS.map((key) => t(`gambits.${key}`)),
		strong: t("gambits.strong"),
		hint: t("gambits.hint")
	};
}

/**
 * The line reminding whoever is about to be hurt that they can still Deny one
 * of these dice (p10). It names the targets who could, since they are the ones
 * with something to lose; an ally within arm's reach may Deny for them, so the
 * card falls silent rather than naming somebody who can't. An Attack rolled at
 * nobody in particular names nobody either way.
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {boolean} settled
 * @returns {string|null}
 */
function denyPrompt(attack, settled) {
	if (settled || !hasDeniableDie(attack)) return null;
	if (!attack.targets.length) return t("attack.denyPromptAny");
	const names = attack.targets
		.map((target) => fromUuidSync(target.uuid)?.actor)
		.filter((actor) => canDenyAttack(attack, actor))
		.map((actor) => actor.name);
	return names.length ? t("attack.denyPrompt", { names: names.join(", ") }) : null;
}

/**
 * A die as the card and the Deny window name it: by what rolled it, and once
 * others have joined the Attack, by who rolled it too (p8).
 * @param {import("../rules/attack.js").AttackDie} die
 * @returns {string}
 */
export function dieLabel(die) {
	return die.by ? t("attack.pooledDie", { name: die.by, label: die.label }) : die.label;
}

/**
 * Why an Attack, or one attacker's share of a joint Attack, is Impaired.
 * @param {{confined?: boolean, swarm?: boolean, impairedWeapon?: string|null}} made
 * @returns {string}
 */
function impairedText({ confined = false, swarm = false, impairedWeapon = null }) {
	// Impaired before the Attack, or unarmed, the card keeps no cause, and says only that it was.
	const { cause } = impairment({ confined, swarm, weapon: impairedWeapon });
	if (cause === "confined") return t("attack.confinedImpaired");
	if (cause === "swarm") return t("attack.swarmImpaired");
	if (cause === "weapon") return t("attack.weaponImpairedCard", { name: impairedWeapon });
	return t("attack.impaired");
}

/**
 * What the card says of each who joined the Attack (p8): that they did, the
 * Smite they declared with its Save, and what set aside or Impaired their share.
 * @param {import("../rules/attack.js").JoinedAttacker[]} joined
 * @returns {object[]}
 */
function joinedContext(joined) {
	return joined.map((entry) => ({
		line: t(entry.smite ? "attack.joinedSmite" : "attack.joined", { name: entry.name }),
		smite: entry.smite,
		smiteMark: entry.smiteMark ? t("attack.smiteMarkLine") : null,
		leader: entry.leader ? t("attack.ledBy", { name: entry.leader.name }) : null,
		warnings: [
			...(entry.setAside ?? []).map(({ name, reason }) => t(`attack.setAside.${reason}`, { name })),
			...(entry.impaired ? [impairedText(entry)] : [])
		]
	}));
}

/**
 * What a card's target is, for reckoning the Damage against it: its Tokens'
 * actors as they stand now, read as jointHarmTarget reads them (p11).
 * @param {import("../rules/attack.js").AttackState} attack
 * @returns {{warband?: boolean, structure?: boolean, stone?: boolean}}
 */
export function cardTarget(attack) {
	return jointHarmTarget(attack, (uuid) => fromUuidSync(uuid)?.actor);
}

/**
 * @param {Record<string, boolean>} shown Which of an Ability's grants the card explains, in the order it does.
 * @returns {{name: string, hint: string}[]}
 */
const grantHints = (shown) => Object.keys(shown).filter((key) => shown[key]).map((key) => ({ name: t(`attack.grant.${key}`), hint: t(`attack.grant.${key}Hint`) }));

/**
 * Template data for an Attack card at any point: fresh from the roll, part way
 * through Deny and Gambits, or settled once the Damage is applied. A joint
 * Attack's Damage is the highest die left of those that can harm its target
 * (p8, p11), and the dice that can't are struck through, saying why.
 * @param {import("../rules/attack.js").AttackState} attack
 */
export function attackCardContext(attack) {
	const target = cardTarget(attack);
	const blow = damageAgainst(attack, target);
	const { highest, bolster, damage, die: counted } = blow;
	// Why each die can't harm the target, or null where it can.
	const barred = attack.dice.map((die) => harmBarred(shareOf(attack, die), target));
	const unharmed = barred.some(Boolean) && blow.unharmed;
	const struck = attack.targets.map((each) => each.name).join(", ");
	const settled = isSettled(attack);
	// Weighed die by die, since in a joint Attack only the melee dice make Strong Gambits.
	const funds = attack.dice.map((_die, index) => canFundGambit(attack, index));
	const fundsStrong = attack.dice.map((_die, index) => canFundStrongGambit(attack, index));
	const gambitDice = funds.filter(Boolean).length;
	const strongDice = fundsStrong.filter(Boolean).length;
	const joined = attack.joined ?? [];
	// Focus is had by any attacker whose share wasn't Impaired (p8).
	const focusable = !attack.impaired || joined.some((entry) => !entry.impaired);
	const gambitName = (key) => t(`gambits.names.${key}`);

	return {
		smite: attack.smite,
		smiteMark: attack.smiteMark ? t("attack.smiteMarkLine") : null,
		targets: againstLine(attack.targets),
		joined: joinedContext(joined),
		dice: attack.dice.map((die, index) => {
			const gambit = attack.gambits.find((entry) => entry.die === index);
			const spentOn = gambit ? gambitName(gambit.key) : die.deniedBy ? t("attack.deniedBy", { name: die.deniedBy }) : null;
			// A die a rune turned says what it showed, and whose rune it was (p100).
			const label = die.adjusted ? t("attack.sigil.turnedDie", { label: dieLabel(die), from: die.adjusted.from, name: die.adjusted.by }) : dieLabel(die);
			return {
				index,
				faces: die.faces,
				// The outline the card draws behind the result, so a d12 is told from a d6 without reading.
				shape: dieMask(die.faces),
				result: die.result,
				label: spentOn ?? label,
				spent: Boolean(spentOn),
				// Can't harm this card's target, so it never counts toward its Damage (p11).
				barred: barred[index] ? t(`attack.barred.${barred[index]}`) : null,
				isHighest: index === counted,
				isGambit: funds[index],
				isStrong: fundsStrong[index],
				// A die of 4+ can be spent, and a die spent on a Gambit can be taken back while nothing
				// about the Gambit is rolled or done. After that only the Referee may, so each viewer's
				// client shuts it to anybody else (activateAttackCard).
				locked: settled || !(gambit || funds[index]),
				refereeTakeBack: !settled && Boolean(withdrawLocked(gambit))
			};
		}),
		gambits: attack.gambits.map((gambit, index) => {
			const ignored = gambitIgnored(gambit);
			return {
				// The book's own line, which names the Gambit and says how long it lasts.
				effect: t(`gambits.${gambit.key}`),
				source: gambit.die === null
					? t("feats.focus.name")
					: t("attack.dieSource", { faces: attack.dice[gambit.die].faces, result: attack.dice[gambit.die].result }),
				strong: gambit.strong ? t(`attack.strong.${gambit.strong}`) : null,
				// The one weapon an Impair holds (p186); without one it holds their whole next Attack.
				weapon: gambit.weapon ? t("attack.impairsWeapon", { name: gambit.weapon.name }) : null,
				// The CLA Save Focus cost the attacker (p10). Cards from before it was kept have none.
				focus: focusSaveContext(gambit.focus),
				// A Dismount the target Saved against adds nothing, so its d6 goes unmentioned.
				bonus: gambit.bonus && !ignored ? t("attack.dismounted", { result: gambit.bonus }) : null,
				greater: greaterContext(gambit, index, settled),
				ignored,
				save: gambitSaveContext(gambit, index, settled)
			};
		}),
		damage,
		// Said instead of a number when nobody's blow can harm the target.
		unharmed: unharmed ? t("attack.cantHarm", { names: struck }) : null,
		barredNote: !unharmed && barred.some(Boolean) ? t("attack.barredNote", { names: struck }) : null,
		breakdown: bolster && !unharmed ? t("attack.breakdown", { highest, bolster }) : null,
		// Said only while there is a choice to make, so the line keeps its weight.
		gambitPrompt: settled || !gambitDice ? null : plural("attack.gambitPrompt", gambitDice),
		strongPrompt: settled || !strongDice ? null : plural("attack.strongPrompt", strongDice),
		// Said while a die is still there to discard, so the reminder lands before the Damage does.
		denyPrompt: denyPrompt(attack, settled),
		takeBack: !settled && attack.gambits.some((gambit) => gambit.die !== null && !withdrawLocked(gambit)) ? t("attack.takeBack") : null,
		// A Gambit is still to be had while a die can pay for one, or Focus can.
		gambitHelp: settled || !(gambitDice || focusable) ? null : gambitHelp(),
		// Cards rolled before weapons could be set aside have no list.
		setAside: (attack.setAside ?? []).map(({ name, reason }) => t(`attack.setAside.${reason}`, { name })),
		impaired: attack.impaired,
		// Why: a Long weapon in a confined space, a swarm struck without a Blast, or a foe's Impair on the weapon.
		impairedText: attack.impaired ? impairedText(attack) : null,
		focusable,
		blast: attack.blast,
		// In a joint Attack, as the die that counts says.
		ignoresArmour: blow.ignoresArmour && !unharmed,
		grantHints: grantHints({
			// Somebody's dice buy Strong Gambits without an 8+, as an Ability declared for them says.
			strongGambits: attack.dice.some((die) => shareOf(attack, die).strongGambits),
			// What Abilities declared for the blow do as it lands: Damage to SPI (p68), VIG taken back (p166).
			spirit: blow.spirit && !unharmed,
			drain: blow.drain && !unharmed,
			alone: Boolean(attack.alone) && !settled
		}),
		shattered: attack.shattered?.length ? t("attack.shattered", { names: attack.shattered.join(", ") }) : null,
		notes: [
			...(attack.lingers ?? []).map(({ name, when }) => t("attack.lingers", { name, when: t(`afflictions.when.${when}`) })),
			...(unharmed ? [] : (attack.onWound ?? []).map((key) => t(`attack.onWound.${key}`))),
			// Cards rolled before weapon notes were kept have none.
			...(attack.notes ?? []).map(({ name, note }) => `${name}: ${note}`)
		],
		// The whole pool rolled again, once (p62), and who may still do it.
		rerolled: attack.rerolled ? t("attack.reroll.done", { name: attack.rerolled.by }) : null,
		reroll: !settled && canReroll(attack) && hasPoolReroller(attack),
		// A rune etched for a number a die shows can turn it (p100).
		sigil: !settled && hasSigilHolder(attack),
		// Cards rolled before leading from the front have no leader.
		leader: attack.leader ? t("attack.ledBy", { name: attack.leader.name }) : null,
		// A duel's Attacks are applied together from the duel card.
		duel: Boolean(attack.duel),
		// Others attacking the same target may still roll into it until a Deny, Gambit or Focus
		// is declared (p8), but never into a duel's blow.
		joinable: canJoin(attack),
		settled,
		// Each target's owner applies the Damage to theirs, so a card at several stays open till all have.
		// Deleted Tokens wait for nobody.
		applicable: !attack.duel && (!settled || unappliedTargets(attack).some(({ uuid }) => fromUuidSync(uuid))),
		appliedTo: settled ? t("attack.applied", { names: attack.appliedTo.join(", ") }) : null
	};
}

/**
 * @param {import("../rules/attack.js").AttackState} attack
 * @returns {Promise<string>} The card's HTML.
 */
export function renderAttackCard(attack) {
	return foundry.applications.handlebars.renderTemplate(templatePath("chat/attack.hbs"), attackCardContext(attack));
}
