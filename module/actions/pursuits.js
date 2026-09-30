import { chooseDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { escapeHTML } from "../rules/text.js";
import { pursuitMakings } from "../rules/time.js";
import { addCourtMember } from "./court.js";
import { worldDomains } from "./dominion.js";
import { isRealmScene } from "./realm.js";

/**
 * What a pursuit between Seasons made (p17): a Knight's Service may add a
 * Dwelling to the map, and their Courtesy a place at Court (as p192 plays
 * it). Each Knight who chose one is asked what came of it, and the Season's
 * report says so.
 */

/**
 * Ask what came of a Knight's pursuit.
 * @param {Actor} actor
 * @param {string} pursuit
 * @returns {Promise<string|null>} One of the pursuit's PURSUIT_MAKINGS, or null if closed.
 */
async function askMaking(actor, pursuit) {
	const makings = pursuitMakings(pursuit);
	const choice = await chooseDialog({
		title: t(`time.pursuits.${pursuit}.label`),
		icon: "fa-solid fa-hand-holding-heart",
		message: t(`time.pursuitMakes.${pursuit}.question`, { name: escapeHTML(actor.name) }),
		buttons: makings.map((making, index) => ({ action: making, label: t(`time.pursuitMakes.${pursuit}.${making}`), default: index === 0 }))
	});
	return makings.includes(choice) ? choice : null;
}

/**
 * Give a Knight a place at a Domain's Court, as a Courtier (p20): the only
 * Domain, or the one the GM picks.
 * @param {Actor} actor
 * @param {string} season Its name, for the Court's note on them.
 * @returns {Promise<string|null>} The Domain's name, or null where there's none to join.
 */
async function joinCourt(actor, season) {
	const domains = worldDomains().filter((domain) => domain.isOwner);
	if (!domains.length) return null;
	let domain = domains[0];
	if (domains.length > 1) {
		const id = await chooseDialog({
			title: t("time.pursuitMakes.courtesy.court"),
			icon: "fa-solid fa-chess-king",
			message: t("time.pursuitMakes.courtesy.whichCourt", { name: escapeHTML(actor.name) }),
			buttons: domains.map((each, index) => ({ action: each.id, label: each.name, default: index === 0 }))
		});
		domain = domains.find((each) => each.id === id);
		if (!domain) return null;
	}
	await addCourtMember(domain, "courtier", { name: actor.name, note: t("time.pursuitMakes.courtesy.courtNote", { season }) });
	return domain.name;
}

/**
 * Take up the Dwelling brush on the Realm in view, so the GM marks the Dwelling
 * a Knight's Service made with one click. Without a Realm in view, say where.
 */
async function markDwelling() {
	if (canvas.realm && isRealmScene(canvas.scene)) {
		await canvas.realm.useTool("terrain", { brush: "dwelling" });
		ui.notifications.info(t("time.pursuitMakes.service.markIt"));
	} else {
		ui.notifications.info(t("time.pursuitMakes.service.openRealm"));
	}
}

/**
 * Ask each Knight who chose Service or Courtesy what it made, carry it out, and
 * add a line saying so to their entry on the Season's report.
 * @param {{actor: Actor, pursuit: string|null}[]} company
 * @param {{lines: string[]}[]} entries The report's entry for each of the Company, in the same order.
 * @param {string} season The Season just begun, by name.
 */
export async function followPursuits(company, entries, season) {
	let dwelling = false;
	for (const [index, { actor, pursuit }] of company.entries()) {
		if (!pursuitMakings(pursuit).length) continue;
		const making = await askMaking(actor, pursuit);
		if (!making) continue;
		const lines = entries[index].lines;
		if (making === "court") {
			const court = await joinCourt(actor, season);
			lines.push(court ? t("time.pursuitMakes.courtesy.joined", { court }) : t("time.pursuitMakes.courtesy.noCourt"));
		} else {
			if (making === "dwelling") dwelling = true;
			lines.push(t(`time.pursuitMakes.${pursuit}.made.${making}`));
		}
	}
	// Once all are asked, so the palette isn't opened under the next question.
	if (dwelling) await markDwelling();
}
