import { chooseDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { awayFromHome, cameHome, findDomainHolding, holdingRef, rulingKnightOf } from "../rules/dominion.js";
import { SYSTEM_ID } from "../system-id.js";
import { escapeHTML } from "../rules/text.js";
import { crisisRoll, worldDomains } from "./dominion.js";
import { findCompany } from "./wilderness.js";
import { COMPANY_MOVED_HOOK } from "./journey.js";
import { getRealm, isRealmScene, sceneGeometry } from "./realm.js";

/**
 * The Crisis Roll's other time, coming home after a long time away (p20): a
 * Domain whose ruler rides with the Company is marked as Weeks or a Season
 * pass with the Company away from its Holding, and the Referee is offered the
 * Crisis Roll when the Company comes home.
 */

/** @returns {import("../rules/dominion.js").RealmHoldings[]} Every Realm's Holdings. */
function realmHoldings() {
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
 * @param {{name: string, style: string}} holding
 * @returns {string} The Holding's name, or what it is where it has none.
 */
const holdingName = (holding) => holding.name || t(`realm.holdings.${holding.style}`);

/**
 * What the Domain sheet's Holding list offers: every Realm's Holdings, the
 * Realm named where there's more than one.
 * @param {Actor} domain
 * @returns {{options: {value: string, label: string, selected: boolean}[], blank: string}}
 */
export function holdingChoices(domain) {
	const realms = realmHoldings();
	const named = domain.system.holding ? null : domainHolding(domain, realms);
	return { options: holdingOptions(domain.system.holding, realms), blank: named ? t("domain.holding.byName", { name: holdingName(named.holding) }) : t("domain.holding.none") };
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
		const label = `${holdingName(holding)} ${t("realm.readout.coordinates", holding.hex)}`;
		return { value, label: many ? `${label}, ${game.scenes.get(sceneId)?.name ?? ""}` : label, selected: value === selected };
	}));
}

/**
 * @param {Actor} domain
 * @returns {Actor|null} The Knight ruling it who rides with the Company: one a player owns, linked to it or named as its ruler.
 */
const rulingKnight = (domain) => rulingKnightOf(domain, game.actors.filter((actor) => actor.type === "knight" && actor.hasPlayerOwner));

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
 * when they return. GMs only.
 * @returns {Promise<Actor[]>} The Domains marked.
 */
export async function markLongAbsences() {
	if (!game.user.isGM) return [];
	const realms = realmHoldings();
	const marked = worldDomains().filter((domain) => {
		if (domain.system.longAbsence || !rulingKnight(domain)) return false;
		const home = domainHolding(domain, realms);
		return home && awayFromHome(home.holding.hex, companyHexOn(home.scene));
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
 * Notice the Company coming home. Heard on the active GM's client alone.
 * @param {Scene} scene
 * @param {{entered: {col: number, row: number}[]}} move
 */
function noticeMove(scene, { entered }) {
	welcomeHome(scene, entered).catch((error) => console.error(`${SYSTEM_ID} | Couldn't welcome the Company home`, error));
}

/** Follow the Company home. Called during init. */
export function registerHomecoming() {
	Hooks.on(COMPANY_MOVED_HOOK, noticeMove);
}
