/**
 * Using a possession that does something, from its row (see
 * rules/possession-effects.js): ease a Mortal Wound (p40), take an affliction
 * into itself (p94), restore a Virtue or all of them (p68), make a Save when
 * eaten (p164), or cost whoever grabs or strikes first (p74, p82). A counted
 * possession spends one.
 */
import { chooseOne } from "../apps/actor-pick.js";
import { confirmDialog } from "../apps/ui.js";
import { postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { counted } from "../rules/afflictions.js";
import { isVirtue, USED_EFFECTS } from "../rules/possession-effects.js";
import { isAtHand, isWorn } from "../rules/restock.js";
import { escapeHTML } from "../rules/text.js";
import { VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID } from "../system-id.js";
import { loseVirtue, rollDamageOn, shortName, spendUse } from "./abilities.js";
import { afflictionLabel } from "./afflictions.js";
import { causedBy } from "./ledger.js";

/** What marks the button on the card that makes somebody else pay. */
const HARMS_SELECTOR = "[data-harms-other]";

/**
 * Each effect used from a possession's row: whether its bearer can use it now
 * (given the Virtue it names, abbreviated), its button's words where they
 * aren't its plain "use", and using it.
 */
const ROW_EFFECTS = Object.freeze({
	easesMortal: { ready: (actor) => actor.system.mortalWound, use: easeMortal },
	absorbsAffliction: { ready: (actor) => actor.system.afflictions?.length, use: absorbAffliction },
	restoresOne: { ready: (actor) => actor.system.virtues, use: (actor, item, name) => restoreVirtues(actor, item, name, false) },
	restoresAll: { ready: (actor) => actor.system.virtues, use: (actor, item, name) => restoreVirtues(actor, item, name, true) },
	saveOnUse: { ready: (actor, virtue) => virtue && actor.system.virtues, label: (virtue) => t("possessionEffects.saveOnUse.use", { virtue }), use: saveOnUse },
	harmsOther: { ready: () => true, label: (virtue, dice) => t(virtue ? "possessionEffects.harmsOther.useVirtue" : "possessionEffects.harmsOther.useDamage", { dice, virtue }), use: harmOther }
});

/**
 * @param {string} effect
 * @returns {object|null} Its ROW_EFFECTS entry, for one used from its row.
 */
const rowEffect = (effect) => (USED_EFFECTS.includes(effect) ? ROW_EFFECTS[effect] : null);

/**
 * What a possession's row button says, or null where it has none to use now.
 * @param {Item} item
 * @param {Actor} actor Who carries it.
 * @returns {string|null}
 */
export function effectRowLabel(item, actor) {
	const { effect, effectDie, effectVirtue } = item.system ?? {};
	const row = rowEffect(effect);
	if (!row || !isAtHand(item.system)) return null;
	const virtue = isVirtue(effectVirtue) ? t(`virtues.${effectVirtue}.abbr`) : "";
	if (!row.ready(actor, virtue)) return null;
	return row.label ? row.label(virtue, effectDie || "d6") : t(`possessionEffects.${effect}.use`);
}

/**
 * One fewer of a counted possession, once used.
 * @param {Item} item
 */
const spendOne = (item) => spendUse(item, causedBy("item"));

/**
 * Use what a possession does, from its row.
 * @param {Actor} actor
 * @param {Item} item
 * @returns {Promise<boolean>} Whether it was used.
 */
export async function useEffect(actor, item) {
	if (!actor?.isOwner || !isAtHand(item?.system)) return false;
	const row = rowEffect(item.system.effect);
	return row ? row.use(actor, item, shortName(item)) : false;
}

/** A Mortal Wound treated as a Wound (p40): no longer dying, still Wounded. */
async function easeMortal(actor, item, name) {
	if (!actor.system.mortalWound) return false;
	await actor.update({ "system.mortalWound": false, "system.wounded": true }, causedBy("item"));
	await spendOne(item);
	await postCard(actor, "note", { icon: "fa-solid fa-heart-pulse", text: t("possessionEffects.easesMortal.done", { name: actor.name, item: name }) });
	return true;
}

/** An affliction taken into the possession, which is then gone (p94). */
async function absorbAffliction(actor, item, name) {
	const choices = (actor.system.afflictions ?? []).map((each) => ({ id: each.id, name: afflictionLabel(each) }));
	if (!choices.length) return false;
	const picked = await chooseOne(choices, {
		title: name,
		icon: "fa-solid fa-gem",
		intro: t("possessionEffects.absorbsAffliction.which", { name: actor.name, item: name }),
		message: t("possessionEffects.absorbsAffliction.legend"),
		ok: t("possessionEffects.absorbsAffliction.ok"),
		full: true
	});
	if (!picked) return false;
	await actor.update({ "system.afflictions": actor.system.afflictions.filter((each) => each.id !== picked.id) }, causedBy("item"));
	await spendOne(item);
	await postCard(actor, "note", { icon: "fa-solid fa-gem", text: t("possessionEffects.absorbsAffliction.done", { name: actor.name, item: name, affliction: picked.name }) });
	return true;
}

/** One Virtue, picked, or every Virtue back to its most (p68). */
async function restoreVirtues(actor, item, name, all) {
	let virtues = VIRTUES;
	if (!all) {
		const choices = VIRTUES.map((key) => ({ id: key, name: t(`virtues.${key}.label`), detail: t("possessionEffects.restoresOne.now", { value: actor.system.virtues[key].value, max: actor.system.virtues[key].max }) }));
		const picked = await chooseOne(choices, {
			title: name,
			icon: "fa-solid fa-leaf",
			intro: t("possessionEffects.restoresOne.which", { name: actor.name }),
			message: t("possessionEffects.restoresOne.legend"),
			ok: t("possessionEffects.restoresOne.ok"),
			full: true
		});
		if (!picked) return false;
		virtues = [picked.id];
	}
	await actor.update(Object.fromEntries(virtues.map((key) => [`system.virtues.${key}.value`, actor.system.virtues[key].max])), causedBy("item"));
	await spendOne(item);
	const which = virtues.map((key) => t(`virtues.${key}.abbr`)).join(", ");
	await postCard(actor, "note", { icon: "fa-solid fa-leaf", text: t("possessionEffects.restored", { name: actor.name, item: name, virtues: which }) });
	return true;
}

/** A Save when one is eaten, as the possession says (p164). */
async function saveOnUse(actor, item, name) {
	const virtue = item.system.effectVirtue;
	if (!isVirtue(virtue) || !actor.system.virtues?.[virtue]) return false;
	// Fetched here, since Saves reach the Abilities through what they import.
	const { evaluateSave, saveContext } = await import("./saves.js");
	const save = await evaluateSave(actor, virtue);
	await spendOne(item);
	await postCard(actor, "note", {
		icon: save.passed ? "fa-solid fa-circle-check" : "fa-solid fa-circle-xmark",
		text: t(save.passed ? "possessionEffects.saveOnUse.passed" : "possessionEffects.saveOnUse.failed", { name: actor.name, item: name, ...saveContext(save) })
	}, { rolls: [save.roll] });
	return true;
}

/**
 * Whoever grabbed or struck first pays (p74, p82): with one Token targeted, a
 * card asks the Referee to take it from them, Damage or Virtue Loss.
 */
async function harmOther(actor, item, name) {
	const [target] = [...game.user.targets];
	const victim = game.user.targets.size === 1 ? target?.actor : null;
	if (!victim) {
		warn("possessionEffects.harmsOther.target", { item: name });
		return false;
	}
	const dice = item.system.effectDie || "d6";
	const virtue = isVirtue(item.system.effectVirtue) ? item.system.effectVirtue : "";
	const sure = await confirmDialog({
		title: name,
		icon: "fa-solid fa-hand-back-fist",
		message: t(virtue ? "possessionEffects.harmsOther.confirmVirtue" : "possessionEffects.harmsOther.confirmDamage", { name: escapeHTML(victim.name), dice, virtue: virtue ? t(`virtues.${virtue}.abbr`) : "", item: escapeHTML(name) }),
		yes: { label: t("possessionEffects.harmsOther.ok") }
	});
	if (!sure) return false;
	await postCard(actor, "note", {
		icon: "fa-solid fa-hand-back-fist",
		text: t(virtue ? "possessionEffects.harmsOther.offerVirtue" : "possessionEffects.harmsOther.offerDamage", { name: victim.name, dice, virtue: virtue ? t(`virtues.${virtue}.abbr`) : "", item: name, bearer: actor.name }),
		action: { data: "harms-other", icon: "fa-solid fa-dice", label: t("possessionEffects.harmsOther.button") }
	}, { mode: "public", flags: { [SYSTEM_ID]: { harmsOther: { victim: victim.uuid, dice, virtue, item: name } } } });
	return true;
}

/**
 * The Referee taking what a possession costs whoever grabbed or struck first.
 * @param {{victim: string, dice: string, virtue: string, item: string}} harm From the card.
 * @returns {Promise<boolean>}
 */
async function payHarm({ victim: uuid, dice, virtue, item }) {
	const victim = fromUuidSync(uuid ?? "");
	if (!victim?.isOwner) return false;
	if (isVirtue(virtue)) {
		const card = { icon: "fa-solid fa-heart-crack", text: "possessionEffects.harmsOther.paid", data: { name: victim.name, virtue: t(`virtues.${virtue}.abbr`) } };
		return Boolean(await loseVirtue(victim, { name: item, virtue, dice: counted(dice) }, "item", card));
	}
	await rollDamageOn(victim, dice, item, { icon: "fa-solid fa-hand-back-fist", text: "possessionEffects.harmsOther.rolled", data: { item } });
	return true;
}

/** Wire the card that makes somebody else pay. Called during init. */
export function registerPossessionEffects() {
	registerCardButtons({
		selector: HARMS_SELECTOR,
		gmOnly: true,
		fromPlayers: true,
		once: true,
		handler: (_button, message) => payHarm(message?.flags?.[SYSTEM_ID]?.harmsOther ?? {})
	});
}

/**
 * What a target's armour says of an Attack at them, for the Attack window: a
 * helm that Impairs a foe's first ever Attack (p42).
 * @param {Actor|null|undefined} target
 * @returns {string[]}
 */
export function wornWarnings(target) {
	return [...(target?.items ?? [])]
		.filter((item) => item.system?.effect === "firstAttackImpaired" && isWorn(item.system))
		.map((item) => t("possessionEffects.firstAttackImpaired.hint", { name: target.name, item: shortName(item) }));
}
