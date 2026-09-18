/**
 * Squires (Knighthood, p7). Small Companies may give each Knight a Squire, an
 * apprentice who is not yet a Knight, so cannot gain Glory or perform Feats.
 * Pure, so the rolls and what they make can be tested without Foundry.
 */
import { SYSTEM_PATH } from "../system-id.js";
import { VIRTUES, clampVirtue } from "./virtues.js";

/** A new Squire's portrait: somebody on one knee, waiting to be made a Knight. */
export const SQUIRE_IMAGE = `${SYSTEM_PATH}/assets/icons/squire.svg`;

/** Companies of this many Knights or fewer may give each Knight a Squire. */
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
 */
export const SQUIRE_EQUIPMENT = Object.freeze([
	Object.freeze({ key: "cudgel", type: "weapon", system: Object.freeze({ damage: "d8", hefty: true }) }),
	Object.freeze({ key: "axe", type: "weapon", system: Object.freeze({ damage: "d8", hefty: true }) }),
	Object.freeze({ key: "hatchet", type: "weapon", system: Object.freeze({ damage: "d6" }) }),
	Object.freeze({ key: "shortbow", type: "weapon", system: Object.freeze({ damage: "d6", long: true, ranged: true }) }),
	Object.freeze({ key: "shield", type: "armour", system: Object.freeze({ kind: "shield", armour: 1, damage: "d4" }) }),
	Object.freeze({ key: "javelins", type: "weapon", system: Object.freeze({ damage: "d6" }) })
]);

/**
 * @param {number} value
 * @returns {{value: number, max: number}} A score at its maximum.
 */
const track = (value) => ({ value, max: value });

/** When Knighted they gain d6 in each Virtue. */
export const KNIGHTING_GAIN_ROLL = "1d6";

/**
 * @param {number} knights Knights in the Company, not counting Squires.
 * @returns {boolean} Whether the Company is small enough for Squires.
 */
export const mayTakeSquires = (knights) => knights <= SQUIRE_COMPANY_LIMIT;

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
