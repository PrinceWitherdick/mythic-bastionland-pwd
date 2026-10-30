import { askActiveGM } from "../ask-gm.js";
import { chooseDialog, confirmDialog, inputDialog } from "../apps/ui.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { queryAsker } from "../compat.js";
import { SYSTEM_ID } from "../system-id.js";
import {
	CRISES,
	canHoldPost,
	collectionsResult,
	crisesDrawn,
	crisisFor,
	crisisResult,
	crisisRolledThisSeason,
	domainRuledBy,
	dramaResult,
	dramaRolledThisSeason,
	emptySeats,
	isInTurmoil,
	isMisruleDue,
	isSameName,
	rulingKnightOf
} from "../rules/dominion.js";
import { courtMembers, dramaCandidates } from "../rules/court.js";
import { escapeHTML } from "../rules/text.js";
import { seasonKey } from "../rules/time.js";
import { getCalendar } from "./calendar.js";
import { knightsBesidesRuler, seatCircle } from "./court.js";
import { rollSpark } from "./referee-rolls.js";
import { namedHeirOf } from "./succession.js";
import { seenOrChosen, worldKnights } from "./knights.js";
import { timelineCrisisResolved, timelineCrisisRoll, timelineDrama, timelineNewRuler } from "./timeline-events.js";
import { isKnight } from "../rules/knight-types.js";

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
 * The Crisis Roll from the Domain's sheet. It's made once as each Season
 * begins (p20), so a second one this Season is confirmed first: coming home
 * from a long absence is the usual reason for it.
 * @param {Actor} domain
 * @returns {Promise<string[]|null>} The Crises added, or null if not rolled.
 */
export async function crisisRollOnce(domain) {
	if (crisisRolledThisSeason(domain, getCalendar()) && !(await confirmDialog({
		title: t("domain.crisisRoll"),
		icon: "fa-solid fa-dice-d6",
		message: t("domain.crisisRollAgain", { name: escapeHTML(domain.name) })
	}))) return null;
	return crisisRoll(domain);
}

/**
 * Drama in Court from the Domain's sheet. Every Season brings some (p21), so a
 * second this Season is confirmed first.
 * @param {Actor} domain
 * @returns {Promise<string|null>} One of DRAMA_RESULTS, or null if not rolled.
 */
export async function dramaOnce(domain) {
	if (dramaRolledThisSeason(domain, getCalendar()) && !(await confirmDialog({
		title: t("domain.drama"),
		icon: "fa-solid fa-masks-theater",
		message: t("domain.dramaAgain", { name: escapeHTML(domain.name) })
	}))) return null;
	return dramaInCourt(domain);
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
 * bring misrule at once, or a Crisis with the coffers filled. Misrule sees
 * Knights leave, as it does at a Season's end (p20), so the Circle is asked
 * who rides away; and coffers filled can restock a treasury in Debt.
 * @param {Actor} domain
 */
export async function increasedCollections(domain) {
	const roll = await new Roll("1d6").evaluate();
	const result = collectionsResult(roll.total);
	const rolls = [roll];
	const update = {};
	let entries = [];
	// Debt is resolved by restocking the treasury (p20), which filled coffers do. One drawn by this roll stays.
	const inDebt = domain.system.crises.includes("debt");

	if (result === "misrule") update["system.misrule"] = true;
	if (result === "crisis") {
		const drawn = await drawCrises(1, domain.system.crises);
		rolls.push(...drawn.rolls);
		update["system.crises"] = [...domain.system.crises, ...drawn.crises];
		entries = drawn.crises.map(crisisEntry);
	}
	if (!foundry.utils.isEmpty(update)) await domain.update(update);

	// It's the Steward who squeezes the Vassals (p21), so an empty seat is said.
	const noSteward = emptySeats(domain.system.council).includes("steward") ? t("domain.collectionsNoSteward") : null;
	const said = result === "misrule" ? `${t("domain.misruleHint")} ${t("domain.collectionsMisruleEnds")}` : misruleWarning(domain);
	await postCard(domain, "report", {
		title: t("domain.collections"),
		description: t("domain.collectionsHint"),
		tagline: t(`domain.results.collections.${result}`),
		d6: roll.total,
		entries,
		hint: [noSteward, said].filter(Boolean).join(" ") || null
	}, { rolls });

	if (result === "misrule" && domain.system.council?.circle?.length) {
		await seatCircle(domain, { intro: t("domain.misruleLeave", { name: domain.name }) });
	}
	if (result !== "misrule" && inDebt && domain.isOwner && await confirmDialog({
		title: t("domain.collections"),
		icon: "fa-solid fa-coins",
		message: t("domain.collectionsDebt", { name: escapeHTML(domain.name) })
	})) {
		const index = domain.system.crises.indexOf("debt");
		if (index >= 0) await resolveCrisis(domain, index);
	}
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
		// Their leverage is the Referee's to know, so it's whispered to them apart (tellLeverage).
		entries.push({
			name: member.name,
			pursuit: t(`domain.court.roles.${member.role}.one`),
			lines: member.note ? [member.note] : []
		});
	}

	if (domain.isOwner) await domain.update({ "system.dramaRolled": seasonKey(getCalendar()) });
	await Promise.all([
		member ? tellLeverage(domain, member.id) : null,
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

/** The query a player's Drama in Court sends, so the Referee is whispered the courtier's leverage. */
const LEVERAGE_QUERY = `${SYSTEM_ID}.courtLeverage`;

/**
 * @param {Actor} domain
 * @param {string} id The courtier's id in its Court.
 * @returns {Promise<ChatMessage|null>} The Referee's whisper of what leverage they hold over the ruler (p21).
 */
function whisperLeverage(domain, id) {
	const member = courtMembers(domain.system.court).find((each) => each.id === id);
	if (!member) return null;
	const line = member.leverage ? t("domain.court.holdsLeverage", { leverage: member.leverage }) : t("domain.court.noLeverage");
	return postCard(domain, "note", {
		icon: "fa-solid fa-user-secret",
		text: t("domain.court.leverageWhisper", { name: member.name, line })
	}, { mode: "gm" });
}

/**
 * Tell the Referee alone what leverage the courtier at the heart of the Drama
 * holds. Leverage is the Referee's to know, so a player who rolled asks the
 * active GM to whisper it, since their own whisper would show it to them.
 * @param {Actor} domain
 * @param {string} id The courtier's id in its Court.
 * @returns {Promise<unknown>}
 */
export async function tellLeverage(domain, id) {
	if (game.user.isGM) return whisperLeverage(domain, id);
	if (!game.users.activeGM) return null;
	return askActiveGM(LEVERAGE_QUERY, { domainId: domain.id, memberId: id }, `Couldn't tell the Referee the leverage at ${domain.name}'s Court`);
}

/**
 * A player's Drama in Court, whispered to the Referee by the GM who was asked:
 * only for a Domain the asker owns.
 * @param {{domainId?: string, memberId?: string}} data
 * @param {object} context
 * @returns {Promise<boolean>}
 */
export async function onLeverageQuery(data = {}, context = {}) {
	const asker = queryAsker(context);
	if (!asker || !game.user.isGM) return false;
	const domain = game.actors.get(data?.domainId);
	if (domain?.type !== "domain" || !domain.testUserPermission(asker, "OWNER")) return false;
	return Boolean(await whisperLeverage(domain, String(data?.memberId ?? "")));
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
	// Only a Knight who can rule is offered: knighted, and alive (p7, p21).
	const knights = (withoutRuler ? knightsBesidesRuler(domain) : worldKnights(canHoldPost))
		.filter(seenOrChosen((knight) => name && isSameName(knight.name, name)));
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

/** The query a player's Pass On or Seize sends, so the Knights' links follow the new ruler. */
const RULER_QUERY = `${SYSTEM_ID}.domainRuler`;

/**
 * The Knights' side of a change of ruler: Knights who ruled the Domain no
 * longer do, and a Knight taking it over now rules it.
 * @param {Actor} domain
 * @param {Actor|null} knight The new ruler, where they're one of the world's Knights.
 * @returns {object[]} Updates for Actor.updateDocuments.
 */
function rulerLinkUpdates(domain, knight) {
	const updates = domainRulers(domain).filter((other) => other !== knight).map((other) => ({ _id: other.id, "system.domain": "" }));
	if (knight && knight.system.domain !== domain.uuid) updates.push({ _id: knight.id, "system.domain": domain.uuid });
	return updates;
}

/**
 * Move the Knights' links to a Domain's new ruler. A player can't write
 * Knights they don't own, so where any is somebody else's the active GM is
 * asked to move them all, as joinCompany asks.
 * @param {Actor} domain
 * @param {Actor|null} knight
 * @returns {Promise<boolean>} Whether every link was moved.
 */
async function moveRulerLinks(domain, knight) {
	const updates = rulerLinkUpdates(domain, knight);
	if (!updates.length) return true;
	const owned = (update) => Boolean(game.actors.get(update._id)?.isOwner);
	if (game.user.isGM || updates.every(owned)) {
		await Actor.implementation.updateDocuments(updates);
		return true;
	}
	if (game.users.activeGM && await askActiveGM(RULER_QUERY, { domainId: domain.id, knightId: knight?.id ?? null }, `Couldn't move ${domain.name}'s ruler`)) return true;
	// With no Referee to ask, the Knights this user owns are moved, and the rest wait for the Referee.
	const mine = updates.filter(owned);
	if (mine.length) await Actor.implementation.updateDocuments(mine);
	warn("domain.rulerLinksNeedReferee", { name: domain.name });
	return false;
}

/**
 * A player's new ruler, linked by the GM who was asked: only for a Domain the
 * asker owns, and only to the Knight it now names as its ruler.
 * @param {{domainId?: string, knightId?: string|null}} data
 * @param {object} context
 * @returns {Promise<boolean>}
 */
export async function onRulerQuery(data = {}, context = {}) {
	const asker = queryAsker(context);
	if (!asker || !game.user.isGM) return false;
	const domain = game.actors.get(data?.domainId);
	if (domain?.type !== "domain" || !domain.testUserPermission(asker, "OWNER")) return false;
	const knight = data?.knightId ? game.actors.get(data.knightId) : null;
	if (data?.knightId && (!isKnight(knight) || !isSameName(knight.name, domain.system.ruler))) return false;
	const updates = rulerLinkUpdates(domain, knight);
	if (updates.length) await Actor.implementation.updateDocuments(updates);
	return true;
}

/**
 * Put a new ruler in charge of a Domain. Knights who ruled it no longer do,
 * a Knight taking it over now rules it, and no longer sits in its Circle,
 * since the Circle sits alongside its ruler (p20). A Knight's sheet keeps one
 * Domain, so one who rules another already is warned that their sheet moves
 * here; the other still names them its ruler.
 * @param {Actor} domain
 * @param {{name: string, knight: Actor|null}} ruler
 * @param {object} update More changes for the Domain.
 */
async function changeRuler(domain, ruler, update) {
	const circle = domain.system.council?.circle ?? [];
	const seated = circle.filter((entry) => entry !== ruler.knight?.id && !isSameName(entry, ruler.name));
	const before = ruler.knight ? knightDomain(ruler.knight) : null;
	await domain.update({
		"system.ruler": ruler.name,
		...(seated.length === circle.length ? {} : { "system.council.circle": seated }),
		...update
	});
	await moveRulerLinks(domain, ruler.knight);
	if (before && before !== domain && isSameName(before.system.ruler, ruler.knight.name)) {
		warn("domain.rulesAnother", { name: ruler.knight.name, other: before.name, domain: domain.name });
	}
}

/**
 * @param {Actor} domain
 * @returns {Actor[]} The Knights who rule it.
 */
function domainRulers(domain) {
	return worldKnights((actor) => actor.system.domain === domain.uuid);
}

/**
 * Who a Domain passes to: the successor written on the Domain, or else the
 * successor of the Knight who rules it. A successor who is Slain can't
 * succeed (p17, p21), so they're given apart, as the heir who fell.
 * @param {Actor} domain
 * @returns {{name: string, fallen: string}} The living successor's name, blank where there's none,
 *   and the name of a named successor who is Slain.
 */
export function domainSuccessor(domain) {
	const written = domain.system.successor.trim();
	if (written) {
		// Written in by name: Slain only where every Knight of the world going by it is.
		const known = worldKnights((knight) => isSameName(knight.name, written));
		const fell = known.length > 0 && known.every((knight) => knight.system.slain);
		return fell ? { name: "", fallen: written } : { name: written, fallen: "" };
	}
	const ruler = domainRulers(domain)[0];
	const heir = ruler ? namedHeirOf(ruler) : null;
	if (!heir) return { name: "", fallen: "" };
	return heir.system.slain ? { name: "", fallen: heir.name } : { name: heir.name, fallen: "" };
}

/**
 * The name a Domain's ruler has for their successor, while they live.
 * @param {Actor} domain
 * @returns {string} Blank where none is named, or the one named is Slain.
 */
export const namedSuccessor = (domain) => domainSuccessor(domain).name;

/**
 * Succession (p21): the Domain passes to the successor its ruler named, who
 * meets resistance of their own to overcome.
 * @param {Actor} domain
 * @returns {Promise<{name: string, knight: Actor|null}|null>} The new ruler.
 */
export async function passOnDomain(domain) {
	const before = domain.system.ruler.trim();
	const heir = domainSuccessor(domain);
	const succession = t("domain.passOn.hint");
	const successor = await chooseRuler(domain, {
		title: t("domain.passOn.title"),
		icon: "fa-solid fa-crown",
		intro: t("domain.passOn.intro", { name: escapeHTML(domain.name), ruler: escapeHTML(before || t("domain.conquest.someone")) }),
		ok: t("domain.passOn.ok"),
		name: heir.name,
		hint: heir.fallen ? `${t("domain.passOn.heirFell", { heir: heir.fallen })} ${succession}` : succession,
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
 * @returns {Promise<ChatMessage[]>} A card for each Domain they ruled.
 */
export async function noticeRulerSlain(knight, changes) {
	if (!isKnight(knight) || foundry.utils.getProperty(changes, "system.slain") !== true) return [];
	if (!game.users.activeGM?.isSelf) return [];
	return tellRulerGone(knight, "domain.rulerSlain");
}

/**
 * A Knight who rules a Domain is deleted from the world: the Domain passes on
 * as it would at their death. One already Slain was told of then. Heard on
 * the active GM's client alone.
 * @param {Actor} knight
 * @returns {Promise<ChatMessage[]>}
 */
export async function noticeRulerDeleted(knight) {
	if (!isKnight(knight) || knight.system.slain || !game.users.activeGM?.isSelf) return [];
	return tellRulerGone(knight, "domain.rulerGone");
}

/**
 * Every Domain a Knight rules: the one their sheet links to, and any other
 * still naming them its ruler that no other Knight of the world rules, since a
 * Knight's sheet keeps only one. Only while it names them: a Domain passed on
 * already is someone else's.
 * @param {Actor} knight
 * @returns {Actor[]}
 */
function domainsRuledBy(knight) {
	const others = worldKnights((actor) => actor !== knight && actor.id !== knight.id);
	return worldDomains().filter((domain) => isSameName(domain.system.ruler, knight.name)
		&& ((Boolean(domain.uuid) && domain.uuid === knight.system.domain) || !rulingKnightOf(domain, others)));
}

/**
 * Tell the Referee each Domain a Knight ruled passes on (p21), with the button that passes it.
 * @param {Actor} knight
 * @param {string} key What befell them: the rulerSlain or rulerGone string.
 * @returns {Promise<ChatMessage[]>}
 */
function tellRulerGone(knight, key) {
	return Promise.all(domainsRuledBy(knight).map((domain) => {
		const { name, fallen } = domainSuccessor(domain);
		// A named successor who is Slain leaves no living heir.
		const text = fallen
			? `${t(`${key}Bare`, { name: knight.name, domain: domain.name })} ${t("domain.noLivingHeir", { heir: fallen })}`
			: t(key, { name: knight.name, domain: domain.name, successor: name || t("domain.rulerSlainNobody") });
		return postCard(domain, "note", {
			icon: "fa-solid fa-crown",
			text,
			action: { data: "pass-on", icon: "fa-solid fa-crown", label: t("domain.passOn.title") }
		}, { mode: "gm", flags: { [SYSTEM_ID]: { passOn: domain.uuid } } });
	}));
}

/**
 * Follow the deaths of Knights who rule, and their deletion, and wire the
 * button that passes their Domains on. Answer players' new rulers and Drama
 * in Court, which the Referee finishes for them. Called during init.
 */
export function registerRulerDeaths() {
	Hooks.on("updateActor", (actor, changes) => {
		noticeRulerSlain(actor, changes).catch((error) => console.error(`${SYSTEM_ID} | Couldn't tell of a ruler's death`, error));
	});
	Hooks.on("deleteActor", (actor) => {
		noticeRulerDeleted(actor).catch((error) => console.error(`${SYSTEM_ID} | Couldn't tell of a ruler's leaving`, error));
	});
	CONFIG.queries[RULER_QUERY] = onRulerQuery;
	CONFIG.queries[LEVERAGE_QUERY] = onLeverageQuery;
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
