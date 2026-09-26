/**
 * Possessions that come round again, such as titan beads restocked each new
 * Season or a salve prepared once a day. Pure, so it can be tested without Foundry.
 */

/** How often a possession is restocked: never, each new Season, or each day. */
export const RESTOCK_CADENCES = Object.freeze(["", "season", "day"]);

/**
 * @typedef {object} Carried An item's count: how many are left, and how many a
 *   full stock holds. Either is null while nobody counts them.
 * @property {number|null} value
 * @property {number|null} max
 */

/**
 * @param {{quantity?: Carried}} system An item's system data.
 * @returns {boolean} Whether anybody keeps count of it.
 */
export const isCounted = (system) => Number.isInteger(system?.quantity?.value);

/**
 * @param {{quantity?: Carried}} system An item's system data.
 * @returns {boolean} Whether it's counted and none are left.
 */
export const isUsedUp = (system) => isCounted(system) && system.quantity.value <= 0;

/**
 * Whether an item can be used at all: it isn't broken, and some are left.
 * @param {{broken?: boolean, quantity?: Carried}} system
 * @returns {boolean}
 */
export const isAtHand = (system) => !system?.broken && !isUsedUp(system);

/**
 * A count moved up or down by some, never below none nor, when a full stock
 * is known, above it.
 * @param {Carried} quantity
 * @param {number} by
 * @returns {number}
 */
export function countAfter(quantity, by) {
	const value = Math.max(0, (Number.isInteger(quantity?.value) ? quantity.value : 0) + by);
	return Number.isInteger(quantity?.max) ? Math.min(value, Math.max(quantity.max, 0)) : value;
}

/**
 * The item updates that restock whatever comes round with the calendar: a
 * count back up to its full stock, and a flask smashed since mended.
 * @param {{id: string, system: {restock?: string, broken?: boolean, quantity?: Carried}}[]} items
 * @param {string[]} turned Which cadences came round, from cadencesTurned.
 * @returns {{_id: string, [key: string]: unknown}[]}
 */
export function restockUpdates(items, turned) {
	const updates = [];
	for (const item of items) {
		const { restock, broken, quantity } = item.system ?? {};
		if (!restock || !turned.includes(restock)) continue;
		const update = {};
		if (Number.isInteger(quantity?.max) && quantity.value !== quantity.max) update["system.quantity.value"] = quantity.max;
		if (broken) update["system.broken"] = false;
		if (Object.keys(update).length) updates.push({ _id: item.id, ...update });
	}
	return updates;
}
