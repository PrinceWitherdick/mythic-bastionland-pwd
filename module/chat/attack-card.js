import { cardTarget, dieLabel, joinAttack, renderAttackCard } from "../actions/attack.js";
import { chatIsPublic, playDismountFx } from "../actions/attack-fx.js";
import { takeAttack } from "../actions/damage.js";
import { canDenyAttack, payFeat, postFeat, rollFeat } from "../actions/feats.js";
import { rollSave } from "../actions/saves.js";
import { chooseDialog, confirmDialog, inputDialog } from "../apps/ui.js";
import { GAMBITS } from "../config.js";
import { greaterEffects, npcArmourWithout } from "../rules/armour.js";
import {
	DISMOUNT_FACES,
	SAVE_VIRTUES,
	STRONG_GAMBITS,
	attackerImpaired,
	attackersOf,
	canFundGambit,
	canFundStrongGambit,
	canJoin,
	changeAttack,
	damageAgainst,
	gambitAllowsSave,
	gambitSaveVirtue,
	hasUsedFeat,
	isAttacker,
	isDieSpent,
	parseDice
} from "../rules/attack.js";
import { shownWeapons, weaponShown } from "../rules/gambit-marks.js";
import { damageReach } from "../rules/property-tab.js";
import { isAtHand } from "../rules/restock.js";
import { SYSTEM_ID } from "../system-id.js";
import { queryAsker } from "../compat.js";
import { onCardClick, plural, statefulCard, t, warn } from "./cards.js";
import { causedBy } from "../actions/ledger.js";

/**
 * Attack cards follow the steps on p8 after the roll: others attacking the
 * same target join in, then Deny, Gambits, and the Damage applied to the
 * targets. Only a message's author and GMs can update it, so a player who
 * joins, Denies or applies Damage on somebody else's card asks the active GM
 * to record it.
 */

const CHANGE_QUERY = `${SYSTEM_ID}.changeAttack`;

/** Changes a player may ask the GM to record on a card they don't own. */
const QUERYABLE_CHANGES = Object.freeze(["deny", "applied", "gambitSave", "dismissMark", "greater", "join", "gambit", "withdraw", "focus"]);

/** The kinds of actor that make Attacks, and so can join one. */
const ATTACKER_TYPES = Object.freeze(["knight", "npc", "structure"]);

const attackCard = statefulCard({
	flag: "attack",
	query: CHANGE_QUERY,
	notices: "attack",
	change: changeAttack,
	render: renderAttackCard,
	queryable: (change) => QUERYABLE_CHANGES.includes(change.type),
	alsoUpdate: joinedRolls
});

/**
 * A joiner's rolls, kept on the card's message beside its own so they have a
 * tooltip too. A message's rolls are stored as JSON, alike in v13 and v14, and
 * Foundry takes only evaluated ones.
 * @param {ChatMessage} message
 * @param {object} change
 * @returns {{rolls?: string[]}}
 */
function joinedRolls(message, change) {
	const rolls = change?.type === "join" && Array.isArray(change.rolls) ? change.rolls.filter((roll) => roll?.evaluated) : [];
	if (!rolls.length) return {};
	return { rolls: [...(message._source?.rolls ?? []), ...rolls.map((roll) => JSON.stringify(roll))] };
}

/**
 * @param {ChatMessage|undefined} message
 * @returns {import("../rules/attack.js").AttackState|null}
 */
export const attackOf = attackCard.stateOf;

/**
 * Record a change on the card, asking the GM when this user can't.
 * @param {ChatMessage} message
 * @param {object} change See `changeAttack`.
 * @returns {Promise<boolean>}
 */
export const saveChange = attackCard.save;

/**
 * Whether an actor already used a Feat on this Attack, on this card or any
 * other card rolled with it for a Blast.
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {string} key
 * @param {string} actor Actor UUID.
 */
function featUsedOnAttack(attack, key, actor) {
	return game.messages.some((message) => {
		const other = attackOf(message);
		return other?.attackId === attack.attackId && hasUsedFeat(other, key, actor);
	});
}

/**
 * The actors the Damage lands on: the Tokens targeted when the Attack was
 * rolled or, if there were none, the Tokens this user targets now.
 * @param {import("../rules/attack.js").AttackState} attack
 * @returns {Actor[]}
 */
function targetActors(attack) {
	const tokens = attack.targets.length
		? attack.targets.map(({ uuid }) => fromUuidSync(uuid)).filter(Boolean)
		: [...game.user.targets].map((token) => token.document);
	return tokens.map((token) => token.actor).filter(Boolean);
}

/**
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {User} [user] Whoever asks; this user when left out.
 * @returns {boolean} Whether they own one of those making the Attack, whose
 *   dice, pooled in a joint Attack, any of them may spend on Gambits (p8).
 */
function ownsAnAttacker(attack, user = game.user) {
	return attackersOf(attack).some((uuid) => fromUuidSync(uuid)?.testUserPermission?.(user, "OWNER"));
}

/**
 * The active GM records a Deny or applied Damage for a player. A Deny must
 * come from an actor the player owns, and so must a joiner, a Focus, and
 * the Gambits spent from the pooled dice of an Attack they roll in.
 * @param {{messageId: string, change: object}} data
 * @param {{user?: User}} context
 * @returns {Promise<boolean>}
 */
async function onChangeQuery(data, context) {
	const { messageId } = data;
	let { change } = data;
	const user = queryAsker(context);
	if (!user) return false;
	const message = game.messages.get(messageId);
	if (!attackOf(message) || !QUERYABLE_CHANGES.includes(change?.type)) return false;
	// Clearing a mark, or carrying out a Greater effect, is the business of whoever owns the foe.
	if (change.type === "dismissMark" || change.type === "greater") {
		const marked = fromUuidSync(change.actor);
		if (!marked?.testUserPermission(user, "OWNER")) return false;
		const attack = attackOf(message);
		// A card rolled with no targets lands on whoever its reader targets, as targetActors has it.
		const untargeted = change.type === "greater" && !attack.targets.length;
		if (!untargeted && !attack.targets.some(({ uuid }) => fromUuidSync(uuid)?.actor?.uuid === marked.uuid)) return false;
	}
	if (change.type === "deny" || change.type === "gambitSave") {
		const roller = fromUuidSync(change.actor);
		if (!roller?.testUserPermission(user, "OWNER")) return false;
		change = change.type === "deny" ? { ...change, name: roller.name } : { ...change, by: roller.name };
	}
	if (change.type === "join") {
		const joiner = fromUuidSync(change.actor);
		// A join that arrives after a Deny or Gambit is refused (p8), and changeAttack says so too.
		if (!joiner?.testUserPermission(user, "OWNER") || !canJoin(attackOf(message))) return false;
		change = { ...change, name: joiner.name };
	}
	if ((change.type === "gambit" || change.type === "withdraw") && !ownsAnAttacker(attackOf(message), user)) return false;
	if (change.type === "focus") {
		const focuser = fromUuidSync(change.actor);
		if (!isAttacker(attackOf(message), change.actor) || !focuser?.testUserPermission(user, "OWNER")) return false;
	}
	return attackCard.commit(message, change);
}

/**
 * The Attack cards this user can see, read for the weapons foes have shown.
 * @returns {import("../rules/attack.js").AttackState[]}
 */
function seenAttacks() {
	return [...(game.messages ?? [])].filter((message) => message.visible !== false).map(attackOf).filter(Boolean);
}

/**
 * The weapons an Impair Gambit could name (p10): whatever the foes it's aimed
 * at fight with, hardest-hitting first, as p186 Impairs the crocodile's jaw.
 * A player is offered only those a foe has been seen attacking with on a card
 * they can see. Each foe is named where the card is aimed at several.
 * @param {import("../rules/attack.js").AttackState} attack
 * @returns {{value: string, label: string, weapon: import("../rules/attack.js").ImpairedWeapon}[]}
 */
function impairOptions(attack) {
	const foes = targetActors(attack);
	// A player names only what the foe has shown, so the list gives nothing away; the GM sees all.
	const seen = game.user.isGM ? null : seenAttacks();
	const shownBy = seen && new Map(foes.map((foe) => [foe.uuid, shownWeapons(seen, foe.uuid)]));
	const shown = (foe, item) => !shownBy || weaponShown(shownBy.get(foe.uuid), item);
	return foes
		.flatMap((foe) => [...(foe.items ?? [])]
			.filter((item) => item.system?.equipped && parseDice(item.system.damage).length && isAtHand(item.system))
			.filter((item) => shown(foe, item))
			.map((item) => ({ foe, item })))
		.sort((a, b) => damageReach(b.item.system.damage) - damageReach(a.item.system.damage))
		.map(({ foe, item }, index) => ({
			value: String(index),
			label: foes.length > 1
				? t("attack.impairOption", { name: foe.name, weapon: item.name, damage: item.system.damage })
				: t("attack.impairOptionOne", { weapon: item.name, damage: item.system.damage }),
			weapon: { id: item.id, name: item.name, actor: foe.uuid }
		}));
}

/**
 * Show the Gambit window's choice of weapon only while Impair is picked.
 * @param {foundry.applications.api.DialogV2} dialog
 */
function watchImpairChoice(dialog) {
	const form = dialog.element.querySelector("form");
	const row = form?.querySelector("[data-impair-weapon]");
	if (!row) return;
	const update = () => {
		row.hidden = form.querySelector("[name='gambit']:checked")?.value !== "impair";
	};
	form.addEventListener("change", update);
	update();
}

/**
 * Ask which Gambit to perform.
 * @param {object} options
 * @param {string} options.source   What pays for it, such as "d8 showing 5".
 * @param {boolean} options.strong  Offer the Strong Gambit choices.
 * @param {ReturnType<typeof impairOptions>} [options.weapons] What an Impair could name.
 * @returns {Promise<{key: string, strong: string|null, saveIn: string, weapon?: object}|null>}
 */
async function chooseGambit({ source, strong, weapons = [] }) {
	const virtue = (key) => t(`virtues.${key}.abbr`);
	const data = await inputDialog({
		title: t("gambits.label"),
		icon: "fa-solid fa-chess-knight",
		template: "gambit",
		context: {
			source,
			gambits: GAMBITS.map((key) => ({ key, label: t(`gambits.${key}`) })),
			strong: strong ? STRONG_GAMBITS.map((key) => ({ key, label: t(`attack.strong.${key}`) })) : null,
			saves: SAVE_VIRTUES.map((key, index) => ({ key, label: t("attack.saveIn", { virtue: virtue(key) }), selected: index === 0 })),
			weapons: weapons.map(({ value, label }) => ({ value, label }))
		},
		ok: { label: t("attack.declare") },
		render: (_event, dialog) => watchImpairChoice(dialog)
	});
	if (!data || !GAMBITS.includes(data.gambit)) return null;
	const chosen = { key: data.gambit, strong: STRONG_GAMBITS.includes(data.strong) ? data.strong : null, saveIn: SAVE_VIRTUES.includes(data.saveIn) ? data.saveIn : SAVE_VIRTUES[0] };
	// Blank Impairs their whole next Attack, as every Impair did before one could name a weapon.
	const weapon = data.gambit === "impair" ? weapons.find(({ value }) => value === data.weapon)?.weapon : null;
	return weapon ? { ...chosen, weapon } : chosen;
}

/**
 * A Dismount adds a d6 to the dice (p10), so roll it as the Gambit is declared.
 * @param {string} key
 * @returns {Promise<number|null>}
 */
async function rollDismount(key) {
	if (key !== "dismount") return null;
	const roll = await new Roll(`1d${DISMOUNT_FACES}`).evaluate();
	return roll.total;
}

/**
 * The horse goes over, heard at the table (module/actions/attack-fx.js), once
 * the card has taken the Dismount.
 * @param {string} key
 */
function showDismount(key) {
	if (key === "dismount") playDismountFx({ whispered: !chatIsPublic() });
}

/** Click a die of 4+ to spend it on a Gambit, or a spent one to take the Gambit back. */
async function onGambit(message, button) {
	const attack = attackOf(message);
	const die = Number(button.dataset.die);
	if (attack.gambits.some((gambit) => gambit.die === die)) return saveChange(message, { type: "withdraw", die });
	if (!canFundGambit(attack, die)) return;

	const { faces, result } = attack.dice[die];
	const choice = await chooseGambit({
		source: t("attack.dieSource", { faces, result }),
		strong: canFundStrongGambit(attack, die),
		weapons: impairOptions(attack)
	});
	if (!choice) return;
	if (await saveChange(message, { type: "gambit", die, ...choice, bonus: await rollDismount(choice.key) })) showDismount(choice.key);
}

/**
 * An attacker performs a Gambit without a die, then makes a CLA Save or is
 * Fatigued (p10). The Save is kept on the card beside the Gambit. In a
 * joint Attack, any of those making it whom this user owns may Focus, each
 * once, unless their own share was Impaired (p8).
 */
async function onFocus(message) {
	const attack = attackOf(message);
	const owned = attackersOf(attack).map((uuid) => fromUuidSync(uuid)).filter((actor) => actor?.isOwner);
	if (!owned.length) return;
	const unimpaired = owned.filter((actor) => !attackerImpaired(attack, actor.uuid));
	if (!unimpaired.length) return warn("attack.impaired");
	const able = unimpaired.filter((actor) => !featUsedOnAttack(attack, "focus", actor.uuid));
	if (!able.length) {
		return warn("attack.featUsed", { name: unimpaired[0].name, feat: t("feats.focus.name") });
	}
	const attacker = await chooseActor(able, { title: t("feats.focus.name"), message: t("attack.whoFocuses"), icon: "fa-solid fa-eye" });
	if (!attacker) return;

	const choice = await chooseGambit({ source: t("attack.focusSource", { name: attacker.name }), strong: false, weapons: impairOptions(attack) });
	if (!choice) return;
	// The CLA Save is rolled now, for the card to keep, but Fatigue follows only once the card takes the Focus.
	const save = await rollFeat(attacker, "focus");
	if (!save) return;
	const saved = await saveChange(message, {
		type: "focus",
		key: choice.key,
		saveIn: choice.saveIn,
		actor: attacker.uuid,
		bonus: await rollDismount(choice.key),
		save: { by: attacker.name, total: save.roll.total, target: save.value, passed: save.passed }
	});
	if (!saved) return;
	await payFeat(attacker, save);
	await postFeat(attacker, "focus", save);
	showDismount(choice.key);
}

/**
 * Who can make the VIG Save against a Gambit: the foes the Attack targeted,
 * or, when it targeted nobody, the actors of this user's selected Tokens.
 * Only somebody with Virtues can Save, so a ship or a wall cannot.
 * @param {import("../rules/attack.js").AttackState} attack
 * @returns {Actor[]}
 */
function saveCandidates(attack) {
	const targets = targetActors(attack);
	return answerers(targets.length ? targets : (canvas?.tokens?.controlled ?? []).map((token) => token.actor), attack);
}

/**
 * Whoever in a pool could answer an Attack: an actor this user owns, with
 * Virtues to roll with, who isn't one of those attacking. Each is offered once,
 * however many ways they were gathered.
 * @param {(Actor|null|undefined)[]} pool
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {(actor: Actor) => boolean} [also] A further test, such as knowing a Feat.
 * @returns {Actor[]}
 */
function answerers(pool, attack, also = () => true) {
	const seen = new Set();
	return pool.filter((actor) => {
		if (!actor?.isOwner || !actor.system?.virtues || isAttacker(attack, actor.uuid)) return false;
		if (seen.has(actor.uuid) || !also(actor)) return false;
		seen.add(actor.uuid);
		return true;
	});
}

/**
 * Ask which of several actors acts, or take the only one without asking.
 * @param {Actor[]} actors
 * @param {{title: string, message: string, icon?: string}} ask
 * @returns {Promise<Actor|null>}
 */
async function chooseActor(actors, { title, message, icon = "fa-solid fa-dice-d20" }) {
	if (actors.length === 1) return actors[0];
	const action = await chooseDialog({
		title,
		icon,
		message,
		buttons: actors.map((actor, index) => ({ action: String(index), label: actor.name, default: index === 0 }))
	});
	// Closing the window answers with null, which is nobody rather than the first of them.
	return typeof action === "string" ? actors[Number(action)] ?? null : null;
}

/**
 * @param {Actor[]} actors
 * @param {import("../rules/attack.js").Gambit} gambit
 * @returns {Promise<Actor|null>}
 */
function chooseSaver(actors, gambit) {
	const virtue = t(`virtues.${gambitSaveVirtue(gambit)}.abbr`);
	return chooseActor(actors, {
		title: t("attack.gambitSave", { virtue }),
		message: t("attack.whoSaves", { gambit: t(`gambits.names.${gambit.key}`), virtue })
	});
}

/**
 * The foe makes the VIG Save that ignores a Gambit (p10). The Save is rolled
 * and posted as any other, then recorded on the card, so a Dismount whose
 * Save passed stops adding its d6 to the Damage.
 */
async function onGambitSave(message, button) {
	const attack = attackOf(message);
	const index = Number(button.dataset.gambit);
	const gambit = attack.gambits[index];
	if (!gambit || gambit.save || !gambitAllowsSave(gambit)) return;

	const candidates = saveCandidates(attack);
	if (!candidates.length) return warn("attack.noSaver");
	const saver = await chooseSaver(candidates, gambit);
	if (!saver) return;

	const save = await rollSave(saver, gambitSaveVirtue(gambit));
	await saveChange(message, {
		type: "gambitSave",
		index,
		actor: saver.uuid,
		by: saver.name,
		total: save.roll.total,
		target: save.value,
		passed: save.passed
	});
}

/**
 * Whoever this user might Deny with: the actors of their selected Tokens, the
 * Attack's targets they own, then their own character. Only somebody who knows
 * the Feat and has Virtues to Save with belongs in the pool, so a GM's own
 * character, the GM Toolkit, never does.
 * @param {import("../rules/attack.js").AttackState} attack
 * @returns {{pool: Actor[], able: Actor[]}} `able` are those the Attack still allows to Deny.
 */
function denyOptions(attack) {
	const pool = answerers([
		...(canvas?.tokens?.controlled ?? []).map((token) => token.actor),
		...targetActors(attack),
		game.user.character
	], attack, (actor) => Boolean(actor.system.knowsFeat?.("deny")));
	return { pool, able: pool.filter((actor) => canDenyAttack(attack, actor)) };
}

/**
 * Say before the click whether this user can Deny at all, since a Fatigued
 * Knight, or one who has already Denied this Attack, would be turned away (p10).
 * @param {HTMLElement} button
 * @param {import("../rules/attack.js").AttackState} attack
 */
function refreshDeny(button, attack) {
	const { pool, able } = denyOptions(attack);
	button.disabled = !able.length;
	if (able.length) delete button.dataset.tooltip;
	else button.dataset.tooltip = t(pool.length ? "attack.cantDeny" : "attack.noDenier");
}

/** The target, or an ally close enough to touch, discards one die, paying with a SPI Save. */
async function onDeny(message) {
	const attack = attackOf(message);
	const { pool, able: deniers } = denyOptions(attack);
	if (!deniers.length) return warn(pool.length ? "attack.cantDeny" : "attack.noDenier");

	const dice = attack.dice
		.map((die, index) => ({ index, label: t("attack.dieChoice", { faces: die.faces, result: die.result, label: dieLabel(die) }) }))
		.filter(({ index }) => !isDieSpent(attack, index));
	if (!dice.length) return;
	// A Dismount's d6 can count instead of any die, and can't be Denied, so offer the highest die left,
	// of those that can harm the card's target in a joint Attack (p11).
	const highest = damageAgainst(attack, cardTarget(attack)).die
		?? dice.reduce((best, entry) => (attack.dice[entry.index].result > attack.dice[best.index].result ? entry : best)).index;

	const data = await inputDialog({
		title: t("feats.deny.name"),
		icon: "fa-solid fa-shield-halved",
		template: "deny",
		context: {
			deniers: deniers.map((actor) => ({ uuid: actor.uuid, name: actor.name })),
			dice,
			highest
		},
		ok: { label: t("feats.deny.name") }
	});
	if (!data) return;

	const denier = deniers.find((actor) => actor.uuid === data.denier) ?? deniers[0];
	const die = Number(data.die);
	// Check the die before the SPI Save is rolled, so a bad choice costs nothing.
	if (!dice.some(({ index }) => index === die)) return;
	if (featUsedOnAttack(attack, "deny", denier.uuid)) {
		return warn("attack.featUsed", { name: denier.name, feat: t("feats.deny.name") });
	}
	// Fatigue follows the SPI Save only once the card takes the Deny.
	const save = await rollFeat(denier, "deny");
	if (!save || !(await saveChange(message, { type: "deny", die, actor: denier.uuid, name: denier.name }))) return;
	await payFeat(denier, save);
	await postFeat(denier, "deny", save);
}

/**
 * Gambits are declared and Deny used before the Damage lands, and applying it
 * settles the card for good, so whatever is still to be had is said first.
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {Actor[]} actors Who the Damage would land on.
 * @returns {Promise<boolean>}
 */
async function confirmApply(attack, actors) {
	const lines = [];
	const unspent = attack.dice.filter((_die, index) => canFundGambit(attack, index)).length;
	if (unspent) lines.push(plural("attack.unspentGambits", unspent));
	const deniers = actors.filter((actor) => canDenyAttack(attack, actor)).map((actor) => actor.name);
	if (deniers.length) lines.push(t("attack.deniableDice", { names: deniers.join(", ") }));
	if (!lines.length) return true;
	return confirmDialog({
		title: t("attack.apply"),
		icon: "fa-solid fa-heart-crack",
		message: [...lines, t("attack.applyAnyway")]
	});
}

/** Take the Damage on each target this user owns, rolling a Scar with the die that caused it. */
async function onApply(message) {
	const attack = attackOf(message);
	const actors = targetActors(attack);
	if (!actors.length) return warn(attack.targets.length ? "attack.targetsGone" : "attack.noTarget");
	const owned = actors.filter((actor) => actor.isOwner);
	if (!owned.length) return warn("attack.cantApply");
	if (!(await confirmApply(attack, actors))) return;

	const applied = [];
	for (const actor of owned) {
		if (await takeAttack(actor, attack, { except: [message.id] })) applied.push(actor.name);
	}
	if (applied.length) await saveChange(message, { type: "applied", names: applied });
}

/**
 * Clear the mark a landed Gambit holds over somebody, from their own sheet.
 * The card keeps it, so the Gambit still reads as having landed.
 * @param {Actor} actor    Whoever is marked.
 * @param {string} messageId
 * @param {number} index   Which of the card's Gambits.
 * @returns {Promise<boolean>}
 */
export async function dismissGambitMark(actor, messageId, index) {
	const message = game.messages.get(messageId);
	if (!attackOf(message)) return false;
	return saveChange(message, { type: "dismissMark", index, actor: actor.uuid });
}

/**
 * What a Strong Gambit's Greater effect could do to the foes it was aimed at
 * (p10), on those this user can change: disarm, take off a helm, or break
 * something wooden.
 * @param {import("../rules/attack.js").AttackState} attack
 * @returns {({actor: Actor} & import("../rules/armour.js").GreaterEffect)[]}
 */
function greaterOptions(attack) {
	return targetActors(attack)
		.filter((actor) => actor.isOwner)
		.flatMap((actor) => {
			const items = actor.items.map(({ id, name, type, system }) => ({ id, name, type, system }));
			// A Knight's Armour is the sum of their items; anybody else's is one number with a note.
			const npc = actor.type === "knight" ? null : { armour: actor.system.armour, armourNote: actor.system.armourNote };
			return greaterEffects(items, npc).map((effect) => ({ actor, ...effect }));
		});
}

/** What each Greater effect reads as once done, under `attack.greater.` */
const GREATER_DONE = Object.freeze({ disarm: "disarmed", unhelm: "unhelmed", break: "broke" });

/**
 * Carry a Greater effect out on the foe's sheet. A disarmed weapon or shield
 * and a helm knocked off stay on a Knight's sheet unticked until they're back;
 * a broken one stays faded until it's mended. An NPC's helm or shield is a
 * point of its Armour and a word of its note, both taken away.
 * @param {{actor: Actor} & import("../rules/armour.js").GreaterEffect} option
 * @returns {{text: string, carryOut: () => Promise<unknown>}} What happens, for the card, and doing it.
 */
function greaterOutcome({ actor, effect, name, id }) {
	const said = [t(`attack.greater.${GREATER_DONE[effect]}`, { name: actor.name, item: name })];
	if (id) {
		if (effect !== "break") said.push(t(effect === "disarm" ? "attack.greater.pickUp" : "attack.greater.putOn"));
		const update = effect === "break" ? { "system.broken": true } : { "system.equipped": false };
		return { text: said.join(" "), carryOut: () => actor.items.get(id)?.update(update, causedBy("gambit")) };
	}
	const from = Number(actor.system.armour) || 0;
	const { armour: to, armourNote } = npcArmourWithout(from, actor.system.armourNote, effect === "unhelm" ? "helm" : "shield");
	said.push(t("attack.greater.armour", { from, to }), t("attack.greater.npcBack"));
	return { text: said.join(" "), carryOut: () => actor.update({ "system.armour": to, "system.armourNote": armourNote }) };
}

/**
 * Carry out a Strong Gambit's Greater effect (p10) on a foe this user owns,
 * and keep what it did on the card, so it's done once.
 */
async function onGreater(message, button) {
	const attack = attackOf(message);
	const index = Number(button.dataset.gambit);
	const gambit = attack.gambits[index];
	if (!gambit || gambit.strong !== "greater" || gambit.greater) return;

	const options = greaterOptions(attack);
	if (!options.length) return warn("attack.greater.nothing");
	let chosen = options[0];
	if (options.length > 1) {
		const action = await chooseDialog({
			title: t("attack.greater.title"),
			icon: "fa-solid fa-hand-fist",
			message: t("attack.greater.which"),
			buttons: options.map(({ actor, effect, name }, at) => ({
				action: String(at),
				label: `${actor.name}: ${t(`attack.greater.${effect}`, { item: name })}`,
				default: at === 0
			}))
		});
		chosen = typeof action === "string" ? options[Number(action)] ?? null : null;
	}
	if (!chosen) return;
	// Recorded first, so a card that can't be marked done leaves the foe as they were.
	const { text, carryOut } = greaterOutcome(chosen);
	if (await saveChange(message, { type: "greater", index, text, actor: chosen.actor.uuid })) await carryOut();
}

/**
 * Who this user could add to an Attack card (p8): the actors of their selected
 * Tokens and, for a player, their own character and every Knight they own. A
 * GM owns everybody, so only their selected Tokens are offered. Nobody already
 * rolling in it, or struck by it, joins it.
 * @param {import("../rules/attack.js").AttackState} attack
 * @returns {Actor[]}
 */
function joinCandidates(attack) {
	const struck = new Set(targetActors(attack).map((actor) => actor.uuid));
	const pool = [
		...(canvas?.tokens?.controlled ?? []).map((token) => token.actor),
		...(game.user.isGM ? [] : [game.user.character, ...(game.actors?.filter((actor) => actor.type === "knight") ?? [])])
	];
	const seen = new Set();
	return pool.filter((actor) => {
		if (!actor?.isOwner || !ATTACKER_TYPES.includes(actor.type) || seen.has(actor.uuid)) return false;
		seen.add(actor.uuid);
		return !isAttacker(attack, actor.uuid) && !struck.has(actor.uuid);
	});
}

/**
 * Show Join this Attack to a player only while they have somebody to join it
 * with. A GM may join anybody, once their Token is selected, so it stays for them.
 * @param {HTMLElement} button
 * @param {import("../rules/attack.js").AttackState} attack
 */
function refreshJoin(button, attack) {
	button.hidden = !canJoin(attack) || (!game.user.isGM && !joinCandidates(attack).length);
}

/**
 * Another combatant rolls into this Attack, since everybody attacking the same
 * target rolls at the same time (p8): their own Attack dialog, aimed at the
 * card's targets, and their dice pooled on the card. Once a Deny, Gambit or
 * Focus is declared the roll is over, so it's too late to join.
 */
async function onJoin(message) {
	const attack = attackOf(message);
	if (!canJoin(attack)) return warn("attack.joinClosed");
	const candidates = joinCandidates(attack);
	if (!candidates.length) return warn("attack.noJoiner");
	const joiner = await chooseActor(candidates, { title: t("attack.join"), message: t("attack.whoJoins"), icon: "fa-solid fa-user-plus" });
	if (!joiner) return;
	const joined = await joinAttack(joiner, attack);
	if (!joined) return;
	// Somebody may have declared a Deny or Gambit while the dialog stood open.
	if (!canJoin(attackOf(message))) return warn("attack.joinClosed");
	// Their Smite is paid for, and anything thrown used up, only once the card takes them.
	if (await saveChange(message, joined.change)) await joined.settle();
}

const HANDLERS = Object.freeze({ gambit: onGambit, "gambit-save": onGambitSave, focus: onFocus, deny: onDeny, apply: onApply, greater: onGreater, join: onJoin });

/**
 * Wire up an Attack card's buttons as it renders in the chat log or a popout.
 * Gambits and Focus belong to whoever rolled the Attack, or rolled into it.
 * Anyone may try to Deny, Join shows for those with somebody to join it with,
 * and Apply Damage shows for those who own a target.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
function activateAttackCard(message, html) {
	const attack = attackOf(message);
	const card = html.querySelector(".bastionland-card--attack");
	if (!attack || !card) return;

	let denyButton = null;
	let joinButton = null;
	const attacking = message.isOwner || ownsAnAttacker(attack);
	for (const button of card.querySelectorAll("[data-attack-action]")) {
		const { attackAction } = button.dataset;
		if (["gambit", "focus"].includes(attackAction) && !attacking) button.disabled = true;
		if (attackAction === "deny") denyButton = button;
		if (attackAction === "join") joinButton = button;
		if (attackAction === "apply" || attackAction === "greater") {
			button.hidden = attack.targets.length > 0 && !targetActors(attack).some((actor) => actor.isOwner);
		}
	}
	if (denyButton) refreshDeny(denyButton, attack);
	if (joinButton) refreshJoin(joinButton, attack);
	if (denyButton || joinButton) {
		// Which Tokens are selected, and who is Fatigued, both change after the card is
		// drawn, so the buttons are weighed again as the pointer reaches the card.
		card.addEventListener("pointerenter", () => {
			if (denyButton) refreshDeny(denyButton, attack);
			if (joinButton) refreshJoin(joinButton, attack);
		});
	}

	onCardClick(card, "[data-attack-action]", (button) => HANDLERS[button.dataset.attackAction]?.(message, button));
}

/** Called during init. */
export function registerAttackCards() {
	CONFIG.queries[CHANGE_QUERY] = onChangeQuery;
	Hooks.on("renderChatMessageHTML", activateAttackCard);
}
