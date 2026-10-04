import { postCard, t } from "../chat/cards.js";
import { afflictionsAt, tollsByKind, withAffliction } from "../rules/afflictions.js";
import { calendarLabel, getCalendar } from "./calendar.js";
import { causedBy } from "./ledger.js";
import { rollVirtueLosses } from "./virtue-loss.js";

/**
 * Afflictions (rules/afflictions.js): what some of the Cast leave in those they
 * touch, as the Plague's d6 VIG lost daily (p29). A victim carries each until
 * it's cured, losing the Virtue each morning or each round. Most are Virtue
 * Loss, which can't Mortally Wound or Slay (p9); some are Damage, as acid
 * burns each round until it's washed off (p173), which can.
 */

/** @returns {string} An affliction's dice as the book writes them: "d6", not "1d6". */
const lossDice = (affliction) => affliction.loss.replace(/^1d/, "d");

/**
 * @param {object} affliction
 * @returns {string} Such as "The Plague: d6 VIG daily", or "Acid: d8 Damage each round, ignoring Armour".
 */
export function afflictionLabel(affliction) {
	const dice = lossDice(affliction);
	const when = t(`afflictions.when.${affliction.when}`);
	if (affliction.damage) return t(affliction.ignoresArmour ? "afflictions.damageLabelIgnores" : "afflictions.damageLabel", { name: affliction.name, loss: dice, when });
	return t("afflictions.label", { name: affliction.name, loss: dice, virtue: t(`virtues.${affliction.virtue}.abbr`), when });
}

/**
 * Give an affliction to somebody, unless they already carry it.
 * @param {Actor} actor
 * @param {object} affliction Without an id.
 * @returns {Promise<boolean>} Whether they took it.
 */
export async function afflict(actor, affliction) {
	if (!actor?.isOwner || !actor.system.afflictions) return false;
	const list = withAffliction(actor.system.afflictions, affliction, foundry.utils.randomID());
	if (!list) return false;
	await actor.update({ "system.afflictions": list }, causedBy("hardship"));
	return true;
}

/**
 * One of the Cast passes on what it causes to everybody this user has
 * targeted, such as infection to those it touched. Whether they caught it at
 * all, a VIG Save for the Plague, is the Referee's to settle first.
 * @param {Actor} source The NPC that causes it.
 * @returns {Promise<string[]|null>} Who took it, or null with nobody targeted.
 */
export async function afflictTargets(source) {
	const inflicts = source?.system.inflicts ?? [];
	if (!inflicts.length) return null;
	const victims = [...game.user.targets].map((token) => token.actor).filter(Boolean);
	if (!victims.length) {
		ui.notifications.warn(t("afflictions.noTargets"));
		return null;
	}
	const took = [];
	for (const victim of victims) {
		for (const { id: _id, ...affliction } of inflicts) {
			if (await afflict(victim, affliction)) took.push(t("afflictions.took", { name: victim.name, affliction: afflictionLabel(affliction) }));
		}
	}
	if (took.length) await postCard(source, "note", { icon: "fa-solid fa-virus", text: took.join(" ") });
	return took;
}

/**
 * Take afflictions' toll now: each Virtue Loss's dice off its Virtue, in one
 * update, and each that deals Damage as a blow of its own, on a Damage card.
 * @param {Actor} actor
 * @param {object[]} afflictions
 * @returns {Promise<{rolls: Roll[], lines: string[], burned: number}>} The Virtue Loss taken, empty where none
 *   took anything, and how many dealt Damage.
 */
async function toll(actor, afflictions) {
	const { losses, damage } = tollsByKind(afflictions);
	const { update, taken } = await rollVirtueLosses(actor, losses.map(({ name, virtue, loss }) => ({ name, virtue, dice: loss })));
	if (taken.length) await actor.update(update, causedBy("hardship"));
	let burned = 0;
	for (const affliction of damage) if (await burn(actor, affliction)) burned++;
	return {
		rolls: taken.map(({ roll }) => roll),
		lines: taken.map(({ name, virtue, roll, from, to }) => t("afflictions.lost", { affliction: name, amount: roll.total, virtue: t(`virtues.${virtue}.abbr`), from, to })),
		burned
	};
}

/**
 * An affliction that deals Damage, as acid burns each round until washed off
 * (p173): its dice rolled and taken as a blow, against their Armour unless it
 * ignores it, without a dialog.
 * @param {Actor} actor
 * @param {object} affliction
 * @returns {Promise<boolean>} Whether it was taken.
 */
async function burn(actor, affliction) {
	// Nothing burns on in the dead.
	if (!actor.system.guard || actor.system.slain) return false;
	// Fetched when it's needed: damage.js leaves afflictions with whoever a blow reaches, so it imports this.
	const { takeDamage } = await import("./damage.js");
	const roll = await new Roll(affliction.loss).evaluate();
	const cause = t("afflictions.burns", { affliction: affliction.name, amount: roll.total, dice: lossDice(affliction) });
	return Boolean(await takeDamage(actor, { damage: roll.total, ignoreArmour: Boolean(affliction.ignoresArmour), auto: true, cause }));
}

/**
 * Post what afflictions took from somebody, as a note of their own.
 * @param {Actor} actor
 * @param {{rolls: Roll[], lines: string[]}} taken
 */
const postToll = (actor, { rolls, lines }) => postCard(actor, "note", { icon: "fa-solid fa-virus", text: `${actor.name}: ${lines.join(" ")}` }, { rolls });

/**
 * Take one affliction's toll from the sheet, when the Referee says it's due.
 * @param {Actor} actor
 * @param {string} id
 */
export async function sufferAffliction(actor, id) {
	const affliction = actor.system.afflictions?.find((each) => each.id === id);
	if (!affliction || !actor.isOwner) return null;
	const taken = await toll(actor, [affliction]);
	if (!taken.lines.length && !taken.burned) return null;
	if (taken.lines.length) await postToll(actor, taken);
	return taken;
}

/**
 * Cure an affliction, which takes no more.
 * @param {Actor} actor
 * @param {string} id
 */
export async function cureAffliction(actor, id) {
	const list = actor.system.afflictions ?? [];
	const cured = list.find((each) => each.id === id);
	if (!cured || !actor.isOwner) return null;
	await actor.update({ "system.afflictions": list.filter((each) => each.id !== id) });
	await postCard(actor, "note", { icon: "fa-solid fa-hand-holding-medical", text: t("afflictions.cured", { name: actor.name, affliction: cured.name }) });
	return cured;
}

/**
 * Each morning, everybody carrying a daily affliction loses what it takes, on
 * one card. GMs only; called as the Day moves into Morning.
 * @returns {Promise<object[]>} The card's entries.
 */
export async function sufferMorningAfflictions() {
	if (!game.user.isGM) return [];
	// An unlinked Token keeps its afflictions on itself, apart from the world's actors.
	const unlinked = game.scenes.contents.flatMap((scene) => scene.tokens.filter((token) => !token.actorLink && token.actor).map((token) => token.actor));
	const sufferers = [...game.actors, ...unlinked].filter((actor) => afflictionsAt(actor.system, "day").length);
	const tolls = await Promise.all(sufferers.map((actor) => toll(actor, afflictionsAt(actor.system, "day"))));
	const entries = sufferers.flatMap((actor, index) => (tolls[index].lines.length ? [{ name: actor.name, lines: tolls[index].lines }] : []));
	const rolls = tolls.flatMap(({ rolls }) => rolls);
	// What burns on as Damage posted its own Damage cards, so only Virtue Loss is said here.
	if (entries.length) await postCard(null, "report", { title: t("afflictions.morning"), tagline: calendarLabel(getCalendar()), entries, hint: t("time.hardship.notDamage") }, { rolls });
	return entries;
}

/**
 * A combatant carrying an affliction that bites each round loses what it takes
 * as their turn starts. The active GM makes the change.
 * @param {Combat} combat
 */
async function onTurnChange(combat) {
	if (!game.users.activeGM?.isSelf) return;
	const actor = combat.combatant?.actor;
	const due = afflictionsAt(actor?.system, "round");
	if (!due.length) return;
	const taken = await toll(actor, due);
	if (taken.lines.length) await postToll(actor, taken);
}

/** Called during init. */
export function registerAfflictionHooks() {
	Hooks.on("combatTurnChange", (combat) => onTurnChange(combat));
}
