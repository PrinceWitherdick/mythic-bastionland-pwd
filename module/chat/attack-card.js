import { renderAttackCard } from "../actions/attack.js";
import { chatIsPublic, playDismountFx } from "../actions/attack-fx.js";
import { takeAttack } from "../actions/damage.js";
import { canDenyAttack, performFeat } from "../actions/feats.js";
import { rollSave } from "../actions/saves.js";
import { chooseDialog, confirmDialog, inputDialog } from "../apps/ui.js";
import { GAMBITS } from "../config.js";
import {
	attackDamage,
	canFundGambit,
	canFundStrongGambit,
	changeAttack,
	DISMOUNT_FACES,
	gambitAllowsSave,
	hasUsedFeat,
	isDieSpent,
	STRONG_GAMBITS
} from "../rules/attack.js";
import { SYSTEM_ID } from "../system-id.js";
import { queryAsker } from "../compat.js";
import { onCardClick, plural, postCard, statefulCard, t, warn } from "./cards.js";

/**
 * Attack cards follow the steps on p8 after the roll: Deny, Gambits, then the
 * Damage applied to the targets. Only a message's author and GMs can update
 * it, so a player who Denies or applies Damage on somebody else's card asks
 * the active GM to record it.
 */

const CHANGE_QUERY = `${SYSTEM_ID}.changeAttack`;

/** Changes a player may ask the GM to record on a card they don't own. */
const QUERYABLE_CHANGES = Object.freeze(["deny", "applied", "gambitSave", "dismissMark"]);

const attackCard = statefulCard({
	flag: "attack",
	query: CHANGE_QUERY,
	notices: "attack",
	change: changeAttack,
	render: renderAttackCard,
	queryable: (change) => QUERYABLE_CHANGES.includes(change.type)
});

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
 * The active GM records a Deny or applied Damage for a player. A Deny must
 * come from an actor the player owns.
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
	if (change.type === "dismissMark") {
		const marked = fromUuidSync(change.actor);
		if (!marked?.testUserPermission(user, "OWNER")) return false;
		const attack = attackOf(message);
		if (!attack.targets.some(({ uuid }) => fromUuidSync(uuid)?.actor?.uuid === marked.uuid)) return false;
	}
	if (change.type === "deny" || change.type === "gambitSave") {
		const roller = fromUuidSync(change.actor);
		if (!roller?.testUserPermission(user, "OWNER")) return false;
		change = change.type === "deny" ? { ...change, name: roller.name } : { ...change, by: roller.name };
	}
	return attackCard.commit(message, change);
}

/**
 * Ask which Gambit to perform.
 * @param {object} options
 * @param {string} options.source   What pays for it, such as "d8 showing 5".
 * @param {boolean} options.strong  Offer the Strong Gambit choices.
 * @returns {Promise<{key: string, strong: string|null}|null>}
 */
async function chooseGambit({ source, strong }) {
	const data = await inputDialog({
		title: t("gambits.label"),
		icon: "fa-solid fa-chess-knight",
		template: "gambit",
		context: {
			source,
			gambits: GAMBITS.map((key) => ({ key, label: t(`gambits.${key}`) })),
			strong: strong ? STRONG_GAMBITS.map((key) => ({ key, label: t(`attack.strong.${key}`) })) : null
		},
		ok: { label: t("attack.declare") }
	});
	if (!data || !GAMBITS.includes(data.gambit)) return null;
	return { key: data.gambit, strong: STRONG_GAMBITS.includes(data.strong) ? data.strong : null };
}

/**
 * A Dismount adds a d6 to the dice (p10), so roll it as the Gambit is declared.
 * @param {string} key
 * @returns {Promise<number|null>}
 */
async function rollDismount(key) {
	if (key !== "dismount") return null;
	const roll = await new Roll(`1d${DISMOUNT_FACES}`).evaluate();
	// The horse goes over, heard at the table (module/actions/attack-fx.js).
	playDismountFx({ whispered: !chatIsPublic() });
	return roll.total;
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
		strong: canFundStrongGambit(attack, die)
	});
	if (choice) await saveChange(message, { type: "gambit", die, ...choice, bonus: await rollDismount(choice.key) });
}

/**
 * The attacker performs a Gambit without a die, then must pass a CLA Save or
 * become Fatigued (p10). The Save is kept on the card beside the Gambit.
 */
async function onFocus(message) {
	const attack = attackOf(message);
	const attacker = fromUuidSync(attack.attacker);
	if (!attacker) return;
	if (attack.impaired) return warn("attack.impaired");
	if (featUsedOnAttack(attack, "focus", attacker.uuid)) {
		return warn("attack.featUsed", { name: attacker.name, feat: t("feats.focus.name") });
	}

	const choice = await chooseGambit({ source: t("attack.focusSource", { name: attacker.name }), strong: false });
	if (!choice) return;
	const save = await performFeat(attacker, "focus");
	if (!save) return;
	await saveChange(message, {
		type: "focus",
		key: choice.key,
		actor: attacker.uuid,
		bonus: await rollDismount(choice.key),
		save: { by: attacker.name, total: save.roll.total, target: save.value, passed: save.passed }
	});
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
 * Virtues to roll with, who isn't the one attacking. Each is offered once,
 * however many ways they were gathered.
 * @param {(Actor|null|undefined)[]} pool
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {(actor: Actor) => boolean} [also] A further test, such as knowing a Feat.
 * @returns {Actor[]}
 */
function answerers(pool, attack, also = () => true) {
	const seen = new Set();
	return pool.filter((actor) => {
		if (!actor?.isOwner || !actor.system?.virtues || actor.uuid === attack.attacker) return false;
		if (seen.has(actor.uuid) || !also(actor)) return false;
		seen.add(actor.uuid);
		return true;
	});
}

/**
 * @param {Actor[]} actors
 * @param {import("../rules/attack.js").Gambit} gambit
 * @returns {Promise<Actor|null>}
 */
async function chooseSaver(actors, gambit) {
	if (actors.length === 1) return actors[0];
	const action = await chooseDialog({
		title: t("attack.gambitSave"),
		icon: "fa-solid fa-dice-d20",
		message: t("attack.whoSaves", { gambit: t(`gambits.names.${gambit.key}`) }),
		buttons: actors.map((actor, index) => ({ action: String(index), label: actor.name, default: index === 0 }))
	});
	// Closing the window answers with null, which is nobody rather than the first of them.
	return typeof action === "string" ? actors[Number(action)] ?? null : null;
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

	const save = await rollSave(saver, "vig");
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

/** The target or an ally within arm's reach discards one die, paying with a SPI Save. */
async function onDeny(message) {
	const attack = attackOf(message);
	const { pool, able: deniers } = denyOptions(attack);
	if (!deniers.length) return warn(pool.length ? "attack.cantDeny" : "attack.noDenier");

	const dice = attack.dice
		.map((die, index) => ({ index, label: t("attack.dieChoice", { faces: die.faces, result: die.result, label: die.label }) }))
		.filter(({ index }) => !isDieSpent(attack, index));
	if (!dice.length) return;
	// A Dismount's d6 can count instead of any die, and can't be Denied, so offer the highest die left.
	const highest = attackDamage(attack).die
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
	const save = await performFeat(denier, "deny");
	if (save) await saveChange(message, { type: "deny", die, actor: denier.uuid, name: denier.name });
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
		if (await takeAttack(actor, attack)) applied.push(actor.name);
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
 * What a Strong Gambit's Greater effect could break on the foes it was aimed
 * at (p10): their wooden shields and weapons still whole, on those this user
 * can change.
 * @param {import("../rules/attack.js").AttackState} attack
 * @returns {{actor: Actor, item: Item}[]}
 */
function breakableThings(attack) {
	return targetActors(attack)
		.filter((actor) => actor.isOwner)
		.flatMap((actor) => actor.items
			.filter((item) => item.system.wooden && !item.system.broken && (item.type === "weapon" || item.system.kind === "shield"))
			.map((item) => ({ actor, item })));
}

/**
 * Mark the wooden shield or weapon a Greater effect broke (p10). It stays on
 * the sheet, faded, until it's mended.
 */
async function onBreak(message) {
	const things = breakableThings(attackOf(message));
	if (!things.length) return warn("attack.nothingToBreak");
	let chosen = things[0];
	if (things.length > 1) {
		const action = await chooseDialog({
			title: t("attack.break"),
			icon: "fa-solid fa-hammer",
			message: t("attack.breakWhat"),
			buttons: things.map(({ actor, item }, index) => ({ action: String(index), label: `${actor.name}: ${item.name}`, default: index === 0 }))
		});
		chosen = typeof action === "string" ? things[Number(action)] : null;
	}
	if (!chosen) return;
	await chosen.item.update({ "system.broken": true });
	await postCard(chosen.actor, "note", { icon: "fa-solid fa-hammer", text: t("attack.broke", { name: chosen.actor.name, item: chosen.item.name }) });
}

const HANDLERS = Object.freeze({ gambit: onGambit, "gambit-save": onGambitSave, focus: onFocus, deny: onDeny, apply: onApply, break: onBreak });

/**
 * Wire up an Attack card's buttons as it renders in the chat log or a popout.
 * Gambits and Focus belong to whoever rolled the Attack. Anyone may try to
 * Deny, and Apply Damage shows for those who own a target.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
function activateAttackCard(message, html) {
	const attack = attackOf(message);
	const card = html.querySelector(".bastionland-card--attack");
	if (!attack || !card) return;

	let denyButton = null;
	for (const button of card.querySelectorAll("[data-attack-action]")) {
		const { attackAction } = button.dataset;
		if (["gambit", "focus"].includes(attackAction) && !message.isOwner) button.disabled = true;
		if (attackAction === "deny") denyButton = button;
		if (attackAction === "apply") {
			button.hidden = attack.targets.length > 0 && !targetActors(attack).some((actor) => actor.isOwner);
		}
	}
	if (denyButton) {
		refreshDeny(denyButton, attack);
		// Which Tokens are selected, and who is Fatigued, both change after the card is
		// drawn, so the button is weighed again as the pointer reaches the card.
		card.addEventListener("pointerenter", () => refreshDeny(denyButton, attack));
	}

	onCardClick(card, "[data-attack-action]", (button) => HANDLERS[button.dataset.attackAction]?.(message, button));
}

/** Called during init. */
export function registerAttackCards() {
	CONFIG.queries[CHANGE_QUERY] = onChangeQuery;
	Hooks.on("renderChatMessageHTML", activateAttackCard);
}
