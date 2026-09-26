/**
 * A single Remedy is a sizeable bundle of materials and tools, and a person
 * or dedicated beast of burden can only carry one at once (Remedies, p9).
 * Pure, so it can be tested without Foundry.
 */
import { isCounted } from "./restock.js";

/** How many Remedies one person or beast of burden can carry. */
export const REMEDY_LIMIT = 1;

/**
 * @param {{remedy?: string, quantity?: {value: number|null}}} system A gear item's system data.
 * @returns {number} How many Remedies it is: none for anything else or one used up,
 *   its count when counted, and one otherwise.
 */
export function remedyCount(system) {
	if (!system?.remedy) return 0;
	return isCounted(system) ? Math.max(0, system.quantity.value) : 1;
}

/**
 * Whether an actor carries its own load: a Knight, or one person or beast.
 * A Warband is two dozen people, and a ship or wall is no bearer at all.
 * @param {{type: string, system?: {scale?: string}}|null|undefined} actor
 * @returns {boolean}
 */
export const bearsRemedies = (actor) => actor?.type === "knight" || (actor?.type === "npc" && actor.system?.scale !== "warband");

/**
 * How many Remedies an actor would carry with one item added or changed.
 * @param {{id?: string|null, type: string, system: object}[]} items What they carry now.
 * @param {{id?: string|null, system: object}} change The item as it would be. An id
 *   they already carry replaces that item; none adds it.
 * @returns {number}
 */
export function remedyLoad(items, change) {
	const others = items.filter((item) => item.type === "gear" && (!change.id || item.id !== change.id));
	return others.reduce((sum, item) => sum + remedyCount(item.system), 0) + remedyCount(change.system);
}

/**
 * Whether a change would have an actor carry more Remedies than they can. A
 * load already too heavy, from before the limit was kept, may still lighten.
 * @param {{id?: string|null, type: string, system: object}[]} items
 * @param {{id?: string|null, system: object}} change
 * @returns {boolean}
 */
export function overRemedyLimit(items, change) {
	const after = remedyLoad(items, change);
	if (after <= REMEDY_LIMIT) return false;
	const before = items.filter((item) => item.type === "gear").reduce((sum, item) => sum + remedyCount(item.system), 0);
	return after > before;
}
