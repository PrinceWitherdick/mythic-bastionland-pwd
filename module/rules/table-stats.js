/**
 * What a Knight's table result does to their Property, where it says: the
 * Cosmic Knight's crossbow coming out as "Lightwood (d8 hefty)", or the War
 * Knight's polearm getting "+d10 vs mounted targets". Read with the same
 * reader as the Property line itself. Pure, so it can be tested without Foundry.
 */
import { PROPERTY_TYPES } from "../config.js";
import { RANGED_NAME } from "./arms-and-goods.js";
import { SPECIALIST_DICE } from "./attack.js";
import { withoutSeeBelow } from "./knight-tables.js";
import { propertyItems, SPECIALIST_NOTE } from "./property.js";

/** A weapon's stats a result sets, every one written so a reroll leaves none behind. */
const WEAPON_KEYS = Object.freeze(["damage", "hefty", "long", "slow", "blast", "ignoresArmour", "heftyMounted"]);
/** "d8 trample": a steed's. */
const TRAMPLE = /^(\d*d\d+)\s+trample$/i;
/** Dice or Armour with nothing named before them, "d8 hefty" or "A1". */
const BARE = /^(?:\d*d\d+|A\d+)\b/i;

/**
 * @typedef {object} EntryStats
 * @property {"weapon"|"armour"|"specialist"|"trample"} kind
 * @property {Record<string, unknown>} system Item updates under `system.`, by path.
 */

/**
 * The stats a table entry gives, if it gives any.
 * @param {string|null} entry As the table prints it.
 * @returns {EntryStats|null}
 */
export function entryStats(entry) {
	const text = String(entry ?? "").trim();
	if (!text) return null;
	const special = SPECIALIST_NOTE.exec(text);
	if (special && SPECIALIST_DICE.includes(special[1].toLowerCase())) {
		return { kind: "specialist", system: { "specialist.die": special[1].toLowerCase(), "specialist.situation": special[2].trim() } };
	}
	const trample = TRAMPLE.exec(text);
	if (trample) return { kind: "trample", system: { damage: trample[1].toLowerCase() } };
	const [item] = propertyItems([BARE.test(text) ? `Piece (${text})` : text]).items;
	if (item?.type === "weapon") {
		const system = Object.fromEntries(WEAPON_KEYS.map((key) => [key, item.system[key] ?? false]));
		// Ranged only where the entry says so: a crossbow is ranged whatever form it takes.
		if (item.system.ranged) system.ranged = true;
		if (item.system.specialist?.die) Object.assign(system, { "specialist.die": item.system.specialist.die, "specialist.situation": item.system.specialist.situation });
		return { kind: "weapon", system };
	}
	if (item?.type === "armour") {
		return { kind: "armour", system: { armour: item.system.armour, condition: item.system.condition ?? "", situation: item.system.situation ?? "" } };
	}
	return null;
}

/**
 * @param {string} text
 * @returns {string[]} Its words of three letters or more, lower case, with "see below" taken out.
 */
const wordsOf = (text) => withoutSeeBelow(text).toLowerCase().match(/\p{L}{3,}/gu) ?? [];

/**
 * The Property a result's stats belong on: the possession named by the
 * column ("Special Polearm"), else by the table ("Strange Crossbow"), else the
 * one that says "see below". Only a possession that could take the stats is
 * offered; gear can, by becoming a weapon or armour.
 * @param {{id: string, name: string, type: string}[]} items The Knight's.
 * @param {{header: string, tableName: string, tableItemId: string|null, kind: string}} where
 * @returns {string[]} Item ids: one to apply to, several to choose between, or none.
 */
export function tableTargets(items, { header, tableName, tableItemId, kind }) {
	const property = items.filter((item) => takesStats(item, kind));
	for (const text of [header, tableName]) {
		const wanted = wordsOf(text);
		if (!wanted.length) continue;
		const named = property.filter((item) => {
			const has = new Set(wordsOf(item.name));
			return wanted.every((word) => has.has(word));
		});
		if (named.length) return named.map((item) => item.id);
	}
	const below = property.find((item) => item.id === tableItemId);
	return below ? [below.id] : [];
}

/**
 * Whether a possession could take a kind of stats: a weapon or armour of its
 * own kind, or gear, by becoming one.
 * @param {{type: string}} item
 * @param {string} kind From entryStats.
 * @returns {boolean}
 */
export function takesStats(item, kind) {
	const takes = kind === "armour" ? ["armour", "gear"] : ["weapon", "gear"];
	return PROPERTY_TYPES.includes(item.type) && takes.includes(item.type);
}

/**
 * Whether a piece of gear takes a kind of stats by becoming another type.
 * @param {string} type The item's type.
 * @param {string} kind From entryStats.
 * @returns {"weapon"|"armour"|null}
 */
export function retypeFor(type, kind) {
	if (type !== "gear") return null;
	return kind === "armour" ? "armour" : "weapon";
}

/**
 * A weapon made from a piece of gear: ranged when its name says so, as a crossbow is.
 * @param {string} name
 * @returns {object} System data beyond the result's stats.
 */
export const retypedWeapon = (name) => ({ equipped: true, ranged: RANGED_NAME.test(name) });

/**
 * What to put back when a result is rolled again or cleared: each path's value
 * before the first result touched it.
 * @param {Record<string, unknown>} before Kept from an earlier result, if any.
 * @param {Record<string, unknown>} stats The new result's.
 * @param {(path: string) => unknown} current The item's value now, by path under `system.`.
 * @returns {Record<string, unknown>}
 */
export function snapshotBefore(before, stats, current) {
	const kept = { ...(before ?? {}) };
	for (const path of Object.keys(stats)) if (!(path in kept)) kept[path] = current(path) ?? null;
	return kept;
}
