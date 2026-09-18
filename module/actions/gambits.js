import { postCard, t } from "../chat/cards.js";
import { GAMBIT_DETAILS, GAMBITS } from "../config.js";
import { UNSAVED_GAMBITS } from "../rules/attack.js";

/**
 * Template data describing a Gambit as the book prints it (Specifics of Combat, p10).
 * @param {string} key One of GAMBITS.
 */
export function gambitContext(key) {
	return {
		name: t(`gambits.names.${key}`),
		tagline: t("gambits.card.tagline"),
		effect: t(`gambits.${key}`),
		detail: GAMBIT_DETAILS.includes(key) ? t(`gambits.details.${key}`) : null,
		save: t(UNSAVED_GAMBITS.includes(key) ? "gambits.card.noSave" : "attack.saveToIgnore"),
		target: t("gambits.card.target"),
		strong: t("gambits.strong")
	};
}

/**
 * Show a Gambit from the sheet in chat. Spending a die on one belongs to the
 * Attack card, so this only states the rule for the table.
 * @param {Actor} actor
 * @param {string} key
 * @returns {Promise<ChatMessage>|null} Null for a key that isn't a Gambit.
 */
export function postGambit(actor, key) {
	if (!GAMBITS.includes(key)) return null;
	return postCard(actor, "gambit", { gambit: gambitContext(key) });
}
