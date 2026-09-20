/**
 * Steeds: which of the book's beasts a Knight may take to ride (p12), and
 * Galloping (p18), 2 Hexes on a non-Exhausted steed that loses d6 VIG. Pure,
 * so it can be tested without Foundry.
 */
import { isSteed } from "./property.js";
import { formatStatLine } from "./stat-blocks.js";
import { VIRTUES } from "./virtues.js";

/** A Gallop costs the steed this die of VIG (p18). */
export const GALLOP_ROLL = "1d6";

/**
 * @template {{name: string}} T
 * @param {T[]} beasts The book's beasts, as Import PDF read them from p12.
 * @returns {T[]} Those a Knight could ride, in the book's order.
 */
export const bookSteeds = (beasts) => beasts.filter((beast) => isSteed(beast.name));

/**
 * A steed's stat line as the book prints it, such as "VIG 10, CLA 5, SPI 5, 5GD, d8 trample".
 * The scores the book gives it are its maximums.
 * @param {object} system An NPC's system data.
 * @param {{type: string, system: {damage?: string, trample?: boolean}}[]} [items]
 * @param {Record<string, string>} [labels] Each Virtue's abbreviation, and GD's as `guard`.
 * @returns {string}
 */
export function steedStatLine(system, items = [], labels) {
	const stats = {
		...Object.fromEntries(VIRTUES.map((key) => [key, system.virtues?.[key]?.max ?? null])),
		guard: system.guard?.max ?? null
	};
	const parts = [formatStatLine(stats, labels)].filter(Boolean);
	for (const item of items) if (item.type === "weapon" && item.system.trample) parts.push(`${item.system.damage} trample`);
	return parts.join(", ");
}

/**
 * @typedef {object} GallopRider
 * @property {string} name
 * @property {{name: string, vig: number}|null} steed What they ride, with its VIG now.
 */

/**
 * Who can't Gallop: every rider needs a steed that isn't Exhausted (VIG 0, p9).
 * @param {GallopRider[]} riders
 * @returns {{name: string, reason: "noSteed"|"exhausted", steed?: string}[]}
 */
export function gallopBlocked(riders) {
	return riders.flatMap(({ name, steed }) => {
		if (!steed) return [{ name, reason: "noSteed" }];
		if (steed.vig <= 0) return [{ name, reason: "exhausted", steed: steed.name }];
		return [];
	});
}

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
