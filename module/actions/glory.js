import { postCard, t } from "../chat/cards.js";
import { GLORY_AWARDS, changeGlory } from "../rules/glory.js";
import { calendarLabel, getCalendar } from "./calendar.js";
import { causedBy } from "./ledger.js";
import { chooseCompany } from "./time.js";

/**
 * Lines for a report card saying how a Knight's Glory changed.
 * @param {ReturnType<typeof changeGlory>} change
 * @returns {string[]}
 */
export function gloryLines(change) {
	const lines = [t("time.glory", { from: change.from, to: change.to })];
	if (change.rank) lines.push(t("glory.rank", { rank: t(`rank.${change.rank}`) }));
	return lines;
}

/**
 * Change one Knight's Glory, unless they are a Squire, who can't gain it.
 * @param {Actor} actor
 * @param {number} amount
 * @returns {Promise<string[]>} Lines for a report card.
 */
export async function adjustGlory(actor, amount) {
	if (!actor.system.gainsGlory) return [t("glory.squire")];
	const change = changeGlory(actor.system.glory, amount);
	if (change.to !== actor.system.glory) await actor.update({ "system.glory": change.to }, causedBy("glory"));
	return gloryLines(change);
}

/**
 * Award 1 Glory by other means (p6): to every Knight who played a part in a
 * Myth resolved, to the winner of a tournament, or to every Knight on the
 * victorious side of a battle remembered in history. GMs only.
 * @param {string} key One of GLORY_AWARDS.
 * @returns {Promise<object[]|null>} The report's entries.
 */
export async function awardGlory(key) {
	if (!game.user.isGM || !GLORY_AWARDS.includes(key)) return null;
	const title = t(`glory.awards.${key}.label`);
	const company = await chooseCompany({
		title,
		icon: "fa-solid fa-crown",
		intro: t(`glory.awards.${key}.intro`),
		ok: t("glory.award"),
		knightsOnly: true
	});
	if (!company) return null;
	if (!company.length) {
		ui.notifications.info(t("glory.nobody"));
		return null;
	}

	const entries = await Promise.all(company.map(async ({ actor }) => ({ name: actor.name, lines: await adjustGlory(actor, 1) })));
	await postCard(null, "report", { title, tagline: calendarLabel(getCalendar()), entries, hint: t(`glory.awards.${key}.hint`) });
	return entries;
}
