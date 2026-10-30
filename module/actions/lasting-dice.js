import { askActiveGM } from "../ask-gm.js";
import { postCard, t } from "../chat/cards.js";
import { queryAsker } from "../compat.js";
import { spendUse } from "./abilities.js";
import { isUsedUp } from "../rules/restock.js";
import { parseDice } from "../rules/attack.js";
import { lastingOf, withLasting, withoutLasting } from "../rules/lasting-dice.js";
import { SYSTEM_ID } from "../system-id.js";

/** The Combatant flag holding somebody's lasting dice. Ending the Combat ends them. */
const LASTING_FLAG = "lastingDice";

/** The query asking the GM to give a weapon its tempered die, for a user who can't (p98). */
const TEMPER_QUERY = `${SYSTEM_ID}.temperWeapon`;

/**
 * The actor's place in a Combat: a started one first, as the one being fought.
 * An unlinked Token's actor is matched by its own uuid.
 * @param {Actor} actor
 * @returns {Combatant|null}
 */
export function combatantOf(actor) {
	const combats = [...(game.combats ?? [])].sort((a, b) => Number(Boolean(b.started)) - Number(Boolean(a.started)));
	for (const combat of combats) {
		const found = combat.combatants.find((combatant) => combatant.actor?.uuid === actor.uuid);
		if (found) return found;
	}
	return null;
}

/**
 * @param {Actor} actor
 * @param {Combatant|null} [combatant] Their place in a Combat, where it's been found already.
 * @returns {import("../rules/lasting-dice.js").LastingDie[]} Dice they have for the rest of the fight.
 */
export function lastingDiceOf(actor, combatant = combatantOf(actor)) {
	return combatant ? lastingOf(combatant.getFlag(SYSTEM_ID, LASTING_FLAG)) : [];
}

/**
 * @param {import("../rules/lasting-dice.js").LastingDie} die
 * @returns {string} The die as their conditions and the Attack window name it.
 */
export function lastingDieLabel(die) {
	const label = die.label || t("attack.bonus");
	if (die.item) return t("attack.lastingDieWeapon", { label, faces: die.faces, weapon: die.itemName || "?" });
	return t(die.melee ? "attack.lastingDieMelee" : "attack.lastingDie", { label, faces: die.faces });
}

/**
 * Keep dice with them for the rest of the fight.
 * @param {Actor} actor
 * @param {import("../rules/lasting-dice.js").LastingDie[]} dice
 * @returns {Promise<boolean>} Whether they were kept: only somebody in a Combat keeps any.
 */
export async function keepLastingDice(actor, dice) {
	const combatant = combatantOf(actor);
	if (!combatant || !dice.length) return false;
	await combatant.setFlag(SYSTEM_ID, LASTING_FLAG, withLasting(combatant.getFlag(SYSTEM_ID, LASTING_FLAG), dice));
	return true;
}

/**
 * Drop one of their lasting dice, as when what gave it is lost.
 * @param {Actor} actor
 * @param {number} index
 */
export async function dropLastingDie(actor, index) {
	const combatant = combatantOf(actor);
	if (!combatant) return;
	await combatant.setFlag(SYSTEM_ID, LASTING_FLAG, withoutLasting(combatant.getFlag(SYSTEM_ID, LASTING_FLAG), index));
}

/**
 * An Ability's die for the rest of the fight, spending one of its uses if it
 * has a limit.
 * @param {Actor} actor
 * @param {Item|undefined} item The Ability.
 * @returns {Promise<boolean>} Whether the die was added.
 */
export async function addAbilityDie(actor, item) {
	const [faces] = parseDice(item?.system.lastingDie);
	if (!faces) return false;
	if (isUsedUp(item.system)) {
		ui.notifications.warn(t("ability.usedUp", { name: item.name }));
		return false;
	}
	// An Ability used only in melee keeps its die for melee blows (p32, p98).
	const melee = item.system.needs === "melee";
	if (!(await keepLastingDice(actor, [{ faces, label: item.name, ...(melee ? { melee } : {}) }]))) {
		ui.notifications.warn(t("ability.notInCombat", { name: actor.name }));
		return false;
	}
	await spendUse(item);
	return true;
}

/**
 * The die an Ability that tempers gives one of its Knight's weapons (p98),
 * read off their own sheet rather than taken on trust.
 * @param {Actor|null} dealer
 * @param {string} itemId The weapon.
 * @returns {import("../rules/lasting-dice.js").LastingDie|null}
 */
function temperFor(dealer, itemId) {
	const ability = dealer?.items?.find((item) => item.type === "ability" && item.system.tempers);
	const weapon = dealer?.items?.get(itemId);
	const [faces] = parseDice(ability?.system.lastingDie);
	if (!faces || weapon?.type !== "weapon") return null;
	return { faces, label: ability.name, melee: true, item: weapon.id, itemName: weapon.name };
}

/** Tempers kept one after another, so two Wounds landing at once can't each overwrite the other's die. */
let tempering = Promise.resolve();

/**
 * Keep a tempered die for the dealer, if the Wound it's for is there to see:
 * the victim fights in the dealer's Combat and is Wounded, or worse.
 * @param {Actor|null} dealer
 * @param {string} itemId
 * @param {Actor|null} victim
 * @returns {Promise<boolean>}
 */
function keepTemper(dealer, itemId, victim) {
	const kept = tempering.then(() => {
		const die = temperFor(dealer, itemId);
		const combatant = die ? combatantOf(dealer) : null;
		if (!combatant || !woundedIn(victim, dealer, combatant.parent)) return false;
		return keepLastingDice(dealer, [die]);
	});
	tempering = kept.catch(() => false);
	return kept;
}

/**
 * @param {Actor|null} victim
 * @param {Actor|null} dealer
 * @param {Combat|null|undefined} combat The dealer's.
 * @returns {boolean} Whether the victim is somebody else in that Combat, and Wounded.
 */
function woundedIn(victim, dealer, combat) {
	if (!victim || !dealer || victim.uuid === dealer.uuid) return false;
	const { system } = victim;
	if (!(system?.wounded || system?.mortalWound || system?.slain)) return false;
	return !combat?.combatants || combat.combatants.some((combatant) => combatant.actor?.uuid === victim.uuid);
}

/**
 * A Wound dealt with a melee weapon gives it a die for the rest of the fight,
 * as an Ability that tempers says, and each Wound another (p98). The active
 * GM keeps every one, one after another, so two Wounds applied at once both count.
 * @param {Actor} dealer
 * @param {string} itemId The weapon the Wound was dealt with.
 * @param {Actor} victim Who was Wounded.
 * @returns {Promise<boolean>} Whether the die was kept: only somebody in a Combat keeps any.
 */
export async function temperWeapon(dealer, itemId, victim) {
	const die = temperFor(dealer, itemId);
	if (!die || !combatantOf(dealer)) return false;
	const gm = game.users.activeGM;
	const kept = gm?.isSelf
		? await keepTemper(dealer, itemId, victim)
		: Boolean(gm) && Boolean(await askActiveGM(TEMPER_QUERY, { dealer: dealer.uuid, item: itemId, victim: victim?.uuid }, `Couldn't temper ${dealer.name}'s weapon`));
	if (!kept) return false;
	await postCard(dealer, "note", { icon: "fa-solid fa-hammer", text: t("ability.tempered", { name: dealer.name, ability: die.label, weapon: die.itemName, faces: die.faces }) });
	return true;
}

/**
 * The GM giving a weapon its tempered die, for whoever applied the Wound, once
 * the Wound is there to see. The asker owns the dealer or the victim.
 * @param {{dealer?: string, item?: string, victim?: string}} data
 * @param {object} context
 * @returns {Promise<boolean>}
 */
export async function onTemperQuery(data = {}, context = {}) {
	const asker = queryAsker(context);
	if (!asker || !game.user.isGM) return false;
	const read = (uuid) => (typeof uuid === "string" ? fromUuidSync(uuid) : null);
	const dealer = read(data?.dealer);
	const victim = read(data?.victim);
	// Only whoever plays the dealer, or applied the Wound to the victim they own, may ask.
	if (![dealer, victim].some((actor) => actor?.testUserPermission?.(asker, "OWNER"))) return false;
	return keepTemper(dealer, data?.item, victim);
}

/** Answer users asking for a weapon to be tempered. Called during init. */
export function registerLastingQueries() {
	CONFIG.queries[TEMPER_QUERY] = onTemperQuery;
}
