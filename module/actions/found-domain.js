import { inputDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { courtKnight, courtMembers } from "../rules/court.js";
import { canHoldPost, holdingRef, holdingRulers, parseHoldingRef } from "../rules/dominion.js";
import { escapeHTML } from "../rules/text.js";
import { addCourtMember } from "./court.js";
import { linkKnightDomain, worldDomains } from "./dominion.js";
import { holdingOptions, realmHoldings } from "./homecoming.js";
import { realmSeats } from "../rules/realm.js";
import { getRealm } from "./realm.js";
import { inCompany, playersOf, seenOrChosen, worldKnights } from "./knights.js";
import { timelineFounded } from "./timeline-events.js";

/**
 * Founding a Knight's Domain (Dominion, p20): which Holding it rules, what it's
 * called, and which of the other Knights sit in its Circle. A Ruler Start (p6),
 * where one Knight rules and the rest sit in their Circle, founds one as the
 * Realm is made, once there are Knights to rule it. A Courtier Start seats the
 * Knights at the Court of the Seat of Power.
 */

/**
 * @param {string} ref From holdingRef.
 * @returns {object|null} The Holding it names, on its Realm.
 */
function holdingAt(ref) {
	const parsed = parseHoldingRef(ref);
	const scene = parsed ? game.scenes.get(parsed.sceneId) : null;
	return scene ? getRealm(scene)?.realm.holdings.find((holding) => holding.id === parsed.holdingId) ?? null : null;
}

/**
 * Ask which Holding a Knight's new Domain rules and who sits in its Circle,
 * then found it beside them in the Actors directory and make it theirs.
 * @param {Actor} knight
 * @param {object} [options]
 * @param {string} [options.holding] The Holding offered first, from holdingRef.
 * @param {Actor[]} [options.circle] The Knights ticked for the Circle to start with.
 * @returns {Promise<Actor|null>} The Domain, or null if the window was closed.
 */
export async function foundDomain(knight, { holding = "", circle = [] } = {}) {
	if (!game.user.can("ACTOR_CREATE")) {
		ui.notifications.warn(t("domain.cantCreate"));
		return null;
	}
	const others = worldKnights((actor) => actor !== knight).filter(seenOrChosen((actor) => circle.includes(actor)));
	const data = await inputDialog({
		title: t("domain.founding.title"),
		icon: "fa-solid fa-chess-rook",
		template: "found-domain",
		context: {
			intro: t("domain.founding.intro", { name: escapeHTML(knight.name) }),
			holdings: holdingOptions(holding),
			namePlaceholder: t("domain.newName", { knight: knight.name }),
			circle: others.map((actor) => ({ id: actor.id, name: actor.name, checked: circle.includes(actor) }))
		},
		ok: { label: t("domain.founding.ok"), icon: "fa-solid fa-chess-rook" }
	});
	if (!data) return null;

	const choice = foundry.utils.expandObject(data);
	const ruled = holdingAt(choice.holding);
	const seated = others.filter((actor) => choice.circle?.[actor.id]).map((actor) => actor.id);
	const name = String(choice.name ?? "").trim() || ruled?.name || t("domain.newName", { knight: knight.name });
	return createDomain(knight, { name, holding: ruled ? choice.holding : "", seat: Boolean(ruled?.seat), circle: seated });
}

/**
 * Make a Knight's Domain beside them in the Actors directory, and make it theirs.
 * @param {Actor} knight
 * @param {object} details
 * @param {string} details.name
 * @param {string} [details.holding] The Holding it rules, from holdingRef.
 * @param {boolean} [details.seat] Whether that Holding is a Seat of Power.
 * @param {string[]} [details.circle] The ids of the Knights in its Circle.
 * @returns {Promise<Actor|null>}
 */
export async function createDomain(knight, { name, holding = "", seat = false, circle = [] }) {
	// Players who can see the Knight can see their Domain. Only a GM may hand ownership to others.
	const domain = await Actor.implementation.create({
		name,
		type: "domain",
		folder: knight.folder?.id ?? null,
		system: { ruler: knight.name, holding, seat, council: { circle } },
		...(game.user.isGM ? { ownership: foundry.utils.deepClone(knight.ownership) } : {})
	});
	if (!domain) return null;
	await linkKnightDomain(knight, domain);
	await timelineFounded(knight, domain, game.scenes?.get(parseHoldingRef(holding)?.sceneId) ?? null);
	return domain;
}

/**
 * Ruler (p6): one Knight holds a Holding with the rest of the Company in their
 * Circle. Once the Realm is made, ask which of the players' Knights rules, then found
 * their Domain with a Holding of this Realm offered and the others seated in
 * the Circle. Nothing is asked before there are Knights to ask about.
 * @param {Scene} scene The Realm just made.
 * @returns {Promise<Actor|null>} The Domain, or null where none was founded.
 */
export async function offerRulerDomain(scene) {
	const knights = startKnights();
	if (!knights.length) return null;
	const data = await inputDialog({
		title: t("company.starts.ruler.domainTitle"),
		icon: "fa-solid fa-chess-rook",
		template: "who-rules",
		context: {
			intro: t("company.starts.ruler.domainQuestion"),
			knights: knights.map(({ id, name }) => ({ id, name }))
		},
		ok: { label: t("company.starts.ruler.domainOk") }
	});
	// Left for later, or closed, nobody rules yet.
	const ruler = knights.find((knight) => knight.id === data?.ruler);
	if (!ruler) return null;
	// Any Holding will do, so the first that isn't the Seat of Power, which is under a wicked influence, is offered.
	const holdings = getRealm(scene)?.realm.holdings.filter((holding) => holding.id) ?? [];
	const first = holdings.find((holding) => !holding.seat) ?? holdings[0] ?? null;
	const domain = await foundDomain(ruler, {
		holding: first ? holdingRef(scene.id, first.id) : "",
		circle: knights.filter((knight) => knight !== ruler)
	});
	domain?.sheet.render({ force: true });
	return domain;
}

/**
 * Whoever plays a Knight can look at the Court they sit in, but the Seat's
 * Domain stays the Referee's to run.
 * @param {Actor[]} knights
 * @returns {Record<string, number>}
 */
const courtiersLook = (knights) => ({ default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, ...lookFor({ ownership: {} }, knights) });

/**
 * @param {Scene} scene
 * @returns {object|null} The Realm's Seat of Power, once it's on the map as a Tile.
 */
export const seatOfPower = (scene) => realmSeats(getRealm(scene)?.realm).find((holding) => holding.id) ?? null;

/**
 * @param {object} seat
 * @returns {string} What the Seat is called, as its Domain is.
 */
export const seatName = (seat) => seat.name || t("company.starts.courtier.seatDomain");

/**
 * Courtier (p6): the Knights hold places at the Seat of Power's Court. They
 * join the Court of the Domain ruling the Seat as Courtiers, and where no
 * Domain rules it yet, one is made for it, ruled by nobody of the Company.
 * Nothing is done before there are Knights, or on a Realm with no Seat.
 * @param {Scene} scene The Realm just made.
 * @returns {Promise<Actor|null>} The Seat's Domain, or null where nobody was seated.
 */
export async function seatCourtiers(scene) {
	const seat = seatOfPower(scene);
	const knights = startKnights();
	if (!seat || !knights.length) return null;
	const holding = holdingRef(scene.id, seat.id);
	const ruling = holdingRulers(realmHoldings(), worldDomains(), scene.id, seat.id)[0];
	const domain = ruling ?? await Actor.implementation.create({
		name: seatName(seat),
		type: "domain",
		system: { ruler: "", holding, seat: true },
		ownership: courtiersLook(knights)
	});
	if (!domain) return null;
	// Each is seated as their Knight, so one renamed since is still known and not seated twice.
	const everyKnight = worldKnights();
	const sitting = new Set(courtMembers(domain.system.court).map((member) => courtKnight(member, everyKnight)?.id));
	const newcomers = knights.filter((knight) => !sitting.has(knight.id));
	const note = t("company.starts.courtier.courtNote");
	for (const knight of newcomers) await addCourtMember(domain, "courtier", { name: knight.name, note, knight: knight.id });
	// A Domain that already ruled the Seat lets its new Courtiers' players look at it too.
	if (ruling) {
		const look = lookFor(domain, newcomers);
		if (Object.keys(look).length) await domain.update({ ownership: look });
	}
	ui.notifications.info(t(newcomers.length ? "company.starts.courtier.seated" : "company.starts.courtier.allSeated", { domain: domain.name }));
	return domain;
}

/**
 * @returns {Actor[]} Who a Start seats or offers to rule: the players' Knights who can hold a post,
 *   or every Knight who can where no player has one.
 */
function startKnights() {
	const players = worldKnights((actor) => inCompany(actor) && canHoldPost(actor));
	return players.length ? players : worldKnights(canHoldPost);
}

/**
 * @param {{ownership?: Record<string, number>}} domain
 * @param {Actor[]} knights
 * @returns {Record<string, number>} An Observer's look for each of these Knights' players who can't see the Domain yet.
 */
function lookFor(domain, knights) {
	const { OBSERVER } = CONST.DOCUMENT_OWNERSHIP_LEVELS;
	const level = (user) => domain.ownership?.[user] ?? domain.ownership?.default ?? 0;
	return Object.fromEntries(knights.flatMap(playersOf).filter((user) => level(user) < OBSERVER).map((user) => [user, OBSERVER]));
}
