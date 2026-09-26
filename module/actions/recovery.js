import { postCard, t } from "../chat/cards.js";
import { causedBy } from "./ledger.js";
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
	if (left > 0 || (isCounted(system) && system.restock)) await item.update({ "system.quantity.value": left });
	else await item.delete();
}

/**
 * A moment's calm and rest: GD returns to full and Fatigue is removed
 * (Recovery, p9).
 * @param {Actor} actor
 */
export async function rest(actor) {
	const value = actor.system.guard.max;
	await actor.update({ "system.guard.value": value, "system.fatigued": false }, causedBy("recovery"));
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
	await actor.update({ [`system.virtues.${virtue}.value`]: value }, causedBy("recovery"));
	await postCard(actor, "note", {
		icon: "fa-solid fa-heart-pulse",
		text: t("recovery.restored", { virtue: t(`virtues.${virtue}.label`), value })
	});
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
		await member.update({ [`system.virtues.${virtue}.value`]: value });
		return { name: member.name, lines: [t("recovery.restored", { virtue: t(`virtues.${virtue}.label`), value })] };
	}));
	await spendRemedy(item);
	await postCard(actor, "report", { title: name, tagline: t("remedy.tagline"), entries, hint: t("remedy.hint") });
	return entries;
}
