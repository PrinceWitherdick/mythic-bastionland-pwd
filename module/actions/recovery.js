import { postCard, t } from "../chat/cards.js";

/**
 * A moment's calm and rest: GD returns to full and Fatigue is removed
 * (Recovery, p9).
 * @param {Actor} actor
 */
export async function rest(actor) {
	const value = actor.system.guard.max;
	await actor.update({ "system.guard.value": value, "system.fatigued": false });
	await postCard(actor, "note", {
		icon: "fa-solid fa-mug-hot",
		text: t("recovery.rested", { value })
	});
}

/**
 * Restore a Virtue to its maximum, as a Remedy, Action or new Season does.
 * @param {Actor} actor
 * @param {string} virtue "vig", "cla" or "spi".
 */
export async function restoreVirtue(actor, virtue) {
	const value = actor.system.virtues[virtue].max;
	await actor.update({ [`system.virtues.${virtue}.value`]: value });
	await postCard(actor, "note", {
		icon: "fa-solid fa-heart-pulse",
		text: t("recovery.restored", { virtue: t(`virtues.${virtue}.label`), value })
	});
}
