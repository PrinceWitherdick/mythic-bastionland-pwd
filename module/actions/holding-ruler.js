import { filterBySearch, inputDialog } from "../apps/ui.js";
import { findByRoll, loadArtIndex } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { spreads } from "../rules/book-art.js";
import { knightTypeKey } from "../rules/creation.js";
import { domainRuledBy, holdingRef, holdingRulers, parseHoldingRef, rulingKnightOf } from "../rules/dominion.js";
import { featureAt, holdingName } from "../rules/realm.js";
import { escapeHTML, searchable } from "../rules/text.js";
import { knightDomain, linkKnightDomain, worldDomains } from "./dominion.js";
import { createDomain, foundDomain } from "./found-domain.js";
import { realmHoldings } from "./homecoming.js";
import { worldKnights } from "./knights.js";
import { makeNpcKnight } from "./npc-knights.js";
import { getRealm } from "./realm.js";

/**
 * Who rules a Holding (Dominion, p20), read and given from the hex it stands
 * in. A Knight rules a Holding through their Domain, which names the Holding
 * it rules. Any Knight of the book's table may be granted one: a Knight with
 * a Domain has it rule the Holding, a Knight of the world without one founds
 * one there, and a Knight met only in the book is made as an NPC Knight, in
 * the NPCs folder, with a Domain there ruling it.
 */

/** @returns {Actor[]} The world's Knights who could rule: not Squires, who aren't knighted yet (p7). */
const rulingKnights = () => worldKnights((actor) => !actor.system.isSquire);

/**
 * The Domains ruling a Holding, each with the Knight ruling it.
 * @param {Scene} scene
 * @param {{id: string|null}} holding
 * @returns {{domain: Actor, knight: Actor|null}[]} Empty for a Holding not yet on the map as a Tile.
 */
export function rulersOf(scene, holding) {
	if (!scene || !holding?.id) return [];
	const knights = rulingKnights();
	return holdingRulers(realmHoldings(), worldDomains(), scene.id, holding.id).map((domain) => ({ domain, knight: rulingKnightOf(domain, knights) }));
}

/**
 * @typedef {object} GrantChoice One Knight the Holding could be granted to.
 * @property {string} value  What the dialog's radio sends back.
 * @property {string} name
 * @property {string} detail What granting it to them does.
 * @property {Actor|null} domain The Domain that would rule it, where one stands already.
 * @property {Actor|null} knight The world's Knight, where there is one.
 * @property {string|null} roll Their roll on the Knights table, for a Knight not yet made.
 * @property {boolean} checked
 * @property {string} search
 */

/**
 * Everyone the Holding could be granted to: the Knights with a Domain first,
 * then every Knight of the book's table, each as the world's Knight where
 * one has been made of them, and last any Knight of the world the table
 * doesn't name.
 * @param {object} data
 * @param {object|null} data.index The art index.
 * @param {Actor[]} data.knights The world's Knights who could rule.
 * @param {Actor[]} data.domains The world's Domains.
 * @param {Actor[]} data.ruling The Domains ruling the Holding now.
 * @returns {{domained: GrantChoice[], table: GrantChoice[], others: GrantChoice[]}}
 */
export function grantChoices({ index, knights, domains, ruling }) {
	const rules = (domain) => Boolean(domain) && ruling.includes(domain);
	const choice = (value, name, detail, { domain = null, knight = null, roll = null } = {}) => ({
		value,
		name,
		detail: rules(domain) ? t("hexGm.ruler.rulesHere") : detail,
		domain,
		knight,
		roll,
		checked: rules(domain),
		search: searchable(name)
	});

	const domained = knights.filter((knight) => knightDomain(knight)).map((knight) => {
		const domain = knightDomain(knight);
		return choice(`knight:${knight.id}`, knight.name, t("hexGm.ruler.hasDomain", { domain: domain.name }), { domain, knight });
	});
	const placed = new Set(domained.map(({ knight }) => knight));
	const byType = new Map(knights.map((knight) => [knightTypeKey(knight.system.knightType), knight]).filter(([type]) => type));

	const table = spreads().map(({ roll }) => {
		const entry = findByRoll(index?.knights, roll);
		const name = entry?.name ?? t("chooser.unnamed", { roll });
		const knight = entry?.name ? byType.get(knightTypeKey(entry.name)) ?? null : null;
		if (knight && placed.has(knight)) return null;
		if (knight) {
			placed.add(knight);
			return choice(`knight:${knight.id}`, knight.name, t("hexGm.ruler.isKnight", { roll, book: name }), { knight });
		}
		// A Domain may already name a Knight of the book as its ruler, without an actor for them.
		const domain = entry?.name ? domainRuledBy(domains, name) : null;
		if (domain) return choice(`book:${roll}`, name, t("hexGm.ruler.namedDomain", { roll, domain: domain.name }), { domain, roll });
		return choice(`book:${roll}`, name, t("hexGm.ruler.bookKnight", { roll }), { roll });
	}).filter(Boolean);

	const others = knights.filter((knight) => !placed.has(knight)).map((knight) => choice(`knight:${knight.id}`, knight.name, t("hexGm.ruler.noDomain"), { knight }));

	// Whoever rules it now is chosen to start with, or else the first offered.
	const all = [...domained, ...table, ...others];
	if (!all.some(({ checked }) => checked) && all.length) all[0].checked = true;
	return { domained, table, others };
}

/**
 * The search over the grant's list: it hides the Knights it doesn't find, and
 * Enter in it doesn't grant the Holding to whoever happens to be chosen.
 * @param {HTMLElement|null|undefined} element The dialog.
 */
function wireGrantSearch(element) {
	const box = element?.querySelector(".bastionland-grant__search");
	const list = element?.querySelector(".bastionland-grant__lists");
	box?.addEventListener("input", () => filterBySearch(list, box.value, ".bastionland-grant__none"));
	box?.addEventListener("keydown", (event) => {
		if (event.key === "Enter") event.preventDefault();
	});
}

/**
 * Ask which Knight a Holding is granted to, then make it theirs, and have any
 * other Domain given it give it up. GMs only.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex The Holding's hex.
 * @returns {Promise<Actor|null>} The Domain that rules it now, or null if nothing was granted.
 */
export async function grantHolding(scene, hex) {
	if (!game.user.isGM) return null;
	const realm = scene ? getRealm(scene)?.realm : null;
	const holding = realm ? featureAt(realm, hex).holding : null;
	if (!holding?.id) return null;
	const before = rulersOf(scene, holding);
	const index = await loadArtIndex();
	const choices = grantChoices({ index, knights: rulingKnights(), domains: worldDomains(), ruling: before.map(({ domain }) => domain) });
	const name = holdingName(holding, t);
	const data = await inputDialog({
		title: t("hexGm.ruler.grantTitle", { name }),
		icon: "fa-solid fa-chess-rook",
		template: "grant-holding",
		context: { intro: t("hexGm.ruler.grantIntro", { name: escapeHTML(name) }), ...choices },
		ok: { label: t("hexGm.ruler.grant"), icon: "fa-solid fa-chess-rook" },
		render: (_event, dialog) => wireGrantSearch(dialog.element)
	});
	const chosen = [...choices.domained, ...choices.table, ...choices.others].find(({ value }) => value === data?.ruler);
	if (!chosen) return null;

	const ref = holdingRef(scene.id, holding.id);
	const seat = Boolean(holding.seat);
	// A Knight met only in the book is made first, to be the Domain's ruler.
	const knight = chosen.knight ?? (chosen.roll ? await makeNpcKnight(chosen.roll, index) : null);
	if (!knight) return null;
	let domain = chosen.domain;
	if (domain) {
		await domain.update({ "system.holding": ref, "system.seat": seat, ...(chosen.knight ? {} : { "system.ruler": knight.name }) });
		// A Domain that named a Knight of the book is theirs now they're made.
		if (!chosen.knight) await linkKnightDomain(knight, domain);
	} else if (chosen.knight) domain = await foundDomain(knight, { holding: ref });
	else domain = await createDomain(knight, { name: holding.name || t("domain.newName", { knight: knight.name }), holding: ref, seat });
	// Founding a Domain lets the GM choose another Holding, or none: then this one stays with its rulers.
	if (domain?.system.holding !== ref) return null;
	// One Domain rules a Holding: any other given it gives it up.
	for (const { domain: other } of before) {
		if (other !== domain && parseHoldingRef(other.system.holding)) await other.update({ "system.holding": "" });
	}
	return domain;
}
