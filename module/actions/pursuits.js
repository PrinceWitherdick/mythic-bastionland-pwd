import { chooseOne } from "../apps/actor-pick.js";
import { chooseDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { escapeHTML } from "../rules/text.js";
import { pursuitMakings } from "../rules/time.js";
import { canHoldPost } from "../rules/dominion.js";
import { addCourtMember, sitsAtCourt } from "./court.js";
import { knightDomain, worldDomains } from "./dominion.js";
import { getRealm, isRealmScene } from "./realm.js";
import { THREAD_KINDS } from "../rules/threads.js";
import { addThreads } from "./threads.js";
import { beginDesign } from "./grand-designs.js";
import { hexLabel } from "./hex-names.js";
import { loadArtIndex, mythLookup } from "../book-art/art-index.js";
import { landmarkName } from "../rules/landmarks.js";

/**
 * What a pursuit made (p17): a Knight's Pilgrimage may show where a Myth or
 * Landmark lies, their Service add a Dwelling to the map, their Courtesy a
 * place at Court (as p192 plays it), and their Duty between Ages begin a grand
 * project or add a Holding. Each Knight who chose one is asked what came of it,
 * and the report says so.
 */

/** What's marked on the map with a brush once everyone is asked, and the pursuit whose words say so. */
const MARKED_WITH_BRUSH = Object.freeze({ dwelling: "service", holding: "duty" });

/**
 * @param {string|null} pursuit
 * @param {Actor} actor
 * @returns {readonly string[]} What the pursuit can make for them (pursuitMakings).
 */
export const makingsFor = (pursuit, actor) => pursuitMakings(pursuit, { holdsPost: canHoldPost(actor) });

/**
 * Ask what came of a Knight's pursuit.
 * @param {Actor} actor
 * @param {string} pursuit
 * @returns {Promise<string|null>} One of the pursuit's PURSUIT_MAKINGS, or null if closed.
 */
async function askMaking(actor, pursuit) {
	const makings = makingsFor(pursuit, actor);
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
 * Domain, or the one the GM picks, of those they don't already sit at.
 * @param {Actor} actor
 * @param {string} season Its name, for the Court's note on them.
 * @returns {Promise<{court: string, already?: true}|null>} The Domain's name, saying where they sat already,
 *   or null where there's none to join.
 */
async function joinCourt(actor, season) {
	const owned = worldDomains().filter((domain) => domain.isOwner);
	const domains = owned.filter((domain) => !sitsAtCourt(domain, actor));
	// Already at every Court there is: none is joined twice.
	if (!domains.length) return owned.length ? { court: owned.find((domain) => sitsAtCourt(domain, actor)).name, already: true } : null;
	let domain = domains[0];
	if (domains.length > 1) {
		// A list of the Courts with one button, however many Domains there are.
		domain = await chooseOne(domains, {
			title: t("time.pursuitMakes.courtesy.court"),
			icon: "fa-solid fa-chess-king",
			message: t("time.pursuitMakes.courtesy.whichCourt", { name: actor.name }),
			ok: t("time.pursuitMakes.courtesy.joinCourt")
		});
		if (!domain) return null;
	}
	await addCourtMember(domain, "courtier", { name: actor.name, note: t("time.pursuitMakes.courtesy.courtNote", { season }), knight: actor.id });
	return { court: domain.name };
}

/**
 * Take up the brush on the Realm in view, so the GM marks the Dwelling a
 * Knight's Service made, or the Holding their Duty did, with one click.
 * Without a Realm in view, say where.
 * @param {"dwelling"|"holding"} brush
 */
async function markWithBrush(brush) {
	const pursuit = MARKED_WITH_BRUSH[brush];
	if (canvas.realm && isRealmScene(canvas.scene)) {
		await canvas.realm.useTool("terrain", { brush });
		ui.notifications.info(t(`time.pursuitMakes.${pursuit}.markIt`));
	} else {
		ui.notifications.info(t(`time.pursuitMakes.${pursuit}.openRealm`));
	}
}

/** @returns {Scene|null} The Realm in view, or else the one the players are on. */
const realmScene = () => [globalThis.canvas?.scene, game.scenes?.active].find((scene) => isRealmScene(scene)) ?? null;

/**
 * What a Pilgrimage learnt of the Realm that nobody knew (p17): where a Myth
 * or a Landmark lies that the players' map still hides, shown on it. The only
 * one hidden is shown at once; of several, the Referee picks.
 * @param {Actor} actor
 * @param {"myth"|"landmark"} kind
 * @returns {Promise<string>} The report's line.
 */
async function learnWhere(actor, kind) {
	const scene = realmScene();
	const realm = scene ? getRealm(scene)?.realm : null;
	if (!realm) return t("time.pursuitMakes.pilgrimage.noRealm");
	const hidden = (kind === "myth" ? realm.myths : realm.landmarks).filter((feature) => feature.id && !feature.revealed);
	if (!hidden.length) return t(`time.pursuitMakes.pilgrimage.noneHidden.${kind}`);
	const index = kind === "myth" ? await loadArtIndex() : null;
	const named = hidden.map((feature) => ({
		id: feature.id,
		feature,
		name: kind === "myth" ? mythLookup(index, feature).name : landmarkName(feature, t),
		detail: hexLabel(feature.hex, scene)
	}));
	const picked = named.length === 1 ? named[0] : await chooseOne(named, {
		title: t("time.pursuits.pilgrimage.label"),
		icon: kind === "myth" ? "fa-solid fa-dragon" : "fa-solid fa-monument",
		message: t(`time.pursuitMakes.pilgrimage.which.${kind}`, { name: actor.name }),
		ok: t("time.pursuitMakes.pilgrimage.show"),
		search: named.length > 8 ? { label: t("time.pursuitMakes.pilgrimage.search"), none: t("time.pursuitMakes.pilgrimage.found") } : null
	});
	if (!picked) return t("time.pursuitMakes.pilgrimage.made.other");
	// Loaded here, as exploration.js reaches back to time.js, which calls on this.
	const { markOnPlayersMap } = await import("./exploration.js");
	await markOnPlayersMap(scene, [picked.feature.id]);
	return t(`time.pursuitMakes.pilgrimage.made.${kind}`, { name: picked.name, hex: picked.detail });
}

/**
 * A grand project Duty began (p17, p21), on the Grand Designs of the Domain the
 * Knight rules, to be named there.
 * @param {Actor} actor
 * @returns {Promise<string>} The report's line.
 */
async function beginGrandProject(actor) {
	const domain = knightDomain(actor);
	if (!domain) return t("time.pursuitMakes.duty.noDomain", { name: actor.name });
	await beginDesign(domain, "grand");
	return t("time.pursuitMakes.duty.begun", { domain: domain.name });
}

/**
 * Ask each Knight who chose a pursuit that makes something what it made, unless
 * it was said beside their pursuit, carry it out, and add a line saying so to
 * their entry on the report.
 * @param {{actor: Actor, pursuit: string|null, making?: string|null}[]} company
 * @param {{lines: string[]}[]} entries The report's entry for each of the Company, in the same order.
 * @param {string} season The Season just begun, by name.
 */
export async function followPursuits(company, entries, season) {
	let brush = null;
	const threads = [];
	for (const [index, { actor, pursuit, making: said = null }] of company.entries()) {
		if (!pursuitMakings(pursuit).length) continue;
		// Said beside the pursuit as the Season turned, or else asked now. A Squire can't take a place at Court.
		const making = makingsFor(pursuit, actor).includes(said) ? said : await askMaking(actor, pursuit);
		if (!making) continue;
		const lines = entries[index].lines;
		if (making === "court") {
			const joined = await joinCourt(actor, season);
			lines.push(!joined ? t("time.pursuitMakes.courtesy.noCourt")
				: t(joined.already ? "time.pursuitMakes.courtesy.alreadyAtCourt" : "time.pursuitMakes.courtesy.joined", { court: joined.court }));
		} else if (making === "myth" || making === "landmark") {
			lines.push(await learnWhere(actor, making));
		} else if (making === "grand") {
			lines.push(await beginGrandProject(actor));
		} else {
			if (Object.hasOwn(MARKED_WITH_BRUSH, making)) brush = making;
			// A favour or a contact is kept with what's left open, till it's called on: the Referee says whose once it's known.
			if (THREAD_KINDS.includes(making)) threads.push({ kind: making, name: t(`threads.courtesy.${making}`, { name: actor.name }), knight: actor.id });
			lines.push(t(`time.pursuitMakes.${pursuit}.made.${making}`));
		}
	}
	// Once all are asked, in one write to the Toolkit, and so the palette isn't opened under the next question.
	if (threads.length) await addThreads(threads);
	if (brush) await markWithBrush(brush);
}
