import { postCard, t } from "../chat/cards.js";
import { FEATS } from "../config.js";
import { evaluateSave, saveContext } from "./saves.js";

/**
 * Pay for a Feat: refuse while Fatigued, otherwise make the Feat's Save and
 * become Fatigued on a failure (Specifics of Combat, p10).
 * @param {Actor} actor
 * @param {string} key "smite", "focus" or "deny".
 * @returns {Promise<import("./saves.js").SaveResult|null>} Null if the Feat could not be used.
 */
export async function resolveFeat(actor, key) {
	const feat = FEATS.find((candidate) => candidate.key === key);
	if (!feat) return null;

	if (actor.system.fatigued) {
		ui.notifications.warn(t("feats.alreadyFatigued", { name: actor.name }));
		return null;
	}

	const save = await evaluateSave(actor, feat.virtue);
	if (!save.passed) await actor.update({ "system.fatigued": true });
	return save;
}

/**
 * Template data describing a Feat and the Save it cost.
 * @param {string} key
 * @param {import("./saves.js").SaveResult} save
 */
export function featContext(key, save) {
	return {
		name: t(`feats.${key}.name`),
		tagline: t(`feats.${key}.tagline`),
		use: t(`feats.${key}.use`),
		save: saveContext(save),
		outcome: t(save.passed ? "feats.avoidedFatigue" : "feats.becameFatigued")
	};
}

/**
 * Use a Feat from the sheet and post it to chat.
 * @param {Actor} actor
 * @param {string} key
 */
export async function performFeat(actor, key) {
	const save = await resolveFeat(actor, key);
	if (!save) return null;
	await postCard(actor, "feat", { feat: featContext(key, save) }, { rolls: [save.roll] });
	return save;
}
