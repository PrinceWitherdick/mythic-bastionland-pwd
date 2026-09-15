import { inputDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { AGES } from "../config.js";
import { changeGlory } from "../rules/glory.js";
import { isScarPending, scarForRoll } from "../rules/scars.js";
import {
	AGE_PURSUITS,
	AGING_VIRTUE_ROLL,
	HARDSHIPS,
	OLD_AGE_LOSS,
	SEASON_PURSUITS,
	afterOldAge,
	agedScore,
	agingSteps,
	nextAge,
	nextPhase,
	nextSeason
} from "../rules/time.js";
import { VIRTUES } from "../rules/virtues.js";
import { calendarLabel, getCalendar, setCalendar } from "./calendar.js";
import { settleDomains } from "./dominion.js";
import { gloryLines } from "./glory.js";
import { settleScar } from "./scars.js";

/**
 * Ask who takes part in something the Company does together. Those given as
 * present and everybody whose Token is selected are listed ticked, then every
 * Knight, ticked when a player owns them. Players see only the characters they
 * own, since those are all they can change. With pursuits, each picks one too.
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.icon
 * @param {string} options.intro
 * @param {string} options.ok
 * @param {Actor[]} [options.present]
 * @param {string[]} [options.pursuits]
 * @param {boolean} [options.knightsOnly] Leave out selected Tokens that aren't Knights.
 * @returns {Promise<{actor: Actor, pursuit: string|null}[]|null>} Those ticked, or null if closed.
 */
export async function chooseCompany({ title, icon, intro, ok, present = [], pursuits = [], knightsOnly = false }) {
	const candidates = [];
	const seen = new Set();
	const add = (actor, included) => {
		if (!actor?.system?.virtues || (knightsOnly && actor.type !== "knight") || seen.has(actor.uuid)) return;
		if (!game.user.isGM && !actor.isOwner) return;
		seen.add(actor.uuid);
		candidates.push({ actor, included });
	};
	for (const actor of present) add(actor, true);
	for (const token of canvas?.tokens?.controlled ?? []) add(token.actor, true);
	for (const actor of game.actors.filter((candidate) => candidate.type === "knight")) add(actor, actor.hasPlayerOwner);

	const data = await inputDialog({
		title,
		icon,
		template: "company",
		context: {
			intro,
			members: candidates.map(({ actor, included }, index) => ({ index, name: actor.name, included })),
			pursuits: pursuits.map((key) => ({ key, label: t(`time.pursuits.${key}.label`), hint: t(`time.pursuits.${key}.hint`) }))
		},
		ok: { label: ok }
	});
	if (!data) return null;

	return candidates
		.map(({ actor }, index) => ({ actor, included: data[`include-${index}`], pursuit: data[`pursuit-${index}`] }))
		.filter(({ included }) => included)
		.map(({ actor, pursuit }) => ({ actor, pursuit: pursuits.includes(pursuit) ? pursuit : null }));
}

/**
 * Settle every Scar whose GD increase comes with the next Season.
 * @param {Actor} actor
 * @returns {Promise<{rolls: Roll[], lines: string[], guardMax: number}>}
 */
async function settleSeasonScars(actor) {
	let guardMax = actor.system.guard.max;
	const rolls = [];
	const lines = [];
	const due = actor.items.filter((item) => item.type === "scar" && isScarPending(item.system) && scarForRoll(item.system.roll)?.bySeason);
	for (const item of due) {
		const settled = await settleScar(item, guardMax);
		if (settled.roll) rolls.push(settled.roll);
		guardMax = settled.guardMax;
		lines.push(settled.line);
	}
	return { rolls, lines, guardMax };
}

/**
 * What passes for each member of the Company as the Season or Age turns:
 * Virtues restored and Scars due by the next Season settled, and for a new Age
 * 1 Glory, and d12 VIG lost by the Old.
 * @param {{actor: Actor, pursuit: string|null}[]} company
 * @param {object} options
 * @param {boolean} options.newAge
 * @returns {Promise<{rolls: Roll[], entries: object[]}>}
 */
async function passTime(company, { newAge }) {
	const rolls = [];
	const entries = [];
	const updates = [];
	for (const { actor, pursuit } of company) {
		const { system } = actor;
		const update = Object.fromEntries(VIRTUES.map((key) => [`system.virtues.${key}.value`, system.virtues[key].max]));
		const lines = [t("time.restored")];

		if (newAge && Number.isInteger(system.glory) && system.gainsGlory) {
			const change = changeGlory(system.glory, 1);
			update["system.glory"] = change.to;
			lines.push(...gloryLines(change));
		}
		if (newAge && system.age === "old") {
			const roll = await new Roll(OLD_AGE_LOSS).evaluate();
			rolls.push(roll);
			const { max, diesPeacefully } = afterOldAge(system.virtues.vig.max, roll.total);
			update["system.virtues.vig.max"] = max;
			update["system.virtues.vig.value"] = max;
			lines.push(t("time.oldAge", { amount: roll.total, from: system.virtues.vig.max, to: max }));
			if (diesPeacefully) lines.push(t("time.diesPeacefully"));
		}

		const scars = await settleSeasonScars(actor);
		rolls.push(...scars.rolls);
		lines.push(...scars.lines);
		if (scars.guardMax !== system.guard.max) update["system.guard.max"] = scars.guardMax;

		updates.push([actor, update]);
		entries.push({ name: actor.name, pursuit: pursuit ? t(`time.pursuits.${pursuit}.label`) : null, lines });
	}
	await Promise.all(updates.map(([actor, update]) => actor.update(update)));
	return { rolls, entries };
}

/**
 * Move on to the next Phase and post it. GMs only.
 * @returns {Promise<import("../rules/time.js").Calendar|null>}
 */
export async function advancePhase() {
	if (!game.user.isGM) return null;
	const calendar = nextPhase(getCalendar());
	await setCalendar(calendar);
	await postCard(null, "report", {
		title: t(`time.phases.${calendar.phase}`),
		tagline: calendarLabel(calendar),
		hint: t(`time.phaseHints.${calendar.phase}`)
	});
	return calendar;
}

/**
 * Turn the Season or the Age: the Company takes part, then every Domain due
 * for misrule falls into it. GMs only.
 * @param {object} options
 * @param {boolean} options.newAge
 * @param {(calendar: object) => object} options.next  Moves the calendar on.
 * @param {string} options.label  Path below `bastionland.` naming the turn.
 * @param {string} options.icon
 * @param {string[]} options.pursuits
 * @param {(before: object, after: object) => string} options.intro
 * @param {(after: object) => string} options.turned The report's title.
 * @returns {Promise<import("../rules/time.js").Calendar|null>}
 */
async function turnTime({ newAge, next, label, icon, pursuits, intro, turned }) {
	if (!game.user.isGM) return null;
	const before = getCalendar();
	const after = next(before);
	const company = await chooseCompany({ title: t(label), icon, intro: intro(before, after), ok: t(label), pursuits, knightsOnly: true });
	if (!company) return null;

	await setCalendar(after);
	const { rolls, entries } = await passTime(company, { newAge });
	const domains = await settleDomains();
	await postCard(null, "report", {
		title: turned(after),
		tagline: calendarLabel(after),
		entries: [...entries, ...domains.entries],
		hint: [t("time.unresolvedHint"), domains.hint].filter(Boolean).join(" ")
	}, { rolls });
	return after;
}

/**
 * Turn the Season (Between Seasons, p17): each Knight taking part has their
 * Virtues restored and chooses a pursuit. GMs only.
 * @returns {Promise<import("../rules/time.js").Calendar|null>}
 */
export function turnSeason() {
	const season = (calendar) => t(`time.seasons.${calendar.season}`);
	return turnTime({
		newAge: false,
		next: nextSeason,
		label: "time.turnSeason",
		icon: "fa-solid fa-leaf",
		pursuits: SEASON_PURSUITS,
		intro: (before, after) => t("time.seasonIntro", { season: season(before), next: season(after) }),
		turned: (after) => t("time.seasonTurned", { season: season(after) })
	});
}

/**
 * Turn the Age (Between Ages, p17): each Knight taking part has their Virtues
 * restored, gains 1 Glory and chooses a pursuit, and the Old lose d12 VIG.
 * The new Age begins in Spring. GMs only.
 * @returns {Promise<import("../rules/time.js").Calendar|null>}
 */
export function turnAge() {
	return turnTime({
		newAge: true,
		next: nextAge,
		label: "time.turnAge",
		icon: "fa-solid fa-hourglass-end",
		pursuits: AGE_PURSUITS,
		intro: (_before, after) => t("time.ageIntro", { age: after.age }),
		turned: (after) => t("time.ageTurned", { age: after.age })
	});
}

/**
 * Virtue Loss from hardship on the road (Travel, p18): everybody ticked loses
 * d6 from the Virtue it costs. GMs only.
 * @param {string} key One of HARDSHIPS.
 * @returns {Promise<object[]|null>}
 */
export async function sufferHardship(key) {
	if (!game.user.isGM) return null;
	const hardship = HARDSHIPS.find((candidate) => candidate.key === key);
	if (!hardship) return null;

	const name = t(`time.hardship.kinds.${key}.label`);
	const company = await chooseCompany({
		title: name,
		icon: "fa-solid fa-person-hiking",
		intro: `${t(`time.hardship.kinds.${key}.hint`)} ${t("time.hardship.intro")}`,
		ok: t("time.hardship.roll")
	});
	if (!company) return null;
	if (!company.length) {
		ui.notifications.info(t("time.hardship.none"));
		return null;
	}

	const virtue = t(`virtues.${hardship.virtue}.abbr`);
	const rolls = [];
	const entries = [];
	const updates = [];
	for (const { actor } of company) {
		const roll = await new Roll("1d6").evaluate();
		rolls.push(roll);
		const from = actor.system.virtues[hardship.virtue].value;
		const to = Math.max(0, from - roll.total);
		updates.push(actor.update({ [`system.virtues.${hardship.virtue}.value`]: to }));
		entries.push({ name: actor.name, lines: [t("time.hardship.lost", { amount: roll.total, virtue, from, to })] });
	}
	await Promise.all(updates);
	await postCard(null, "report", { title: name, tagline: calendarLabel(getCalendar()), entries, hint: t("time.hardship.notDamage") }, { rolls });
	return entries;
}

/**
 * Change a character's Age. Growing Mature or Old offers to reroll each Virtue
 * on d12+d6, keeping the higher on becoming Mature and the lower on becoming Old.
 * @param {Actor} actor
 * @param {string} age One of AGES.
 */
export async function changeAge(actor, age) {
	if (!AGES.includes(age) || age === actor.system.age) return null;
	const steps = agingSteps(actor.system.age, age);
	if (!steps.length) return actor.update({ "system.age": age });

	const choice = await foundry.applications.api.DialogV2.wait({
		window: { title: t("time.aging.title"), icon: "fa-solid fa-hourglass-half" },
		classes: ["bastionland-dialog"],
		content: `<p>${t("time.aging.intro", { name: foundry.utils.escapeHTML(actor.name), age: t(`age.${age}`) })}</p>`,
		buttons: [
			{ action: "roll", label: t("time.aging.roll"), icon: "fa-solid fa-dice", default: true },
			{ action: "skip", label: t("time.aging.skip"), icon: "fa-solid fa-forward" }
		],
		rejectClose: false
	});
	if (choice === "skip") return actor.update({ "system.age": age });
	if (choice !== "roll") return null;

	const scores = Object.fromEntries(VIRTUES.map((key) => [key, { value: actor.system.virtues[key].value, max: actor.system.virtues[key].max }]));
	const rolls = [];
	const lines = [];
	for (const step of steps) {
		for (const key of VIRTUES) {
			const roll = await new Roll(AGING_VIRTUE_ROLL).evaluate();
			rolls.push(roll);
			const aged = agedScore(scores[key], roll.total, step);
			lines.push({
				label: t("time.aging.line", { age: t(`age.${step}`), virtue: t(`virtues.${key}.abbr`) }),
				value: t("time.aging.value", { rolled: roll.total, from: scores[key].max, to: aged.max })
			});
			scores[key] = aged;
		}
	}

	const update = { "system.age": age };
	for (const key of VIRTUES) {
		update[`system.virtues.${key}.max`] = scores[key].max;
		update[`system.virtues.${key}.value`] = scores[key].value;
	}
	await actor.update(update);
	await postCard(actor, "creation", {
		title: t("time.aging.title"),
		tagline: steps.map((step) => t(`time.aging.${step}`)).join(" · "),
		lines
	}, { rolls });
	return scores;
}
