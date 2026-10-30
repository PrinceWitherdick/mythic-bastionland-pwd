/**
 * Stances some Knights' Abilities let them take up: dug in behind a doubled
 * shield (p78), fighting in deep water (p82), counting as Armour 4 after a
 * Gambit spent on Moving (p40), or sworn to a quest (p94). Each is an
 * Ability marked in effect, which ends on its own at the start of the
 * Knight's next turn where its words say so. Pure, so it can be tested
 * without Foundry.
 */

/** When a stance ends on its own: never, or as its Knight's next turn starts. */
export const STANCE_LAPSES = Object.freeze(["", "turn"]);

/**
 * @typedef {object} Stance What the stances in effect do to a Knight's Armour.
 * @property {number} bonus  Armour added to what they wear (p82).
 * @property {number} floor  The Armour they count as having at least, which doesn't add to their own (p40).
 * @property {boolean} doublesShield Their shield's Armour counts twice (p78).
 * @property {{name: string, kind: "bonus"|"floor"|"doublesShield", value: number}[]} lines Each one, for their
 *   Armour's hover to list.
 */

/** No stance at all. */
export const NO_STANCE = Object.freeze({ bonus: 0, floor: 0, doublesShield: false, lines: Object.freeze([]) });

/**
 * @param {object|null|undefined} system An Ability's system data.
 * @returns {boolean} Whether it changes its Knight's Armour while in effect.
 */
export const changesArmour = (system) => Boolean(system?.armourFloor || system?.armourBonus || system?.doublesShield);

/**
 * @param {object|null|undefined} system An Ability's system data.
 * @returns {boolean} Whether it's a stance its Knight takes up and ends, from its row.
 */
export const hasStance = (system) => changesArmour(system) || Boolean(system?.oath);

/**
 * @param {{type: string, system: object}} item
 * @returns {boolean} Whether it's an Ability whose stance is in effect.
 */
const inEffect = (item) => item?.type === "ability" && hasStance(item.system) && Boolean(item.system.inEffect);

/**
 * What the stances a Knight has taken up do to their Armour.
 * @param {{type: string, name: string, system: object}[]} items Their items.
 * @returns {Stance}
 */
export function stanceOf(items) {
	const taken = (items ?? []).filter((item) => inEffect(item) && changesArmour(item.system));
	if (!taken.length) return NO_STANCE;
	const lines = [];
	let bonus = 0;
	let floor = 0;
	let doublesShield = false;
	for (const { name, system } of taken) {
		const added = Math.max(0, Math.trunc(Number(system.armourBonus)) || 0);
		const least = Math.max(0, Math.trunc(Number(system.armourFloor)) || 0);
		if (added) lines.push({ name, kind: "bonus", value: added });
		if (least) lines.push({ name, kind: "floor", value: least });
		if (system.doublesShield) lines.push({ name, kind: "doublesShield", value: 2 });
		bonus += added;
		floor = Math.max(floor, least);
		doublesShield ||= Boolean(system.doublesShield);
	}
	return { bonus, floor, doublesShield, lines };
}

/**
 * Whether a sworn quest holds a Knight's GD back from coming back (p94).
 * @param {{type: string, system: object}[]} items Their items.
 * @returns {boolean}
 */
export const questSworn = (items) => (items ?? []).some((item) => inEffect(item) && item.system.oath);

/**
 * The stances that end as their Knight's next turn starts (p40, p78).
 * @param {{id: string, type: string, system: object}[]} items Their items.
 * @returns {{_id: string, "system.inEffect": false}[]}
 */
export const lapsedUpdates = (items) => (items ?? [])
	.filter((item) => inEffect(item) && item.system.lapses === "turn")
	.map((item) => ({ _id: item.id, "system.inEffect": false }));

/**
 * The stances a Gambit spent on Moving puts into effect (p40).
 * @param {{id: string, type: string, system: object}[]} items Their items.
 * @returns {{_id: string, "system.inEffect": true}[]}
 */
export const onMoveUpdates = (items) => (items ?? [])
	.filter((item) => item?.type === "ability" && hasStance(item.system) && item.system.onMove && !item.system.inEffect)
	.map((item) => ({ _id: item.id, "system.inEffect": true }));

/**
 * Whether an Ability's die is ticked for every Attack while its stance holds,
 * as fighting in deep water adds one to them all (p82). One kept for some
 * blows, or for one kind of Attack, still waits to be ticked.
 * @param {object|null|undefined} system An Ability's system data.
 * @returns {boolean}
 */
export const stanceTicks = (system) => hasStance(system) && Boolean(system.inEffect) && !system.situational && !system.needs;
