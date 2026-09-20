import { postCard, t } from "../chat/cards.js";
import { FEATS } from "../config.js";
import { causedBy } from "./ledger.js";
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

	// Knights know every Feat. Of everybody else, only those who "Can" perform one do.
	if (!actor.system.knowsFeat(key)) {
		ui.notifications.warn(t("feats.notKnown", { name: actor.name, feat: t(`feats.${key}.name`) }));
		return null;
	}

	if (actor.system.fatigued) {
		ui.notifications.warn(t("feats.alreadyFatigued", { name: actor.name }));
		return null;
	}

	const save = await evaluateSave(actor, feat.virtue);
	if (!save.passed) await actor.update({ "system.fatigued": true }, causedBy("feat"));
	return save;
}

/**
 * Template data describing a Feat as the book prints it (p10).
 * @param {string} key
 */
function featText(key) {
	const { virtue } = FEATS.find((candidate) => candidate.key === key);
	return {
		name: t(`feats.${key}.name`),
		tagline: t(`feats.${key}.tagline`),
		use: t(`feats.${key}.use`),
		cost: t("feats.saveOrFatigue", { virtue: t(`virtues.${virtue}.abbr`) })
	};
}

/**
 * Template data describing a Feat and the Save it cost.
 * @param {string} key
 * @param {import("./saves.js").SaveResult} save
 */
export function featContext(key, save) {
	return {
		...featText(key),
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

/**
 * Show a Feat in chat without performing it: no Save and no Fatigue. This is
 * for someone who can see a sheet but not act for it, as a move's text is
 * posted for them in Stonetop.
 * @param {Actor} actor
 * @param {string} key
 * @returns {Promise<ChatMessage>|null} Null if the actor doesn't know the Feat.
 */
export function showFeat(actor, key) {
	if (!FEATS.some((candidate) => candidate.key === key) || !actor.system.knowsFeat(key)) return null;
	return postCard(actor, "feat", { feat: featText(key) });
}
