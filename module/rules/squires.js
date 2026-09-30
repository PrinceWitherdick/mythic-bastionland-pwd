/**
 * Squires (Knighthood, p7). In a small Company each Knight may have a Squire,
 * an apprentice who isn't a Knight yet and so has no Glory and no Feats.
 * Pure, so the rolls and what they make can be tested without Foundry.
 */
import { SYSTEM_PATH } from "../system-id.js";
import { knightChoice } from "./creation.js";
import { VIRTUES, clampVirtue } from "./virtues.js";

/** A new Squire's portrait: somebody on one knee, waiting to be made a Knight. */
export const SQUIRE_IMAGE = `${SYSTEM_PATH}/assets/icons/squire.svg`;

/** The most Knights a Company can have and still keep a Squire for each. */
const SQUIRE_COMPANY_LIMIT = 2;

/** Each Virtue is rolled on 2d6, and a Squire has 1GD. */
export const SQUIRE_VIRTUE_ROLL = "2d6";
export const SQUIRE_GUARD = 1;

/** They ride a pony. */
const SQUIRE_PONY = Object.freeze({ vig: 7, cla: 7, spi: 2, guard: 2 });

/** Every Squire carries a dagger, as every Knight does. */
const SQUIRE_DAGGER = Object.freeze({ key: "dagger", type: "weapon", system: Object.freeze({ damage: "d6" }) });

/**
 * A d6 for their extra equipment, in table order. Names live under
 * `bastionland.squire.equipment`. The shortbow is purely ranged, as bows are.
 * p7 prints the hatchet and javelins as plain d6, but the weapon list (p12)
 * makes both hefty, so they are here too. The javelins are counted, three of
 * them, as a Knight's "3 javelins" are. The cudgel, shortbow and shield are
 * wooden, so a Strong Gambit can break them (p10); set here rather than read
 * off the name, which is translated.
 */
export const SQUIRE_EQUIPMENT = Object.freeze([
	Object.freeze({ key: "cudgel", type: "weapon", system: Object.freeze({ damage: "d8", hefty: true, wooden: true }) }),
	Object.freeze({ key: "axe", type: "weapon", system: Object.freeze({ damage: "d8", hefty: true }) }),
	Object.freeze({ key: "hatchet", type: "weapon", system: Object.freeze({ damage: "d6", hefty: true }) }),
	Object.freeze({ key: "shortbow", type: "weapon", system: Object.freeze({ damage: "d6", long: true, ranged: true, wooden: true }) }),
	Object.freeze({ key: "shield", type: "armour", system: Object.freeze({ kind: "shield", armour: 1, damage: "d4", wooden: true }) }),
	Object.freeze({ key: "javelins", type: "weapon", system: Object.freeze({ damage: "d6", hefty: true, quantity: Object.freeze({ value: 3, max: 3 }) }) })
]);

/**
 * The pages a Squire's sheet shows: their own, then whatever of the Knight's
 * still suits them. Taken from the pages the reader is shown rather than a list
 * of its own, so a page that comes and goes with the reader, such as Settings,
 * still does, and a page added to the rail is a Squire's unless it says
 * otherwise with `squire: false`.
 * @param {{id: string, squire?: boolean}[]} tabs The Knight sheet's pages, as this reader sees them.
 * @param {{id: string}} squirePage  The Squire's own page, which leads.
 * @returns {{id: string}[]}
 */
export const squireTabs = (tabs, squirePage) => [squirePage, ...tabs].filter((tab) => tab.squire !== false);

/**
 * @param {number} value
 * @returns {{value: number, max: number}} A score at its maximum.
 */
const track = (value) => ({ value, max: value });

/** On being Knighted, each Virtue rises by this. */
export const KNIGHTING_GAIN_ROLL = "1d6";

/**
 * How many Knights the Company has: one for each player with a Knight. A
 * fallen Knight left in the Actors directory and the heir who follows them
 * share a player, so they count once, and Squires don't count at all.
 * @param {{isSquire: boolean, players: string[]}[]} knights Every Knight in the
 *   world, with the ids of the players who own them (never the GM's).
 * @returns {number}
 */
export const companySize = (knights) => new Set(knights.filter((knight) => !knight.isSquire).flatMap((knight) => knight.players)).size;

/**
 * @param {number} knights Knights in the Company, not counting Squires.
 * @returns {boolean} Whether the Company is small enough for Squires.
 */
export const mayTakeSquires = (knights) => knights <= SQUIRE_COMPANY_LIMIT;

/**
 * @param {number} before Knights in the Company before a change.
 * @param {number} after  Knights in the Company after it.
 * @returns {boolean} Whether the change took the Company past the size that may keep Squires.
 */
export const outgrewSquires = (before, after) => mayTakeSquires(before) && !mayTakeSquires(after);

/**
 * @param {number} d6
 * @returns {object|null} The extra equipment rolled, from SQUIRE_EQUIPMENT.
 */
export const squireEquipment = (d6) => SQUIRE_EQUIPMENT[d6 - 1] ?? null;

/**
 * Item data a new Squire carries: the dagger and their extra equipment.
 * @param {number} d6 The equipment roll.
 * @param {Record<string, string>} names By key, for the dagger and each piece of equipment.
 * @returns {object[]}
 */
export function squireItems(d6, names) {
	return [SQUIRE_DAGGER, squireEquipment(d6)].filter(Boolean).map(({ key, type, system }) => ({
		type,
		name: names[key],
		system: { ...system, equipped: true }
	}));
}

/**
 * The actor data for a Squire's rolled scores, current and maximum alike.
 * @param {Record<string, number>} virtues
 * @returns {object}
 */
export function squireSystem(virtues) {
	return {
		isSquire: true,
		virtues: Object.fromEntries(VIRTUES.map((key) => [key, track(clampVirtue(virtues[key]))])),
		guard: track(SQUIRE_GUARD),
		glory: 0
	};
}

/**
 * The pony a Squire rides, as NPC system data.
 * @returns {object}
 */
export function ponySystem() {
	return {
		virtues: Object.fromEntries(VIRTUES.map((key) => [key, track(SQUIRE_PONY[key])])),
		guard: track(SQUIRE_PONY.guard)
	};
}

/**
 * Kneeling doesn't suit a Knight, so a Squire Knighted while still wearing
 * their Squire's portrait goes back to Foundry's blank one until their player
 * picks another. A portrait or Token picture chosen since is kept.
 * @param {{img: string, prototypeToken: {texture: {src: string}}}} squire
 * @param {string} blank Foundry's default portrait.
 * @returns {object} Update data, empty when there's nothing to change.
 */
export function knightedLooks(squire, blank) {
	const update = {};
	if (squire.img === SQUIRE_IMAGE) update.img = blank;
	if (squire.prototypeToken?.texture?.src === SQUIRE_IMAGE) update["prototypeToken.texture.src"] = blank;
	return update;
}

/**
 * A Squire's Virtues once Knighted: each rises by its d6, current and maximum
 * alike, and never past 19.
 * @param {Record<string, {value: number, max: number}>} virtues
 * @param {Record<string, number>} gains The d6 rolled for each Virtue.
 * @returns {Record<string, {value: number, max: number}>}
 */
export function knightedVirtues(virtues, gains) {
	return Object.fromEntries(VIRTUES.map((key) => {
		const gain = Math.max(0, Math.trunc(gains[key]) || 0);
		return [key, { value: clampVirtue(virtues[key].value + gain), max: clampVirtue(virtues[key].max + gain) }];
	}));
}

/**
 * The flag on a Squire just Knighted who is still to choose which Knight they
 * became. While it stands, the chooser adds that Knight to them rather than
 * making them over.
 */
export const CHOOSING_FLAG = "choosingKnight";

/**
 * @param {string} name
 * @param {string} template The name a Squire is given, as "Squire to {knight}".
 * @returns {boolean} Whether the name is still the one they were given as a Squire.
 */
export function isSquireName(name, template) {
	const [before, after = ""] = String(template ?? "").toLowerCase().split("{knight}").map((part) => part.trim());
	const given = String(name ?? "").trim().toLowerCase();
	if (!before && !after) return false;
	return given.length > before.length + after.length && given.startsWith(before) && given.endsWith(after);
}

/**
 * A Knighted Squire becoming the Knight chosen for them (p7: "Roll or choose a
 * Knight"). They're named that Knight, and the Seer on the Knight's page is the
 * one who knighted them. The Knight's portrait and Token picture are taken only
 * where theirs are still a stand-in. Their Virtues, GD, Age and Glory stay.
 * @param {{img: string, tokenImg: string}} squire Their portrait and Token picture.
 * @param {object|null} knight A Knight from the art index; none before Import PDF, which names nothing.
 * @param {object|null} seer    Their Seer from the art index.
 * @param {string} blank        Foundry's default portrait.
 * @returns {object} An Actor update.
 */
export function knightedChoice({ img, tokenImg }, knight, seer, blank) {
	if (!knight) return {};
	const update = knightChoice(knight, seer);
	const standIn = (src) => !src || src === blank || src === SQUIRE_IMAGE;
	if (knight.path && standIn(img)) update.img = knight.path;
	if (knight.token && standIn(tokenImg)) update["prototypeToken.texture.src"] = knight.token;
	return update;
}

/**
 * The items a Knighted Squire gains from the Knight they became: all of that
 * Knight's, less any piece of the kit every Knight carries (p7) that they
 * carry already, such as the dagger every Squire has.
 * @param {{type: string, name: string}[]} items The Knight's items, from knightItems.
 * @param {{type: string, name: string}[]} carried What the Squire carries.
 * @param {string[]} kitNames The kit's names.
 * @returns {{type: string, name: string}[]}
 */
export function itemsGained(items, carried, kitNames) {
	const key = (item) => `${item.type}:${String(item.name ?? "").trim().toLowerCase()}`;
	const kit = new Set(kitNames.map((name) => String(name).trim().toLowerCase()));
	const have = new Set(carried.map(key));
	return items.filter((item) => !(kit.has(String(item.name ?? "").trim().toLowerCase()) && have.has(key(item))));
}
