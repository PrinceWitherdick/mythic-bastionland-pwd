import { chooseDialog, inputDialog } from "../apps/ui.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { SYSTEM_ID } from "../system-id.js";
import {
	CRISES,
	collectionsResult,
	crisesDrawn,
	crisisFor,
	crisisResult,
	domainRuledBy,
	dramaResult,
	isInTurmoil,
	isMisruleDue,
	isSameName
} from "../rules/dominion.js";
import { dramaCandidates } from "../rules/court.js";
import { escapeHTML } from "../rules/text.js";
import { seasonKey } from "../rules/time.js";
import { getCalendar } from "./calendar.js";
import { knightsBesidesRuler } from "./court.js";
import { rollSpark } from "./referee-rolls.js";
import { heirOf } from "./succession.js";
import { worldKnights } from "./knights.js";
import { timelineCrisisResolved, timelineCrisisRoll, timelineDrama, timelineNewRuler } from "./timeline-events.js";

/** @param {string} key One of CRISES. */
const crisisName = (key) => t(`domain.crises.${key}.name`);

/**
 * A card entry describing a Crisis and how to resolve it.
 * @param {string} key
 */
export const crisisEntry = (key) => ({ name: crisisName(key), lines: [t(`domain.crises.${key}.flavour`), t(`domain.crises.${key}.resolution`)].filter(Boolean) });

/**
 * Ask which of some Crises to take, one to a line with how it's resolved.
 * @param {string[]} keys
 * @param {{title: string, icon: string, intro: string, ok: string}} options
 * @returns {Promise<string|null>} The Crisis picked, or null if closed.
 */
async function pickCrisis(keys, { title, icon, intro, ok }) {
	const data = await inputDialog({
		title,
		icon,
		template: "crisis-pick",
		context: { intro, crises: keys.map((key) => ({ id: key, name: crisisName(key), detail: t(`domain.crises.${key}.resolution`) })) },
		ok: { label: ok, icon }
	});
	return keys.includes(data?.crisis) ? data.crisis : null;
}

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
 * The Crisis Roll (p20), made as each Season begins and on coming home after
 * a long time away. A Calamity brings two Crises at once, and a Dilemma asks which
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
		const choice = await pickCrisis(drawn.crises, {
			title: t("domain.dilemmaTitle"),
			icon: "fa-solid fa-scale-unbalanced",
			intro: t("domain.dilemmaIntro", { name: domain.name }),
			ok: t("domain.dilemmaTake")
		});
		added = choice ? [choice] : [];
		if (!added.length) notes.push(t("domain.dilemmaOpen", { options: drawn.crises.map(crisisName).join(", ") }));
	}

	const crises = [...facing, ...added];
	// A roll made while the ruler is away answers for the time already gone.
	await domain.update({ "system.crises": crises, "system.crisisRolled": seasonKey(getCalendar()), "system.longAbsence": false });
	await Promise.all([
		postCard(domain, "report", {
			title: t("domain.crisisRoll"),
			description: t("domain.crisisRollHint"),
			tagline: t(`domain.results.crisis.${result}`),
			d6: roll.total,
			entries: added.map(crisisEntry),
			hint: [...notes, misruleWarning(domain)].filter(Boolean).join(" ")
		}, { rolls: [roll, ...drawn.rolls] }),
		timelineCrisisRoll(domain, { result, crises: added.map(crisisName) })
	]);
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
	const choice = await pickCrisis(open, {
		title: t("domain.addCrisis"),
		icon: "fa-solid fa-fire",
		intro: t("domain.addCrisisIntro", { name: domain.name }),
		ok: t("domain.addCrisis")
	});
	if (!choice) return null;

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
	const crises = domain.system.crises.toSpliced(index, 1);
	// Misrule comes of three Crises left unresolved (p20), so bringing them under three ends it.
	const orderRestored = domain.system.misrule && !isMisruleDue(crises) && isMisruleDue(domain.system.crises);
	await domain.update({ "system.crises": crises, ...(orderRestored ? { "system.misrule": false } : {}) });
	const resolved = t("domain.resolved", { crisis: crisisName(key), name: domain.name });
	await Promise.all([
		postCard(domain, "note", {
			icon: "fa-solid fa-check",
			text: orderRestored ? `${resolved} ${t("domain.misruleEnds")}` : resolved
		}),
		timelineCrisisResolved(domain, key, crisisName(key))
	]);
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
		description: t("domain.collectionsHint"),
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
	let member = null;
	if (candidates.length) {
		const who = await new Roll(`1d${candidates.length}`).evaluate();
		rolls.push(who);
		member = candidates[who.total - 1];
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

	if (domain.isOwner) await domain.update({ "system.dramaRolled": seasonKey(getCalendar()) });
	await Promise.all([
		postCard(domain, "report", {
			title: t("domain.drama"),
			description: t("domain.dramaHint"),
			tagline: t(`domain.results.drama.${result}`),
			d6: roll.total,
			entries,
			hint: [prompt, candidates.length ? null : t("domain.court.emptyHint")].filter(Boolean).join(" ") || null
		}, { rolls }),
		timelineDrama(domain, {
			said: t(`domain.results.drama.${result}`),
			who: member ? t("timeline.auto.courtier", { name: member.name, role: t(`domain.court.roles.${member.role}.one`) }) : null,
			leverage: member?.leverage ? t("domain.court.holdsLeverage", { leverage: member.leverage }) : null
		})
	]);
	return result;
}

/** @returns {Actor[]} Every Domain in the world. */
export const worldDomains = () => game.actors.filter((actor) => actor.type === "domain");

/**
 * As a Season ends, every Domain still carrying 3 Crises or more falls into
 * misrule (p20), and one seized by force that Season settles under its
 * new ruler (p21). GMs only.
 * @param {string} ended The Season that ended, from seasonKey.
 * @returns {Promise<{entries: object[], fell: Actor[]}>} Entries for the Season's card, and the Domains sent into misrule.
 */
export async function settleDomains(ended) {
	const domains = worldDomains();
	const fell = [];
	const updates = new Map();
	const lines = new Map();
	const note = (domain, update, line) => {
		updates.set(domain.id, { ...updates.get(domain.id), _id: domain.id, ...update });
		lines.set(domain, [...(lines.get(domain) ?? []), line]);
	};
	for (const domain of domains) {
		if (domain.system.misruleDue) {
			fell.push(domain);
			note(domain, { "system.misrule": true }, `${t("domain.fellIntoMisrule", { count: domain.system.crises.length })} ${t("domain.misruleHint")}`);
		}
		if (isInTurmoil(domain.system.seized, ended)) {
			note(domain, { "system.seized": "" }, t("domain.conquest.settled", { ruler: domain.system.ruler || t("domain.conquest.someone") }));
		}
	}
	if (updates.size) await Actor.implementation.updateDocuments([...updates.values()]);
	const entries = [...lines].map(([domain, domainLines]) => ({ name: domain.name, lines: domainLines, domainId: domain.id }));
	return { entries, fell };
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
 * @param {boolean} [options.withoutRuler] Leave the Domain's ruler now off the list of Knights.
 * @returns {Promise<{name: string, knight: Actor|null}|null>} Null if closed or left blank.
 */
async function chooseRuler(domain, { title, icon, intro, ok, name = "", hint = null, withoutRuler = false }) {
	const knights = withoutRuler ? knightsBesidesRuler(domain) : worldKnights();
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
	return worldKnights((actor) => actor.system.domain === domain.uuid);
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
 * Succession (p21): the Domain passes to the successor its ruler named, who
 * meets resistance of their own to overcome.
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
		hint: t("domain.passOn.hint"),
		withoutRuler: true
	});
	if (!successor) return null;

	await changeRuler(domain, successor, { "system.successor": "" });
	const tagline = before
		? t("domain.passOn.tagline", { name: successor.name, ruler: before, domain: domain.name })
		: t("domain.passOn.taglineBare", { name: successor.name, domain: domain.name });
	await Promise.all([
		postCard(domain, "report", { title: t("domain.passOn.title"), tagline, hint: t("domain.passOn.resistance") }),
		timelineNewRuler(domain, "passed", successor, tagline)
	]);
	return successor;
}

/**
 * Conquest (p21): whoever boldly takes a Holding's seat often simply rules it.
 * Uncontested, it's in turmoil for a while, here until the Season turns,
 * before it settles under them.
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
	const tagline = before
		? t("domain.conquest.tagline", { name: conqueror.name, ruler: before, domain: domain.name })
		: t("domain.conquest.taglineBare", { name: conqueror.name, domain: domain.name });
	await Promise.all([
		postCard(domain, "report", { title: t("domain.conquest.title"), tagline, hint: t("domain.conquest.turmoil") }),
		timelineNewRuler(domain, "seized", conqueror, tagline)
	]);
	return conqueror;
}

/**
 * A Knight who rules a Domain is Slain: tell the Referee the Domain passes on
 * (p21), with the button that passes it. Their player's ways on are A Knight
 * Falls's; this is the Domain's own, and the Referee's Knights rule Holdings too.
 * Heard on the active GM's client alone.
 * @param {Actor} knight
 * @param {object} changes
 * @returns {Promise<ChatMessage|null>}
 */
export async function noticeRulerSlain(knight, changes) {
	if (knight?.type !== "knight" || foundry.utils.getProperty(changes, "system.slain") !== true) return null;
	if (!game.users.activeGM?.isSelf) return null;
	const domain = knightDomain(knight);
	// Only while they still rule it: a Domain passed on already is someone else's.
	if (!domain || !isSameName(domain.system.ruler, knight.name)) return null;
	return postCard(domain, "note", {
		icon: "fa-solid fa-crown",
		text: t("domain.rulerSlain", { name: knight.name, domain: domain.name, successor: namedSuccessor(domain) || t("domain.rulerSlainNobody") }),
		action: { data: "pass-on", icon: "fa-solid fa-crown", label: t("domain.passOn.title") }
	}, { mode: "gm", flags: { [SYSTEM_ID]: { passOn: domain.uuid } } });
}

/** Follow the deaths of Knights who rule, and wire the button that passes their Domains on. Called during init. */
export function registerRulerDeaths() {
	Hooks.on("updateActor", (actor, changes) => {
		noticeRulerSlain(actor, changes).catch((error) => console.error(`${SYSTEM_ID} | Couldn't tell of a ruler's death`, error));
	});
	registerCardButtons({
		selector: "[data-pass-on]",
		gmOnly: true,
		handler: async (_button, message) => {
			const domain = fromUuidSync(message?.flags?.[SYSTEM_ID]?.passOn ?? "");
			if (domain?.type !== "domain") return warn("domain.rulerSlainGone");
			return passOnDomain(domain);
		}
	});
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
	const ruled = new Set(worldKnights((actor) => actor !== knight).map((actor) => actor.system.domain));
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
	}

	if (domain) {
		await linkKnightDomain(knight, domain);
	} else {
		// Founding one asks which Holding it rules and who sits in its Circle, and closing that window founds nothing.
		const { foundDomain } = await import("./found-domain.js");
		domain = await foundDomain(knight);
		if (!domain) return null;
	}
	domain.sheet.render({ force: true });
	return domain;
}
