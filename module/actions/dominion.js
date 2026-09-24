import { chooseDialog, confirmDialog, inputDialog } from "../apps/ui.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import {
	CRISES,
	collectionsResult,
	crisesDrawn,
	crisisFor,
	crisisResult,
	domainRuledBy,
	dramaResult,
	isInTurmoil,
	isSameName
} from "../rules/dominion.js";
import { dramaCandidates } from "../rules/court.js";
import { escapeHTML } from "../rules/text.js";
import { seasonKey } from "../rules/time.js";
import { getCalendar } from "./calendar.js";
import { rollSpark } from "./referee-rolls.js";
import { heirOf } from "./succession.js";

/** @param {string} key One of CRISES. */
const crisisName = (key) => t(`domain.crises.${key}.name`);

/**
 * A card entry describing a Crisis and how to resolve it.
 * @param {string} key
 */
export const crisisEntry = (key) => ({ name: crisisName(key), lines: [t(`domain.crises.${key}.flavour`), t(`domain.crises.${key}.resolution`)] });

/**
 * @param {Actor} domain Once its Crises are saved.
 * @returns {string|null} A warning when it faces enough to fall into misrule.
 */
export const misruleWarning = (domain) =>
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
 * Give a Domain a Crisis rolled on the d6, as a failed Council task typically
 * brings (p20). Nothing comes of it once it already faces every Crisis.
 * @param {Actor} domain
 * @returns {Promise<{key: string|null, rolls: Roll[]}>}
 */
export async function inflictCrisis(domain) {
	const drawn = await drawCrises(1, domain.system.crises);
	if (drawn.crises.length) await domain.update({ "system.crises": [...domain.system.crises, ...drawn.crises] });
	return { key: drawn.crises[0] ?? null, rolls: drawn.rolls };
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
 * Import PDF has brought in the Spark Tables, the Drama table gives a prompt.
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

	// The Court is where the drama breeds (p21), so one of them is at the heart of it.
	const candidates = dramaCandidates(domain.system.court);
	const entries = [];
	if (candidates.length) {
		const who = await new Roll(`1d${candidates.length}`).evaluate();
		rolls.push(who);
		const member = candidates[who.total - 1];
		// A report card sets its second slot beside the name, which here carries their role.
		entries.push({
			name: member.name,
			pursuit: t(`domain.court.roles.${member.role}.one`),
			lines: [
				member.leverage ? t("domain.court.holdsLeverage", { leverage: member.leverage }) : t("domain.court.noLeverage"),
				...(member.note ? [member.note] : [])
			]
		});
	}

	await postCard(domain, "report", {
		title: t("domain.drama"),
		tagline: t(`domain.results.drama.${result}`),
		d6: roll.total,
		entries,
		hint: [prompt, candidates.length ? null : t("domain.court.emptyHint")].filter(Boolean).join(" ") || null
	}, { rolls });
	return result;
}

/** @returns {Actor[]} Every Domain in the world. */
export const worldDomains = () => game.actors.filter((actor) => actor.type === "domain");

/**
 * As a Season ends, every Domain left with 3 or more unresolved Crises falls
 * into misrule (p20), and one seized by force that Season settles under its
 * new ruler (p21). GMs only.
 * @param {string} ended The Season that ended, from seasonKey.
 * @returns {Promise<object[]>} Entries for the Season's card.
 */
export async function settleDomains(ended) {
	const domains = worldDomains();
	const updates = new Map();
	const lines = new Map();
	const note = (domain, update, line) => {
		updates.set(domain.id, { ...updates.get(domain.id), _id: domain.id, ...update });
		lines.set(domain, [...(lines.get(domain) ?? []), line]);
	};
	for (const domain of domains) {
		if (domain.system.misruleDue) note(domain, { "system.misrule": true }, t("domain.fellIntoMisrule", { count: domain.system.crises.length }));
		if (isInTurmoil(domain.system.seized, ended)) {
			note(domain, { "system.seized": "" }, t("domain.conquest.settled", { ruler: domain.system.ruler || t("domain.conquest.someone") }));
		}
	}
	if (updates.size) await Actor.implementation.updateDocuments([...updates.values()]);
	return [...lines].map(([domain, domainLines]) => ({ name: domain.name, lines: domainLines }));
}

/**
 * Ask who takes over a Domain: one of the world's Knights, or anybody else
 * written in by name.
 * @param {Actor} domain
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.icon
 * @param {string} options.intro HTML, already escaped.
 * @param {string} options.ok
 * @param {string} [options.name] Written in to start with, such as the named successor.
 * @param {string} [options.hint]
 * @returns {Promise<{name: string, knight: Actor|null}|null>} Null if closed or left blank.
 */
async function chooseRuler(domain, { title, icon, intro, ok, name = "", hint = null }) {
	const knights = game.actors.filter((actor) => actor.type === "knight");
	const named = knights.find((knight) => isSameName(knight.name, name)) ?? null;
	const data = await inputDialog({
		title,
		icon,
		template: "new-ruler",
		context: {
			intro,
			hint,
			name: named ? "" : name,
			knights: knights.map((knight) => ({ uuid: knight.uuid, name: knight.name, selected: knight === named }))
		},
		ok: { label: ok, icon }
	});
	if (!data) return null;
	const knight = knights.find((candidate) => candidate.uuid === data.knight) ?? null;
	const written = String(data.name ?? "").trim();
	if (!knight && !written) return null;
	return { name: knight?.name ?? written, knight };
}

/**
 * Put a new ruler in charge of a Domain. Knights who ruled it no longer do,
 * and a Knight taking it over now rules it.
 * @param {Actor} domain
 * @param {{name: string, knight: Actor|null}} ruler
 * @param {object} update More changes for the Domain.
 */
async function changeRuler(domain, ruler, update) {
	const updates = [{ _id: domain.id, "system.ruler": ruler.name, ...update }];
	for (const knight of domainRulers(domain)) {
		if (knight !== ruler.knight && knight.isOwner) updates.push({ _id: knight.id, "system.domain": "" });
	}
	if (ruler.knight?.isOwner && ruler.knight.system.domain !== domain.uuid) updates.push({ _id: ruler.knight.id, "system.domain": domain.uuid });
	await Actor.implementation.updateDocuments(updates);
}

/**
 * @param {Actor} domain
 * @returns {Actor[]} The Knights who rule it.
 */
function domainRulers(domain) {
	return game.actors.filter((actor) => actor.type === "knight" && actor.system.domain === domain.uuid);
}

/**
 * The name a Domain's ruler has for their successor: the Domain's own, or else
 * the successor of the Knight who rules it.
 * @param {Actor} domain
 * @returns {string}
 */
export function namedSuccessor(domain) {
	if (domain.system.successor.trim()) return domain.system.successor.trim();
	const ruler = domainRulers(domain)[0];
	return (ruler && heirOf(ruler)?.name) ?? "";
}

/**
 * Succession (p21): the Domain passes to the successor its ruler named, who is
 * sure to face some resistance and should quickly establish their authority.
 * @param {Actor} domain
 * @returns {Promise<{name: string, knight: Actor|null}|null>} The new ruler.
 */
export async function passOnDomain(domain) {
	const before = domain.system.ruler.trim();
	const successor = await chooseRuler(domain, {
		title: t("domain.passOn.title"),
		icon: "fa-solid fa-crown",
		intro: t("domain.passOn.intro", { name: escapeHTML(domain.name), ruler: escapeHTML(before || t("domain.conquest.someone")) }),
		ok: t("domain.passOn.ok"),
		name: namedSuccessor(domain),
		hint: t("domain.passOn.hint")
	});
	if (!successor) return null;

	await changeRuler(domain, successor, { "system.successor": "" });
	await postCard(domain, "report", {
		title: t("domain.passOn.title"),
		tagline: before
			? t("domain.passOn.tagline", { name: successor.name, ruler: before, domain: domain.name })
			: t("domain.passOn.taglineBare", { name: successor.name, domain: domain.name }),
		hint: t("domain.passOn.resistance")
	});
	return successor;
}

/**
 * Conquest (p21): having the audacity to seat yourself in a Holding is often
 * enough to rule it. Left unchallenged, it has a period of turmoil, here the
 * rest of this Season, before it adapts to the new status quo.
 * @param {Actor} domain
 * @returns {Promise<{name: string, knight: Actor|null}|null>} The new ruler.
 */
export async function seizeDomain(domain) {
	const before = domain.system.ruler.trim();
	const conqueror = await chooseRuler(domain, {
		title: t("domain.conquest.title"),
		icon: "fa-solid fa-flag",
		intro: t(domain.system.seat ? "domain.conquest.introSeat" : "domain.conquest.intro", { name: escapeHTML(domain.name) }),
		ok: t("domain.conquest.ok"),
		hint: t("domain.conquest.hint")
	});
	if (!conqueror) return null;

	await changeRuler(domain, conqueror, { "system.seized": seasonKey(getCalendar()), "system.successor": "" });
	await postCard(domain, "report", {
		title: t("domain.conquest.title"),
		tagline: before
			? t("domain.conquest.tagline", { name: conqueror.name, ruler: before, domain: domain.name })
			: t("domain.conquest.taglineBare", { name: conqueror.name, domain: domain.name }),
		hint: t("domain.conquest.turmoil")
	});
	return conqueror;
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
