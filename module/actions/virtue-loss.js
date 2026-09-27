/**
 * Virtue Loss (p9), rolled for one character: each loss taken from what the
 * one before it left, never below 0. Nothing is written here; the update comes
 * back to be written in one go with anything else the caller changes.
 * @param {Actor} actor
 * @param {{virtue: string, dice?: string}[]} losses In the order they're taken. `dice` is d6 by
 *   default. Anything else on a loss, such as what caused it, comes back with it.
 * @returns {Promise<{update: object, taken: {virtue: string, roll: Roll, from: number, to: number}[]}>}
 *   A loss from a Virtue the character hasn't got is left out.
 */
export async function rollVirtueLosses(actor, losses) {
	const values = {};
	const update = {};
	const taken = [];
	for (const loss of losses) {
		const { virtue, dice = "1d6" } = loss;
		const from = values[virtue] ?? actor.system.virtues?.[virtue]?.value;
		if (typeof from !== "number") continue;
		const roll = await new Roll(dice).evaluate();
		const to = Math.max(0, from - roll.total);
		values[virtue] = to;
		update[`system.virtues.${virtue}.value`] = to;
		taken.push({ ...loss, roll, from, to });
	}
	return { update, taken };
}
