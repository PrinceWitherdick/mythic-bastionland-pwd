import { t } from "../chat/cards.js";
import { countAfter, isCounted, isUsedUp } from "../rules/restock.js";
import { parseDice } from "../rules/attack.js";
import { lastingOf, withLasting, withoutLasting } from "../rules/lasting-dice.js";
import { SYSTEM_ID } from "../system-id.js";

/** The Combatant flag holding somebody's lasting dice. Ending the Combat ends them. */
const LASTING_FLAG = "lastingDice";

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
export const lastingDieLabel = (die) => t("attack.lastingDie", { label: die.label || t("attack.bonus"), faces: die.faces });

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
	if (!(await keepLastingDice(actor, [{ faces, label: item.name }]))) {
		ui.notifications.warn(t("ability.notInCombat", { name: actor.name }));
		return false;
	}
	if (isCounted(item.system)) await item.update({ "system.quantity.value": countAfter(item.system.quantity, -1) });
	return true;
}
