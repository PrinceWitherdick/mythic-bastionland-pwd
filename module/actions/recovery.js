import { confirmDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { causedBy } from "./ledger.js";
import { acceptAfterTelling } from "./saves.js";
import { VIRTUES } from "../rules/virtues.js";
import { chooseCompany } from "./time.js";
import { countAfter, isCounted } from "../rules/restock.js";

/**
 * A Remedy is used up (p9): one of several carried is taken off the count,
 * and the last goes, unless it's restocked, when it waits at none for that.
 * @param {Item} item
 */
async function spendRemedy(item) {
	const { system } = item;
	const left = isCounted(system) ? countAfter(system.quantity, -1) : 0;
	if (left > 0 || (isCounted(system) && system.restock)) await item.update({ "system.quantity.value": left }, causedBy("recovery"));
	else await item.delete();
}

/**
 * What a short rest restores once the fighting is over (Recovery, p9):
 * GD returns to full and Fatigue is removed. With their guard back up they've
 * remedied being caught with it down, so a marked Exposed goes too (p8).
 * CLA 0 Exposes them still, until their CLA comes back.
 * @param {Actor} actor
 * @returns {object} The Actor update.
 */
const restUpdate = (actor) => ({ "system.guard.value": actor.system.guard.max, "system.fatigued": false, "system.exposed": false });

/**
 * A moment's calm and rest: GD returns to full, Fatigue is removed, and they
 * are no longer Exposed (Recovery, p9).
 * @param {Actor} actor
 */
export async function rest(actor) {
	const value = actor.system.guard.max;
	await actor.update(restUpdate(actor), causedBy("recovery"));
	await postCard(actor, "note", {
		icon: "fa-solid fa-mug-hot",
		text: t("recovery.rested", { value })
	});
}

/**
 * Rest once the GM has read what it does and accepted: the NPC sheet's Rest,
 * which has no Recovery list beside it to say so.
 * @param {Actor} actor
 * @returns {Promise<boolean>} Whether they rested.
 */
export async function restIfAccepted(actor) {
	const { value, max } = actor.system.guard;
	if (!(await acceptAfterTelling(actor, "recovery.rest", "fa-solid fa-mug-hot", { value, max }))) return false;
	await rest(actor);
	return true;
}

/**
 * The danger has passed (Recovery, p9): once a Combat ends, offer the active
 * GM to restore Guard, remove Fatigue and end a marked Exposed for everybody
 * in it still standing who needs it, on one card.
 * @param {Combat} combat
 * @returns {Promise<Actor[]|null>} Those rested, or null when nobody was.
 */
export async function restAfterCombat(combat) {
	if (!game.users.activeGM?.isSelf || !combat?.started) return null;
	const actors = [];
	for (const combatant of combat.combatants) {
		const { actor } = combatant;
		const guard = actor?.system?.guard;
		// A ship or wall doesn't catch its breath: its GD comes back by repair.
		// The Slain rest no more, but somebody Exhausted at VIG 0 still catches their breath.
		if (!guard || actor.type === "structure" || actors.includes(actor) || actor.system.slain) continue;
		if (guard.value < guard.max || actor.system.fatigued || actor.system.exposed) actors.push(actor);
	}
	if (!actors.length) return null;
	const names = actors.map((actor) => actor.name).join(", ");
	const confirmed = await confirmDialog({ title: t("recovery.afterCombatTitle"), icon: "fa-solid fa-mug-hot", message: t("recovery.afterCombat", { names: foundry.utils.escapeHTML(names) }) });
	if (!confirmed) return null;
	await Promise.all(actors.map((actor) => actor.update(restUpdate(actor), causedBy("recovery"))));
	await postCard(null, "note", { icon: "fa-solid fa-mug-hot", text: t("recovery.restedAfterCombat", { names }) });
	return actors;
}

/**
 * Restore a Virtue to its maximum, as a Remedy, Action or new Season does.
 * @param {Actor} actor
 * @param {string} virtue "vig", "cla" or "spi".
 * @param {{icon: string, text: (value: number) => string}} [card] What the card says, where it isn't the plain restoring.
 */
export async function restoreVirtue(actor, virtue, card = {
	icon: "fa-solid fa-heart-pulse",
	text: (value) => t("recovery.restored", { virtue: t(`virtues.${virtue}.label`), value })
}) {
	const value = actor.system.virtues[virtue].max;
	await actor.update({ [`system.virtues.${virtue}.value`]: value }, causedBy("recovery"));
	await postCard(actor, "note", { icon: card.icon, text: card.text(value) });
}

/**
 * Indulge a Passion: the Knight's own way of restoring SPI (p7).
 * @param {Actor} actor
 * @param {Item|undefined} item The Passion.
 * @returns {Promise<boolean>} Whether SPI was restored.
 */
export async function indulgePassion(actor, item) {
	const spi = actor.system.virtues?.spi;
	if (!spi || !item) return false;
	if (spi.value >= spi.max) {
		ui.notifications.info(t("passion.full", { name: actor.name }));
		return false;
	}
	await restoreVirtue(actor, "spi", {
		icon: "fa-solid fa-wine-glass",
		text: (value) => t("passion.indulged", { name: actor.name, passion: item.name, value })
	});
	return true;
}

/**
 * Use a Remedy (p9): everybody present has its Virtue restored, and the Remedy
 * is used up.
 * @param {Actor} actor Whoever carries it.
 * @param {Item|undefined} item
 * @returns {Promise<object[]|null>}
 */
export async function useRemedy(actor, item) {
	const virtue = item?.system.remedy;
	if (!VIRTUES.includes(virtue)) return null;

	const abbr = t(`virtues.${virtue}.abbr`);
	const company = await chooseCompany({
		title: item.name,
		icon: "fa-solid fa-flask",
		intro: t("remedy.intro", { virtue: abbr }),
		ok: t("remedy.use", { virtue: abbr }),
		present: [actor]
	});
	if (!company?.length) return null;

	const name = item.name;
	const entries = await Promise.all(company.map(async ({ actor: member }) => {
		const value = member.system.virtues[virtue].max;
		await member.update({ [`system.virtues.${virtue}.value`]: value }, causedBy("recovery"));
		return { name: member.name, lines: [t("recovery.restored", { virtue: t(`virtues.${virtue}.label`), value })] };
	}));
	await spendRemedy(item);
	await postCard(actor, "report", { title: name, tagline: t("remedy.tagline"), entries, hint: t("remedy.hint") });
	return entries;
}
