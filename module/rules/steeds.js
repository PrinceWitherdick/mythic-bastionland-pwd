/**
 * Steeds: which of the book's beasts a Knight may take to ride (p12), and
 * Galloping (p18): 2 Hexes in a Phase, costing a steed that isn't Exhausted d6 VIG. Pure,
 * so it can be tested without Foundry.
 */
import { isSteed } from "./property.js";
import { formatStatLine, maxStats } from "./stat-blocks.js";

/** A Gallop costs the steed this die of VIG (p18). */
export const GALLOP_ROLL = "1d6";

/** The flag on a steed taken from the book: what the book called it, kept under a name of its own. */
export const BREED_FLAG = "breed";

/**
 * @template {{name: string}} T
 * @param {T[]} beasts The book's beasts, as Import PDF read them from p12.
 * @returns {T[]} Those a Knight could ride, in the book's order.
 */
export const bookSteeds = (beasts) => beasts.filter((beast) => isSteed(beast.name));

/**
 * A steed's stat line as the book prints it, such as "VIG 9, CLA 6, SPI 4, 3GD, d6 trample".
 * The scores the book gives it are its maximums.
 * @param {object} system An NPC's system data.
 * @param {{type: string, system: {damage?: string, trample?: boolean}}[]} [items]
 * @param {Record<string, string>} [labels] Each Virtue's abbreviation, and GD's as `guard`.
 * @returns {string}
 */
export function steedStatLine(system, items = [], labels) {
	const parts = [formatStatLine(maxStats(system), labels)].filter(Boolean);
	for (const item of items) if (item.type === "weapon" && item.system.trample) parts.push(`${item.system.damage} trample`);
	return parts.join(", ");
}

/**
 * @typedef {object} GallopRider
 * @property {string} name
 * @property {{name: string, vig: number, slain?: boolean}|null} steed What they ride, with its VIG now.
 */

/**
 * Who can't Gallop: every rider needs a living steed that isn't Exhausted (VIG 0, p9).
 * @param {GallopRider[]} riders
 * @returns {{name: string, reason: "noSteed"|"slain"|"exhausted", steed?: string}[]}
 */
export function gallopBlocked(riders) {
	return riders.flatMap(({ name, steed }) => {
		if (!steed) return [{ name, reason: "noSteed" }];
		if (steed.slain) return [{ name, reason: "slain", steed: steed.name }];
		if (steed.vig <= 0) return [{ name, reason: "exhausted", steed: steed.name }];
		return [];
	});
}

/**
 * Whether an NPC dropped on a Knight is plainly a mount, taken to ride without
 * asking: one taken from the book's steeds, one with a trample, or one whose
 * name says it's a horse or pony. Anybody else may be a steed or a follower.
 * @param {object} npc
 * @param {string} npc.name
 * @param {string} [npc.breed] The book steed it was taken as.
 * @param {boolean} [npc.trample] Whether it carries a trample.
 * @returns {boolean}
 */
export const looksLikeSteed = ({ name, breed = "", trample = false }) => Boolean(breed) || trample || isSteed(name);

/**
 * @param {number} vig The steed's VIG before the Gallop.
 * @param {number} loss The d6 rolled.
 * @returns {number} Its VIG after, never below 0.
 */
export const vigAfterGallop = (vig, loss) => Math.max(0, vig - loss);

/**
 * The kind of steed to show under a named one, such as "Majestic charger"
 * under "Bucephalus". Nothing when the name says it already.
 * @param {string} name The steed's name.
 * @param {string} [breed] The book steed it was taken as.
 * @returns {string}
 */
export function steedBreedShown(name, breed) {
	if (!breed) return "";
	return name.toLowerCase().includes(breed.toLowerCase()) ? "" : breed;
}

