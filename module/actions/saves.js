import { postCard, t } from "../chat/cards.js";
import { isSavePassed } from "../rules/virtues.js";

/**
 * @typedef {object} SaveResult
 * @property {string} virtue  "vig", "cla" or "spi".
 * @property {number} value   The Virtue the d20 had to meet.
 * @property {Roll} roll
 * @property {boolean} passed
 */

/**
 * Roll a Save without posting it, so callers such as Feats can fold the result
 * into their own chat card.
 * @param {Actor} actor
 * @param {string} virtue
 * @returns {Promise<SaveResult>}
 */
export async function evaluateSave(actor, virtue) {
	return saveAgainst(virtue, actor.system.virtues[virtue].value);
}

/**
 * @param {string} virtue
 * @param {number} value
 * @returns {Promise<SaveResult>}
 */
async function saveAgainst(virtue, value) {
	const roll = await new Roll("1d20").evaluate();
	return { virtue, value, roll, passed: isSavePassed(roll.total, value) };
}

/**
 * Template data for the `bastionland.save-result` partial.
 * @param {SaveResult} save
 */
export function saveContext(save) {
	return {
		label: t("save.title", { virtue: t(`virtues.${save.virtue}.label`) }),
		target: t("save.target", { value: save.value }),
		total: save.roll.total,
		passed: save.passed,
		result: t(save.passed ? "save.pass" : "save.fail")
	};
}

/**
 * Roll a Save and post it to chat.
 * @param {Actor} actor
 * @param {string} virtue
 * @returns {Promise<SaveResult>}
 */
export async function rollSave(actor, virtue) {
	const save = await evaluateSave(actor, virtue);
	await postCard(actor, "save", { save: saveContext(save) }, { rolls: [save.roll] });
	return save;
}

/**
 * Roll a Save for someone with no Actor of their own, such as the Seer who
 * knighted a Knight, whose Virtues are printed only on their Knight's page.
 * The card is spoken in their name.
 * @param {string} name
 * @param {string} virtue
 * @param {number} value
 * @returns {Promise<SaveResult>}
 */
export async function rollSaveFor(name, virtue, value) {
	const save = await saveAgainst(virtue, value);
	// Not getSpeaker, which would speak for whichever Token is selected.
	await postCard(null, "save", { save: saveContext(save) }, { rolls: [save.roll], speaker: { alias: name } });
	return save;
}

/**
 * Roll Morale: a SPI Save to stand rather than rout or surrender (Wavering
 * Morale, p10).
 * @param {Actor} actor
 * @returns {Promise<SaveResult>}
 */
export async function rollMorale(actor) {
	const save = await evaluateSave(actor, "spi");
	await postCard(actor, "save", {
		save: { ...saveContext(save), label: t("morale.title") },
		outcome: t(save.passed ? "morale.holds" : "morale.breaks"),
		hint: t("morale.hint")
	}, { rolls: [save.roll] });
	return save;
}
