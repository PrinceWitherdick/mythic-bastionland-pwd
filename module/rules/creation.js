/**
 * Making a Knight (Beginnings & Glory p6, Knighthood p7). Plain data and
 * functions, so the Knight chooser's choices can be tested without Foundry.
 */
import { RANKS } from "./glory.js";
import { escapeHTML } from "./text.js";
import { VIRTUES } from "./virtues.js";

const gloryFor = (rankKey) => RANKS.find((rank) => rank.key === rankKey).glory;

/**
 * The Starts a Company can begin with. Each sets the dice for Virtues and GD,
 * the Knights' Age, and their Rank, given as the Glory that reaches it.
 */
export const STARTS = Object.freeze([
	Object.freeze({ key: "wanderer", virtues: "1d12 + 1d6", guard: "1d6", age: "young", rank: "errant", glory: gloryFor("errant") }),
	Object.freeze({ key: "courtier", virtues: "1d12 + 6", guard: "2d6", age: "mature", rank: "gallant", glory: gloryFor("gallant") }),
	Object.freeze({ key: "ruler", virtues: "1d12 + 6", guard: "1d6 + 6", age: "mature", rank: "tenant", glory: gloryFor("tenant") })
]);

/** "If unsure, roll d12+d6" for Virtues and d6 for GD: the Wanderer's dice. */
export const DEFAULT_START = "wanderer";

/**
 * @param {string} key
 * @returns {object} The Start, or the default for an unknown key.
 */
export function startFor(key) {
	return STARTS.find((start) => start.key === key) ?? STARTS.find((start) => start.key === DEFAULT_START);
}

/** What every Knight carries besides their Property (p7). Names live under `bastionland.chooser.kit`. */
export const STANDARD_KIT = Object.freeze([
	Object.freeze({ key: "dagger", type: "weapon", system: Object.freeze({ damage: "d6" }) }),
	Object.freeze({ key: "torches", type: "gear" }),
	Object.freeze({ key: "rope", type: "gear" }),
	Object.freeze({ key: "rations", type: "gear" }),
	Object.freeze({ key: "camping", type: "gear" })
]);

/**
 * @param {string} name e.g. "The Lantern Knight".
 * @returns {string} "Lantern", for "Known as the ___ Knight".
 */
export function knightTypeFromName(name) {
	return String(name ?? "").trim().replace(/^the\s+/i, "").replace(/\s+knight$/i, "").trim();
}

/**
 * Knights other characters already are, so the chooser can steer each player
 * to a different one.
 * @param {{id: string, name: string, knightType: string}[]} knights Knight actors in the world.
 * @param {{roll: string, name: string|null}[]} entries Knights from the art index.
 * @param {string|null} [exceptId] The Knight being chosen for.
 * @returns {Map<string, string>} Roll to the name of the character who took it.
 */
export function takenKnights(knights, entries, exceptId = null) {
	const rollsByType = new Map(entries
		.filter((entry) => entry.name)
		.map((entry) => [knightTypeFromName(entry.name).toLowerCase(), entry.roll]));

	const taken = new Map();
	for (const knight of knights) {
		if (knight.id === exceptId) continue;
		const roll = rollsByType.get(String(knight.knightType ?? "").trim().toLowerCase());
		if (roll && !taken.has(roll)) taken.set(roll, knight.name);
	}
	return taken;
}

/**
 * The actor update for the choices made. Virtues and GD are only set once
 * rolled, and each sets both its current and maximum value. The Knight's
 * portrait becomes the actor's picture, shown in the sheet's shield, but only
 * when one was imported.
 * @param {object} choice
 * @param {object} choice.start              From STARTS.
 * @param {Record<string, number|null>} [choice.virtues]
 * @param {number|null} [choice.guard]
 * @param {object|null} [choice.knight]      A Knight from the art index.
 * @param {object|null} [choice.seer]        Their Seer from the art index.
 * @returns {object}
 */
export function knightUpdate({ start, virtues = {}, guard = null, knight = null, seer = null }) {
	const update = { "system.age": start.age, "system.glory": start.glory };
	for (const key of VIRTUES) {
		const value = virtues[key];
		if (!Number.isInteger(value)) continue;
		update[`system.virtues.${key}.value`] = value;
		update[`system.virtues.${key}.max`] = value;
	}
	if (Number.isInteger(guard)) {
		update["system.guard.value"] = guard;
		update["system.guard.max"] = guard;
	}
	if (knight) {
		update["system.knightType"] = knightTypeFromName(knight.name);
		update["system.seer"] = seer?.name ?? "";
		if (knight.path) update.img = knight.path;
	}
	return update;
}

/**
 * Items a Knight starts with: one Gear item for each line of their Property,
 * their Ability and Passion, and the standard kit.
 * @param {object|null} knight   A Knight from the art index.
 * @param {Record<string, string>} kitNames Names for STANDARD_KIT, by key.
 * @returns {object[]} Item data for `createEmbeddedDocuments`.
 */
export function knightItems(knight, kitNames) {
	const items = (knight?.property ?? []).map((name) => ({ type: "gear", name }));
	for (const type of ["ability", "passion"]) {
		const part = knight?.[type];
		if (part) items.push({ type, name: part.name, system: { description: `<p>${escapeHTML(part.text)}</p>` } });
	}
	for (const { key, type, system } of STANDARD_KIT) {
		items.push(system ? { type, name: kitNames[key], system: { ...system } } : { type, name: kitNames[key] });
	}
	return items;
}
