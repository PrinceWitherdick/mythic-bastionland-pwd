import { chooseDialog, inputDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { holdingRef, parseHoldingRef } from "../rules/dominion.js";
import { escapeHTML } from "../rules/text.js";
import { linkKnightDomain } from "./dominion.js";
import { holdingOptions } from "./homecoming.js";
import { getRealm } from "./realm.js";

/**
 * Founding a Knight's Domain (Dominion, p20): which Holding it rules, what it's
 * called, and which of the other Knights sit in its Circle. A Ruler Start (p6)
 * founds one as the Realm is made — "One Knight rules a Holding, the others
 * are in their Circle" — once there are Knights to rule it.
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
	const others = game.actors.filter((actor) => actor.type === "knight" && actor !== knight);
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
	const seated = others.filter((actor) => choice.circle?.[actor.id]).map((actor) => actor.name);
	const name = String(choice.name ?? "").trim() || ruled?.name || t("domain.newName", { knight: knight.name });
	// Players who can see the Knight can see their Domain. Only a GM may hand ownership to others.
	const domain = await Actor.implementation.create({
		name,
		type: "domain",
		folder: knight.folder?.id ?? null,
		system: {
			ruler: knight.name,
			holding: ruled ? choice.holding : "",
			seat: Boolean(ruled?.seat),
			council: { circle: seated.join(", ") }
		},
		...(game.user.isGM ? { ownership: foundry.utils.deepClone(knight.ownership) } : {})
	});
	if (!domain) return null;
	await linkKnightDomain(knight, domain);
	return domain;
}

/**
 * Ruler (p6): "One Knight rules a Holding, the others are in their Circle."
 * Once the Realm is made, ask which of the players' Knights rules, then found
 * their Domain with a Holding of this Realm offered and the others seated in
 * the Circle. Nothing is asked before there are Knights to ask about.
 * @param {Scene} scene The Realm just made.
 * @returns {Promise<Actor|null>} The Domain, or null where none was founded.
 */
export async function offerRulerDomain(scene) {
	const players = game.actors.filter((actor) => actor.type === "knight" && actor.hasPlayerOwner);
	const knights = players.length ? players : game.actors.filter((actor) => actor.type === "knight");
	if (!knights.length) return null;
	const id = await chooseDialog({
		title: t("company.starts.ruler.domainTitle"),
		icon: "fa-solid fa-chess-rook",
		message: t("company.starts.ruler.domainQuestion"),
		buttons: [
			...knights.map((knight, index) => ({ action: knight.id, label: knight.name, default: index === 0 })),
			{ action: "later", icon: "fa-solid fa-hourglass", label: t("company.starts.ruler.domainLater") }
		]
	});
	const ruler = knights.find((knight) => knight.id === id);
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
