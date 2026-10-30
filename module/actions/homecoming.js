import { chooseDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { awayFromHome, cameHome, findDomainHolding, holdingLands, holdingRef, parseHoldingRef, rulingKnightOf } from "../rules/dominion.js";
import { soloRealm } from "../rules/solo.js";
import { realmKnown } from "./solo.js";
import { SYSTEM_ID } from "../system-id.js";
import { escapeHTML } from "../rules/text.js";
import { crisisRoll, worldDomains } from "./dominion.js";
import { findCompany } from "./wilderness.js";
import { hexesReached } from "./held-back.js";
import { COMPANY_MOVED_HOOK } from "./journey.js";
import { getRealm, hexHiddenByHand, isRealmScene, sceneGeometry } from "./realm.js";
import { OWN_LANDMARK, TERRAIN, holdingName, terrainAt } from "../rules/realm.js";
import { inCompany, worldKnights } from "./knights.js";
import { landmarkName } from "../rules/landmarks.js";

/**
 * The Crisis Roll's other time, coming home after a long time away (p20): a
 * Domain whose ruler rides with the Company is marked as Weeks or a Season
 * pass with the Company away from its Holding, and the Referee is offered the
 * Crisis Roll when the Company comes home.
 */

/** @returns {import("../rules/dominion.js").RealmHoldings[]} Every Realm's Holdings. */
export function realmHoldings() {
	return game.scenes.filter((scene) => isRealmScene(scene)).map((scene) => ({ sceneId: scene.id, holdings: getRealm(scene)?.realm.holdings ?? [] }));
}

/**
 * The Holding a Domain rules, on its Realm.
 * @param {Actor} domain
 * @param {import("../rules/dominion.js").RealmHoldings[]} [realms]
 * @returns {{scene: Scene, holding: object}|null}
 */
function domainHolding(domain, realms = realmHoldings()) {
	const found = findDomainHolding(realms, domain);
	const scene = found ? game.scenes.get(found.sceneId) : null;
	return scene ? { scene, holding: found.holding } : null;
}

/**
 * What the Domain sheet's Holding list offers: every Realm's Holdings, the
 * Realm named where there's more than one.
 * @param {Actor} domain
 * @param {import("../rules/dominion.js").RealmHoldings[]} [realms]
 * @returns {{options: {value: string, label: string, selected: boolean}[], blank: string}}
 */
export function holdingChoices(domain, realms = realmHoldings()) {
	const named = domain.system.holding ? null : domainHolding(domain, realms);
	return { options: holdingOptions(domain.system.holding, realms), blank: named ? t("domain.holding.byName", { name: holdingName(named.holding, t) }) : t("domain.holding.none") };
}

/**
 * The lands a Domain rules beyond its Holding's walls (p20): how many hexes of
 * wilderness, and the Landmarks in them this user knows of. A player knows of
 * a Landmark once it's revealed; a Referee playing alone, once it's found.
 * @param {Actor} domain
 * @param {import("../rules/dominion.js").RealmHoldings[]} [realms]
 * @returns {{line: string, landmarks: {name: string, kind: string}[]}|null} Its line on the sheet and the
 *   Landmarks listed under it, each with its kind and its hex's terrain, or null for a Domain ruling no Holding on a map.
 */
export function domainLands(domain, realms = realmHoldings()) {
	const found = domainHolding(domain, realms);
	const realm = found ? getRealm(found.scene)?.realm : null;
	if (!realm || !found.holding.id) return null;
	const known = game.user.isGM ? realmKnown(realm, found.scene) : soloRealm(realm);
	const g = sceneGeometry(found.scene);
	const { hexes, landmarks: inLands } = holdingLands(known, g, found.holding.id);
	const landmarks = inLands.map((landmark) => {
		// A Landmark with no name of its own is already called by its kind, so the kind isn't said twice,
		// and the Referee's own marker has no kind worth saying.
		const type = landmark.name && landmark.type !== OWN_LANDMARK ? t(`realm.landmarks.${landmark.type}`) : null;
		// Terrain the Referee has hidden on the map stays hidden from players here too.
		const terrain = terrainAt(realm, g, landmark.hex);
		const shown = terrain && (game.user.isGM || !hexHiddenByHand(found.scene, landmark.hex).terrain);
		return { name: landmarkName(landmark, t), kind: [type, shown ? t(`realm.terrain.${TERRAIN[terrain - 1]}`) : null].filter(Boolean).join(", ") };
	});
	return { line: t(landmarks.length ? "domain.lands.withLandmarks" : "domain.lands.line", { count: hexes.length }), landmarks };
}

/**
 * Every Realm's Holdings as a list to pick from, the Realm named where there's more than one.
 * @param {string} selected From holdingRef.
 * @param {import("../rules/dominion.js").RealmHoldings[]} [realms]
 * @returns {{value: string, label: string, selected: boolean}[]}
 */
export function holdingOptions(selected, realms = realmHoldings()) {
	const many = realms.length > 1;
	return realms.flatMap(({ sceneId, holdings }) => holdings.filter((holding) => holding.id).map((holding) => {
		const value = holdingRef(sceneId, holding.id);
		const label = `${holdingName(holding, t)} ${t("realm.readout.coordinates", holding.hex)}`;
		return { value, label: many ? `${label}, ${game.scenes.get(sceneId)?.name ?? ""}` : label, selected: value === selected };
	}));
}

/**
 * @param {Actor} domain
 * @returns {Actor|null} The living Knight ruling it who rides with the Company, linked to it or named as
 *   its ruler. A Slain ruler is away for good, which is Succession's business (p21), not a long absence.
 */
const rulingKnight = (domain) => rulingKnightOf(domain, worldKnights((knight) => inCompany(knight) && !knight.system.slain));

/**
 * Where the Company stands on a Realm, found quietly: its own Token, or else
 * where most of the players' Tokens are.
 * @param {Scene} scene
 * @returns {{col: number, row: number}|null}
 */
const companyHexOn = (scene) => findCompany(scene, sceneGeometry(scene), { selected: false }).hex;

/**
 * Weeks or a Season have passed: every Domain whose ruler rides with a
 * Company that isn't at its Holding now has them back from a long absence
 * when they return. A Company leaving for a distant Realm is away from every
 * Holding, wherever on the map it set out from (p14, p20). GMs only.
 * @param {object} [options]
 * @param {boolean} [options.leaving] The Company is leaving the Realm, so every ruler riding with it is away.
 * @returns {Promise<Actor[]>} The Domains marked.
 */
export async function markLongAbsences({ leaving = false } = {}) {
	if (!game.user.isGM) return [];
	const realms = realmHoldings();
	const marked = worldDomains().filter((domain) => {
		if (domain.system.longAbsence || !rulingKnight(domain)) return false;
		const home = domainHolding(domain, realms);
		return home && (leaving || awayFromHome(home.holding.hex, companyHexOn(home.scene)));
	});
	await Promise.all(marked.map((domain) => domain.update({ "system.longAbsence": true })));
	return marked;
}

/** Whether the Referee is being asked already, so a Company of several Tokens is asked once. */
let asking = false;

/**
 * The Company has come into hexes of a Realm: each Domain whose Holding is
 * among them, and whose ruler has been away long, offers the Crisis Roll. GMs only.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} entered
 * @returns {Promise<Actor[]>} The Domains the Crisis Roll was made for.
 */
export async function welcomeHome(scene, entered) {
	if (!game.user.isGM || asking || !entered.length) return [];
	const away = worldDomains().filter((domain) => domain.system.longAbsence);
	if (!away.length) return [];
	const realms = realmHoldings();
	const home = away.filter((domain) => {
		const found = domainHolding(domain, realms);
		return found?.scene === scene && cameHome(found.holding.hex, entered);
	});
	if (!home.length) return [];

	asking = true;
	const rolled = [];
	try {
		// Home now, whatever the Referee answers, so the next Token in asks nothing.
		await Promise.all(home.map((domain) => domain.update({ "system.longAbsence": false })));
		for (const domain of home) {
			const knight = rulingKnight(domain);
			const choice = await chooseDialog({
				title: t("domain.homecoming.title"),
				icon: "fa-solid fa-chess-rook",
				message: [
					t("domain.homecoming.text", { ruler: escapeHTML(knight?.name ?? domain.system.ruler), name: escapeHTML(domain.name) }),
					t("domain.homecoming.rule")
				],
				buttons: [
					{ action: "roll", icon: "fa-solid fa-dice-d6", label: t("domain.crisisRoll"), default: true },
					{ action: "no", icon: "fa-solid fa-xmark", label: t("domain.homecoming.notNow") }
				]
			});
			if (choice !== "roll") continue;
			await crisisRoll(domain);
			rolled.push(domain);
		}
	} finally {
		asking = false;
	}
	return rolled;
}

/**
 * Notice the Company coming home. Heard on the active GM's client alone. Not
 * home where dire weather may be keeping it out, played alone, till the Referee lets it on.
 * @param {Scene} scene
 * @param {{entered: {col: number, row: number}[]}} move
 */
function noticeMove(scene, move) {
	welcomeHome(scene, hexesReached(scene, move)).catch((error) => console.error(`${SYSTEM_ID} | Couldn't welcome the Company home`, error));
}

/**
 * A Domain given a Holding on its sheet becomes a Seat of Power when the
 * Holding is the Realm's Seat, and stops being one when it isn't, so it
 * musters as many Warbands as it should (p21). Changes that say for
 * themselves whether it's a Seat, as granting a Holding on the map does, are
 * left as they are.
 * @param {Actor} actor
 * @param {object} changes As preUpdateActor hands them, which may still be changed.
 * @param {import("../rules/dominion.js").RealmHoldings[]} [realms]
 */
export function seatWithHolding(actor, changes, realms) {
	if (actor?.type !== "domain" || foundry.utils.hasProperty(changes, "system.seat") || !foundry.utils.hasProperty(changes, "system.holding")) return;
	const find = (ref) => (realms ??= realmHoldings()).find((realm) => realm.sceneId === ref.sceneId)?.holdings.find((each) => each.id === ref.holdingId);
	const ref = parseHoldingRef(foundry.utils.getProperty(changes, "system.holding"));
	if (ref) {
		const holding = find(ref);
		if (holding) foundry.utils.setProperty(changes, "system.seat", Boolean(holding.seat));
		return;
	}
	// Its Holding taken away, by hand or by another Domain given it: a Seat it was given with
	// the Realm's Seat goes with it. One ticked by hand, with no Holding on a map, stays.
	const before = actor.system?.seat ? parseHoldingRef(actor.system.holding) : null;
	if (before && find(before)?.seat) foundry.utils.setProperty(changes, "system.seat", false);
}

/**
 * One Domain rules a Holding: another given it, on its sheet, has every
 * other Domain naming it give it up, as granting it on the map does. Heard on
 * the active GM's client alone, who can write every Domain.
 * @param {Actor} actor
 * @param {object} changes
 * @returns {Promise<Actor[]>} The Domains that gave it up.
 */
export async function oneDomainPerHolding(actor, changes) {
	if (actor?.type !== "domain" || !game.users.activeGM?.isSelf) return [];
	const ref = foundry.utils.getProperty(changes, "system.holding");
	if (!parseHoldingRef(ref)) return [];
	const others = worldDomains().filter((domain) => domain !== actor && domain.id !== actor.id && domain.system.holding === ref);
	if (others.length) await Actor.implementation.updateDocuments(others.map((domain) => ({ _id: domain.id, "system.holding": "" })));
	return others;
}

/** Follow the Company home, and keep each Holding with one Domain. Called during init. */
export function registerHomecoming() {
	Hooks.on(COMPANY_MOVED_HOOK, noticeMove);
	Hooks.on("preUpdateActor", (actor, changes) => seatWithHolding(actor, changes));
	Hooks.on("updateActor", (actor, changes) => {
		oneDomainPerHolding(actor, changes).catch((error) => console.error(`${SYSTEM_ID} | Couldn't keep a Holding with one Domain`, error));
	});
}
