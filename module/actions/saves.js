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
	const value = actor.system.virtues[virtue].value;
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
