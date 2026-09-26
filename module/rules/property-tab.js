// A Knight sheet's Property page holds what the Knight owns, their Steed and
// their Squire. Its tab on the rail shows whatever carries it all: the steed
// they ride, else the Squire who serves them, else their own back.

import { parseDice } from "./attack.js";

/** Classes for the tab's icon, by what carries the Knight's things. */
export const CARRIER_ICONS = Object.freeze({
	steed: "fa-solid fa-horse",
	// The figure from the Squire's portrait, which Font Awesome has nothing like; see styles/mythic-bastionland.css.
	squire: "bastionland-glyph bastionland-glyph--squire",
	back: "fa-solid fa-backpack"
});

/**
 * What carries a Knight's things.
 * @param {{steed?: unknown, squire?: unknown}} [bearers] The steed they ride and the Squire who serves them, where there's one.
 * @returns {"steed"|"squire"|"back"}
 */
export function carrierOf({ steed, squire } = {}) {
	if (steed) return "steed";
	return squire ? "squire" : "back";
}

/**
 * @param {{steed?: unknown, squire?: unknown}} [bearers]
 * @returns {string} The classes for the Property tab's icon.
 */
export const propertyTabIcon = (bearers) => CARRIER_ICONS[carrierOf(bearers)];

/** Worn armour from the head outward: helm, what's worn under (a coat), then plates over it. */
const ARMOUR_LAYERS = Object.freeze(["helm", "coat", "plates"]);

/** Coats worn next to the body, such as a gambeson, go under mail. */
const PADDING = /gambeson|padd|quilt|aketon|arming|leather|hide|fur|cloth|robe|jack\b/i;

/**
 * The most a weapon's damage can roll, such as 8 for "d8" or 12 for "2d6".
 * @param {string} [damage]
 * @returns {number}
 */
export function damageReach(damage = "") {
	return parseDice(damage).reduce((sum, faces) => sum + faces, 0);
}

/**
 * Where an owned thing sits in the Property list: weapons first, biggest die
 * leading, then shields, which are both (their Attack die leading), then
 * armour from the head outward, then everything else.
 * @param {{type: string, name?: string, system?: object}} item
 * @returns {number[]} Compared place by place, smaller first.
 */
export function propertyPlace(item) {
	if (item.type === "weapon") return [0, -damageReach(item.system?.damage)];
	if (item.type === "armour" && item.system?.kind === "shield") return [1, -damageReach(item.system.damage)];
	if (item.type === "armour") {
		const layer = ARMOUR_LAYERS.indexOf(item.system?.kind);
		const padding = item.system?.kind === "coat" && PADDING.test(item.name ?? "") ? 0 : 1;
		return [2, layer < 0 ? ARMOUR_LAYERS.length : layer, padding];
	}
	return [3];
}

/**
 * Compares two owned things by their place in the Property list; ties keep their own order.
 * @param {{type: string, name?: string, system?: object, sort?: number}} a
 * @param {{type: string, name?: string, system?: object, sort?: number}} b
 * @returns {number}
 */
export function comparePropertyPlace(a, b) {
	const [pa, pb] = [propertyPlace(a), propertyPlace(b)];
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff) return diff;
	}
	return (a.sort ?? 0) - (b.sort ?? 0);
}

/**
 * Whether two owned things share a place in the Property list, so only their own order tells them apart.
 * @param {{type: string, name?: string, system?: object}} a
 * @param {{type: string, name?: string, system?: object}} b
 * @returns {boolean}
 */
export function samePropertyPlace(a, b) {
	const [pa, pb] = [propertyPlace(a), propertyPlace(b)];
	return pa.length === pb.length && pa.every((part, index) => part === pb[index]);
}
