import { chooseDialog, confirmDialog } from "../apps/ui.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import {
	CRISES,
	collectionsResult,
	crisesDrawn,
	crisisFor,
	crisisResult,
	domainRuledBy,
	dramaResult
} from "../rules/dominion.js";
import { escapeHTML } from "../rules/text.js";
import { seasonKey } from "../rules/time.js";
import { getCalendar } from "./calendar.js";
import { rollSpark } from "./referee-rolls.js";

/** @param {string} key One of CRISES. */
const crisisName = (key) => t(`domain.crises.${key}.name`);

/**
 * A card entry describing a Crisis and how to resolve it.
 * @param {string} key
 */
const crisisEntry = (key) => ({ name: crisisName(key), lines: [t(`domain.crises.${key}.flavour`), t(`domain.crises.${key}.resolution`)] });

/**
 * @param {Actor} domain Once its Crises are saved.
 * @returns {string|null} A warning when it faces enough to fall into misrule.
 */
const misruleWarning = (domain) =>
	(domain.system.misruleDue ? t("domain.misruleDue", { count: domain.system.crises.length }) : null);

/**
 * @param {number} count
 * @param {string[]} taken
 * @returns {Promise<{rolls: Roll[], crises: string[]}>} Up to `count` new Crises, each rolled on a d6.
 */
async function drawCrises(count, taken) {
	const rolls = [];
	const crises = [];
	for (let drawn = 0; drawn < count; drawn++) {
		const roll = await new Roll("1d6").evaluate();
		rolls.push(roll);
		const key = crisisFor(roll.total, [...taken, ...crises]);
		if (key) crises.push(key);
	}
	return { rolls, crises };
}

/**
 * The Crisis Roll (p20), made at the start of a Season or on returning from a
 * long absence. A Calamity brings two Crises at once, and a Dilemma asks which
 * of two to take.
 * @param {Actor} domain
 */
export async function crisisRoll(domain) {
	const roll = await new Roll("1d6").evaluate();
	const result = crisisResult(roll.total);
	const facing = [...domain.system.crises];
	const drawn = await drawCrises(crisesDrawn(result), facing);

	let added = drawn.crises;
	const notes = [];
	if (result === "dilemma" && drawn.crises.length > 1) {
		const choice = await chooseDialog({
			title: t("domain.dilemmaTitle"),
			icon: "fa-solid fa-scale-unbalanced",
			message: [
				t("domain.dilemmaIntro", { name: escapeHTML(domain.name) }),
				...drawn.crises.map((key) => `<strong>${crisisName(key)}</strong>: ${t(`domain.crises.${key}.resolution`)}`)
			],
			buttons: drawn.crises.map((key, index) => ({ action: key, label: crisisName(key), default: index === 0 }))
		});
		added = drawn.crises.includes(choice) ? [choice] : [];
		if (!added.length) notes.push(t("domain.dilemmaOpen", { options: drawn.crises.map(crisisName).join(", ") }));
	}

	const crises = [...facing, ...added];
	await domain.update({ "system.crises": crises, "system.crisisRolled": seasonKey(getCalendar()) });
	await postCard(domain, "report", {
		title: t("domain.crisisRoll"),
		tagline: t(`domain.results.crisis.${result}`),
		d6: roll.total,
		entries: added.map(crisisEntry),
		hint: [...notes, misruleWarning(domain)].filter(Boolean).join(" ")
	}, { rolls: [roll, ...drawn.rolls] });
	return added;
}

/**
 * Give a Domain a Crisis the Referee chooses, such as one a failed task brings.
 * @param {Actor} domain
 */
export async function addCrisis(domain) {
	const open = CRISES.filter((key) => !domain.system.crises.includes(key));
	if (!open.length) {
		ui.notifications.info(t("domain.allCrises", { name: domain.name }));
		return null;
	}
	const choice = await chooseDialog({
		title: t("domain.addCrisis"),
		icon: "fa-solid fa-fire",
		classes: ["bastionland-referee-rolls"],
		message: t("domain.addCrisisIntro", { name: escapeHTML(domain.name) }),
		buttons: open.map((key, index) => ({ action: key, label: crisisName(key), default: index === 0 }))
	});
	if (!open.includes(choice)) return null;

	await domain.update({ "system.crises": [...domain.system.crises, choice] });
	await postCard(domain, "report", {
		title: t("domain.addCrisis"),
		tagline: domain.name,
		entries: [crisisEntry(choice)],
		hint: misruleWarning(domain)
	});
	return choice;
}

/**
 * Mark one of a Domain's Crises resolved.
 * @param {Actor} domain
 * @param {number} index Its place in the Domain's list.
 */
export async function resolveCrisis(domain, index) {
	const key = domain.system.crises[index];
	if (!key) return null;
	await domain.update({ "system.crises": domain.system.crises.toSpliced(index, 1) });
	await postCard(domain, "note", {
		icon: "fa-solid fa-check",
		text: t("domain.resolved", { crisis: crisisName(key), name: domain.name })
	});
	return key;
}

/**
 * Increased Collections (p21): a Steward squeezes more from the Vassals. It can
 * bring misrule at once, or a Crisis with the coffers filled.
 * @param {Actor} domain
 */
export async function increasedCollections(domain) {
	const roll = await new Roll("1d6").evaluate();
	const result = collectionsResult(roll.total);
	const rolls = [roll];
	const update = {};
	let entries = [];

	if (result === "misrule") update["system.misrule"] = true;
	if (result === "crisis") {
		const drawn = await drawCrises(1, domain.system.crises);
		rolls.push(...drawn.rolls);
		update["system.crises"] = [...domain.system.crises, ...drawn.crises];
		entries = drawn.crises.map(crisisEntry);
	}
	if (!foundry.utils.isEmpty(update)) await domain.update(update);

	await postCard(domain, "report", {
		title: t("domain.collections"),
		tagline: t(`domain.results.collections.${result}`),
		d6: roll.total,
		entries,
		hint: result === "misrule" ? t("domain.misruleHint") : misruleWarning(domain)
	}, { rolls });
	return result;
}

/**
 * Drama in Court (p21): how the ruler is caught up in this Season's drama. When
 * Import Book Art has brought in the Spark Tables, the Drama table gives a prompt.
 * @param {Actor} domain
 */
export async function dramaInCourt(domain) {
	const roll = await new Roll("1d6").evaluate();
	const rolls = [roll];
	const index = await loadArtIndex();
	const table = index?.spark?.find((page) => page.key === "civilisation")?.tables.find((candidate) => /^drama$/i.test(candidate.name));

	let prompt = null;
	if (table) {
		const spark = await rollSpark(table);
		rolls.push(spark.roll);
		prompt = t("domain.dramaPrompt", { prompt: spark.prompt });
	}

	const result = dramaResult(roll.total);
	await postCard(domain, "report", {
		title: t("domain.drama"),
		tagline: t(`domain.results.drama.${result}`),
		d6: roll.total,
		hint: prompt
	}, { rolls });
	return result;
}

/**
 * As a Season ends, every Domain left with 3 or more unresolved Crises falls
 * into misrule (p20). GMs only.
 * @returns {Promise<{entries: object[], hint: string|null}>} For the Season's card.
 */
export async function settleDomains() {
	const domains = game.actors.filter((actor) => actor.type === "domain");
	const due = domains.filter((domain) => domain.system.misruleDue);
	const entries = due.map((domain) => ({ name: domain.name, lines: [t("domain.fellIntoMisrule", { count: domain.system.crises.length })] }));
	if (due.length) await Actor.implementation.updateDocuments(due.map((domain) => ({ _id: domain.id, "system.misrule": true })));
	return { entries, hint: domains.length ? t("domain.seasonHint") : null };
}

/**
 * @param {Actor} knight
 * @returns {Actor|null} The Domain this Knight rules, if it still exists.
 */
export function knightDomain(knight) {
	const domain = knight.system.domain ? fromUuidSync(knight.system.domain) : null;
	return domain?.documentName === "Actor" && domain.type === "domain" ? domain : null;
}

/**
 * Make a Domain the one a Knight rules, writing the Knight in as its ruler if
 * nobody is yet.
 * @param {Actor} knight
 * @param {Actor} domain
 */
export async function linkKnightDomain(knight, domain) {
	await knight.update({ "system.domain": domain.uuid });
	if (!domain.system.ruler.trim() && domain.isOwner) await domain.update({ "system.ruler": knight.name });
}

/**
 * Open the Domain a Knight rules. A Knight without one is offered a Domain
 * already naming them as its ruler, or else a new one, founded beside them in
 * the Actors directory.
 * @param {Actor} knight
 * @returns {Promise<Actor|null>} The Domain.
 */
export async function openKnightDomain(knight) {
	const linked = knightDomain(knight);
	if (linked) {
		linked.sheet.render({ force: true });
		return linked;
	}
	const name = escapeHTML(knight.name);
	if (!knight.isOwner) {
		ui.notifications.info(t("domain.noneLinked", { name: knight.name }));
		return null;
	}

	// Domains other Knights already rule aren't offered.
	const ruled = new Set(game.actors.filter((actor) => actor.type === "knight" && actor !== knight).map((actor) => actor.system.domain));
	const named = domainRuledBy(game.actors.filter((actor) => actor.type === "domain" && !ruled.has(actor.uuid)), knight.name);

	let domain = null;
	if (named) {
		const choice = await chooseDialog({
			title: t("domain.askTitle"),
			icon: "fa-solid fa-chess-rook",
			message: t("domain.askNamed", { name, domain: escapeHTML(named.name) }),
			buttons: [
				{ action: "link", icon: "fa-solid fa-link", label: t("domain.linkNamed", { domain: named.name }), default: true },
				{ action: "found", icon: "fa-solid fa-chess-rook", label: t("domain.found") }
			]
		});
		if (choice === "link") domain = named;
		else if (choice !== "found") return null;
	} else if (!(await confirmDialog({
		title: t("domain.askTitle"),
		icon: "fa-solid fa-chess-rook",
		message: t("domain.ask", { name })
	}))) return null;

	if (!domain) {
		if (!game.user.can("ACTOR_CREATE")) {
			ui.notifications.warn(t("domain.cantCreate"));
			return null;
		}
		// Players who can see the Knight can see their Domain. Only a GM may hand ownership to others.
		domain = await Actor.implementation.create({
			name: t("domain.newName", { knight: knight.name }),
			type: "domain",
			folder: knight.folder?.id ?? null,
			system: { ruler: knight.name },
			...(game.user.isGM ? { ownership: foundry.utils.deepClone(knight.ownership) } : {})
		});
		if (!domain) return null;
	}
	await linkKnightDomain(knight, domain);
	domain.sheet.render({ force: true });
	return domain;
}
