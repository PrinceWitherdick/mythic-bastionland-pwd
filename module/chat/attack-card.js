import { renderAttackCard } from "../actions/attack.js";
import { takeAttack } from "../actions/damage.js";
import { performFeat } from "../actions/feats.js";
import { inputDialog } from "../apps/ui.js";
import { GAMBITS } from "../config.js";
import {
	attackDamage,
	canFundGambit,
	canFundStrongGambit,
	changeAttack,
	DISMOUNT_FACES,
	hasUsedFeat,
	isDieSpent,
	STRONG_GAMBITS
} from "../rules/attack.js";
import { SYSTEM_ID } from "../system-id.js";
import { onCardClick, statefulCard, t, warn } from "./cards.js";

/**
 * Attack cards follow the steps on p8 after the roll: Deny, Gambits, then the
 * Damage applied to the targets. Only a message's author and GMs can update
 * it, so a player who Denies or applies Damage on somebody else's card asks
 * the active GM to record it.
 */

const CHANGE_QUERY = `${SYSTEM_ID}.changeAttack`;

/** Changes a player may ask the GM to record on a card they don't own. */
const QUERYABLE_CHANGES = Object.freeze(["deny", "applied"]);

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
 * @param {{user: User}} context
 * @returns {Promise<boolean>}
 */
async function onChangeQuery({ messageId, change }, { user }) {
	const message = game.messages.get(messageId);
	if (!attackOf(message) || !QUERYABLE_CHANGES.includes(change?.type)) return false;
	if (change.type === "deny") {
		const denier = fromUuidSync(change.actor);
		if (!denier?.testUserPermission(user, "OWNER")) return false;
		change = { ...change, name: denier.name };
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

/** The attacker performs a Gambit without a die, paying with a CLA Save. */
async function onFocus(message) {
	const attack = attackOf(message);
	const attacker = fromUuidSync(attack.attacker);
	if (!attacker) return;
	if (attack.impaired) return warn("attack.impaired");
	if (featUsedOnAttack(attack, "focus", attacker.uuid)) {
		return warn("attack.featUsed", { name: attacker.name, feat: t("feats.focus.name") });
	}

	const choice = await chooseGambit({ source: t("feats.focus.use"), strong: false });
	if (!choice) return;
	const save = await performFeat(attacker, "focus");
	if (save) await saveChange(message, { type: "focus", key: choice.key, actor: attacker.uuid, bonus: await rollDismount(choice.key) });
}

/**
 * Whoever might Deny: the actors of this user's selected Tokens, then their
 * own character. The attacker can't Deny their own Attack, and only somebody
 * with Virtues can make the SPI Save: a GM's character is the GM Toolkit.
 * @param {import("../rules/attack.js").AttackState} attack
 * @returns {Actor[]}
 */
function denyCandidates(attack) {
	const actors = [...(canvas?.tokens?.controlled ?? []).map((token) => token.actor), game.user.character];
	const seen = new Set();
	return actors.filter((actor) => {
		if (!actor?.isOwner || !actor.system?.virtues || actor.uuid === attack.attacker || seen.has(actor.uuid)) return false;
		seen.add(actor.uuid);
		return true;
	});
}

/** The target or an ally within arm's reach discards one die, paying with a SPI Save. */
async function onDeny(message) {
	const attack = attackOf(message);
	const deniers = denyCandidates(attack);
	if (!deniers.length) return warn("attack.noDenier");

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

/** Take the Damage on each target this user owns, rolling a Scar with the die that caused it. */
async function onApply(message) {
	const attack = attackOf(message);
	const actors = targetActors(attack);
	if (!actors.length) return warn(attack.targets.length ? "attack.targetsGone" : "attack.noTarget");
	const owned = actors.filter((actor) => actor.isOwner);
	if (!owned.length) return warn("attack.cantApply");

	const applied = [];
	for (const actor of owned) {
		if (await takeAttack(actor, attack)) applied.push(actor.name);
	}
	if (applied.length) await saveChange(message, { type: "applied", names: applied });
}

const HANDLERS = Object.freeze({ gambit: onGambit, focus: onFocus, deny: onDeny, apply: onApply });

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

	for (const button of card.querySelectorAll("[data-attack-action]")) {
		const { attackAction } = button.dataset;
		if (["gambit", "focus"].includes(attackAction) && !message.isOwner) button.disabled = true;
		if (attackAction === "apply") {
			button.hidden = attack.targets.length > 0 && !targetActors(attack).some((actor) => actor.isOwner);
		}
	}

	onCardClick(card, "[data-attack-action]", (button) => HANDLERS[button.dataset.attackAction]?.(message, button));
}

/** Called during init. */
export function registerAttackCards() {
	CONFIG.queries[CHANGE_QUERY] = onChangeQuery;
	Hooks.on("renderChatMessageHTML", activateAttackCard);
}
