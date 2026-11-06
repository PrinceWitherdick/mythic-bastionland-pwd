/**
 * What a Knight's table result does to their Property, where it says: the
 * Cosmic Knight's crossbow coming out as "Lightwood (d8 hefty)", or the War
 * Knight's polearm getting "+d10 vs mounted targets". Read with the same
 * reader as the Property line itself. Pure, so it can be tested without Foundry.
 */
import { PROPERTY_TYPES } from "../config.js";
import { THROWN_NAME } from "./arms-and-goods.js";
import { ALTERNATE_QUALITIES, SPECIALIST_DICE } from "./attack.js";
import { withoutSeeBelow } from "./knight-tables.js";
import { effectFields, effectOf } from "./possession-effects.js";
import { lossOf, propertyItems, SPECIALIST_NOTE } from "./property.js";
import { RANGED_NAME } from "./stat-blocks.js";

/** A weapon's stats a result sets, every one written so a reroll leaves none behind. */
const WEAPON_KEYS = Object.freeze(["damage", "hefty", "long", "slow", "blast", "ignoresArmour", "heftyMounted"]);
/** "d8 trample": a steed's. */
const TRAMPLE = /^(\d*d\d+)\s+trample$/i;
/** Dice or Armour with nothing named before them, "d8 hefty" or "A1". */
const BARE = /^(?:\d*d\d+|A\d+)\b/i;
/** A specialist die in an aside after a name, as "Trained to fight (+d6 vs wolves)". */
const SPECIALIST_ASIDE = /\(\s*(\+\s*\d*d\d+\s+[^()]+?)\s*\)\s*$/i;
/** "Can be thrown (d6)": another way to fight with what the table is about. */
const THROWN_ENTRY = /^can be thrown\s*\(\s*(\d*d\d+)\s*\)$/i;
/** A companion's Guard, as "Marsh heron (5GD)". */
const GUARD_ENTRY = /\(\s*(\d+)\s*GD\s*\)\s*$/i;
/** Armour that counts only sometimes, as "Only protects at sea". */
const ONLY_PROTECTS = /^only protects\s+(.+)$/i;

/**
 * @typedef {object} EntryStats
 * @property {"weapon"|"armour"|"specialist"|"trample"|"alternate"|"guard"|"armourCondition"|"effect"|"loss"} kind
 * @property {Record<string, unknown>} system Item updates under `system.`, by path; for
 *   a companion's Guard, actor updates under `system.`.
 * @property {string} [name] What the entry names, where it names a piece of its own, such as "Spiked gloves".
 * @property {string} [armourKind] For named armour, the type of piece it names.
 * @property {string} [words] The entry as printed, to match a companion's attack it speaks of, as "talons".
 */

/**
 * The stats a table entry gives, if it gives any.
 * @param {string|null} entry As the table prints it.
 * @returns {EntryStats|null}
 */
export function entryStats(entry) {
	const text = String(entry ?? "").trim();
	if (!text) return null;
	const special = SPECIALIST_NOTE.exec(text) ?? SPECIALIST_NOTE.exec(SPECIALIST_ASIDE.exec(text)?.[1] ?? "");
	if (special && SPECIALIST_DICE.includes(special[1].toLowerCase())) {
		return { kind: "specialist", system: { "specialist.die": special[1].toLowerCase(), "specialist.situation": special[2].trim() } };
	}
	const trample = TRAMPLE.exec(text);
	if (trample) return { kind: "trample", system: { damage: trample[1].toLowerCase() } };
	const thrown = THROWN_ENTRY.exec(text);
	if (thrown) return { kind: "alternate", system: { "alternate.label": "thrown", "alternate.damage": thrown[1].toLowerCase(), "alternate.ranged": true } };
	const guard = GUARD_ENTRY.exec(text);
	if (guard) return { kind: "guard", system: { "guard.value": Number(guard[1]), "guard.max": Number(guard[1]) } };
	// "Only shields you by night": Armour that counts only then.
	const only = ONLY_PROTECTS.exec(text);
	if (only) return { kind: "armourCondition", system: { condition: "only", situation: only[1].trim() } };
	// What it does when used, or costs whoever strikes first, from its row (p68, p74, p164).
	const effect = effectOf(text);
	if (effect.effect) return { kind: "effect", system: effectFields(effect) };
	// A Virtue its bearer loses, as a side effect or for striking first (p68, p74).
	const { loss } = lossOf(text);
	if (loss) return { kind: "loss", system: { "loss.dice": loss.dice, "loss.virtue": loss.virtue, "loss.when": loss.when } };
	const bare = BARE.test(text);
	// "Plain coat and gloves (A1)": the typed piece is what the entry gives.
	const item = propertyItems([bare ? `Piece (${text})` : text]).items.find((piece) => piece.type !== "gear");
	const named = bare || !item ? {} : { name: item.name };
	// "Fierce (d8 trample)": a steed's.
	if (item?.type === "weapon" && item.system.trample) return { kind: "trample", system: { damage: item.system.damage } };
	if (item?.type === "weapon") {
		const system = Object.fromEntries(WEAPON_KEYS.map((key) => [key, item.system[key] ?? false]));
		// Ranged only where the entry says so: a crossbow is ranged whatever form it takes.
		if (item.system.ranged) system.ranged = true;
		if (item.system.specialist?.die) Object.assign(system, { "specialist.die": item.system.specialist.die, "specialist.situation": item.system.specialist.situation });
		return { kind: "weapon", system, ...named, words: text };
	}
	if (item?.type === "armour") {
		const system = { armour: item.system.armour, condition: item.system.condition ?? "", situation: item.system.situation ?? "" };
		return { kind: "armour", system, ...named, ...(bare ? {} : { armourKind: item.system.kind }) };
	}
	return null;
}

/**
 * The stats a result gives the possession it lands on, where that possession
 * takes them its own way: a shield takes a weapon's dice as another way to
 * fight with it, as one with a bladed rim might.
 * @param {EntryStats} stats
 * @param {{type: string}} item
 * @returns {EntryStats}
 */
export function statsForItem(stats, item) {
	if (item?.type !== "armour" || stats?.kind !== "weapon") return stats;
	const system = {
		"alternate.label": String(stats.name ?? "").toLowerCase(),
		"alternate.damage": stats.system.damage,
		...Object.fromEntries(ALTERNATE_QUALITIES.map((key) => [`alternate.${key}`, Boolean(stats.system[key])]))
	};
	return { kind: "alternate", system };
}

/**
 * Whether a named result is a piece of its own rather than what its possession
 * becomes: a helm rolled for a suit of plate is worn beside it.
 * @param {EntryStats|null} stats
 * @param {{type: string, system?: {kind?: string}}} item The possession the table is about.
 * @returns {boolean}
 */
export const addsPiece = (stats, item) => stats?.kind === "armour" && Boolean(stats.name && stats.armourKind)
	&& item?.type === "armour" && stats.armourKind !== item.system?.kind;

/**
 * Whether a possession is a companion carried as a line, such as a hawk or the
 * Knight's steed, so a result about it belongs on the NPC it was made into.
 * @param {{type: string, name: string}} item
 * @returns {boolean}
 */
export function isCompanionLine(item) {
	if (item?.type !== "gear") return false;
	const { items, companions } = propertyItems([item.name]);
	return !items.length && companions.length === 1;
}

/**
 * Where a result lands on a companion NPC: Armour and Guard on the NPC itself,
 * a trample on its trample, and dice on the attack the result speaks of, or
 * its only attack, or a new attack when it has none.
 * @param {EntryStats|null} stats
 * @param {{items: Iterable<{id: string, type: string, name: string, system: object}>}} npc
 * @param {object} [options]
 * @param {string} [options.trampleName] Names a trample the NPC didn't have.
 * @returns {{actor?: Record<string, unknown>, item?: {id: string, system: Record<string, unknown>}, create?: object}|null}
 *   Updates by path under `system.` for the NPC or one of its weapons, or a weapon to give it.
 */
export function companionStats(stats, npc, { trampleName = "Trample" } = {}) {
	if (!stats) return null;
	if (stats.kind === "armour") return { actor: { armour: stats.system.armour } };
	if (stats.kind === "guard") return { actor: { ...stats.system } };
	const weapons = [...(npc?.items ?? [])].filter((item) => item.type === "weapon");
	if (stats.kind === "trample") {
		const trample = weapons.find((item) => item.system.trample);
		if (trample) return { item: { id: trample.id, system: { damage: stats.system.damage } } };
		return { create: { type: "weapon", name: trampleName, system: { damage: stats.system.damage, trample: true, equipped: true } } };
	}
	if (stats.kind !== "weapon" && stats.kind !== "specialist") return null;
	const attacks = weapons.filter((item) => !item.system.trample);
	const said = new Set(wordsOf(stats.words ?? ""));
	const spoken = attacks.find((item) => wordsOf(item.name).some((word) => said.has(word)));
	const attack = spoken ?? (attacks.length === 1 ? attacks[0] : null);
	if (attack) return { item: { id: attack.id, system: { ...stats.system } } };
	if (stats.kind !== "weapon" || !stats.name) return null;
	const system = Object.fromEntries(Object.entries(stats.system).filter(([path]) => !path.includes(".")));
	return { create: { type: "weapon", name: stats.name, system: { ...system, equipped: true } } };
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
 * offered; gear can, by becoming a weapon or armour, and so can a companion
 * carried as a line, whose NPC takes them.
 * @param {{id: string, name: string, type: string, system?: object}[]} items The Knight's.
 * @param {{header: string, tableName: string, tableItemId: string|null, kind: string}} where
 * @returns {string[]} Item ids: one to apply to, several to choose between, or none.
 */
export function tableTargets(items, where) {
	return namedOrBelow(items.filter((item) => (isCompanionLine(item) ? companionTakes(where.kind) : takesStats(item, where.kind))), where);
}

/**
 * The possession a table is about, whatever its result gives: the one the
 * column or the table names, else the one that says "see below".
 * @param {{id: string, name: string, type: string}[]} items The Knight's.
 * @param {{header: string, tableName: string, tableItemId: string|null}} where
 * @returns {string|null}
 */
export const tableSubject = (items, where) => namedOrBelow(items.filter((item) => PROPERTY_TYPES.includes(item.type)), where)[0] ?? null;

/**
 * @param {{id: string, name: string}[]} property The possessions to look among.
 * @param {{header: string, tableName: string, tableItemId: string|null}} where
 * @returns {string[]} Those the column names, else those the table names, else the one that says "see below".
 */
function namedOrBelow(property, { header, tableName, tableItemId }) {
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
 * @param {string} kind From entryStats.
 * @returns {boolean} Whether a companion's NPC can take a kind of stats.
 */
const companionTakes = (kind) => ["armour", "guard", "trample", "weapon", "specialist"].includes(kind);

/**
 * Whether a possession could take a kind of stats: a weapon or armour of its
 * own kind, or gear, by becoming one. A shield takes a weapon's dice, or a
 * way to throw it, as another way to fight with it.
 * @param {{type: string, system?: {kind?: string}}} item
 * @param {string} kind From entryStats.
 * @returns {boolean}
 */
export function takesStats(item, kind) {
	if (!PROPERTY_TYPES.includes(item.type)) return false;
	const shield = item.type === "armour" && item.system?.kind === "shield";
	switch (kind) {
		case "armour": return ["armour", "gear"].includes(item.type);
		case "weapon": return ["weapon", "gear"].includes(item.type) || shield;
		case "specialist": return ["weapon", "gear"].includes(item.type);
		case "alternate": return item.type === "weapon" || shield;
		case "armourCondition": return item.type === "armour";
		// What it does when used, or a Virtue it costs, goes on whatever it's about, as it is.
		case "effect":
		case "loss": return true;
		// A companion's Guard, or a steed's trample, never land on the Knight's own Property.
		default: return false;
	}
}

/**
 * Whether a piece of gear takes a kind of stats by becoming another type.
 * @param {string} type The item's type.
 * @param {string} kind From entryStats.
 * @returns {"weapon"|"armour"|null}
 */
export function retypeFor(type, kind) {
	if (type !== "gear") return null;
	if (kind === "armour") return "armour";
	return kind === "weapon" || kind === "specialist" ? "weapon" : null;
}

/**
 * A weapon made from a piece of gear: ranged when its name says so, as a crossbow is.
 * @param {string} name
 * @returns {object} System data beyond the result's stats.
 */
export const retypedWeapon = (name) => ({ equipped: true, ranged: RANGED_NAME.test(name) || THROWN_NAME.test(name) });

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

/**
 * The column of a Knight's table whose result says what their companion is,
 * as an otter or a hare, by the page the Knight is printed on.
 */
export const NAMING_COLUMNS = Object.freeze({ 30: 1 });

/**
 * @param {{page?: number|null}|null} table A Knight's book table.
 * @returns {number|null} The column that names their companion, if any.
 */
export const namingColumn = (table) => NAMING_COLUMNS[table?.page] ?? null;

/**
 * The column of a Knight's table whose result says what their armour is no
 * use against, as "Axes", by the page the Knight is printed on.
 */
export const EXCEPT_COLUMNS = Object.freeze({ 146: 0 });

/**
 * The stats one column's result gives: its words read as entryStats reads
 * them, or, in a column saying what armour is no use against, that.
 * @param {{page?: number|null}|null} table A Knight's book table.
 * @param {number} column
 * @param {string|null} entry
 * @returns {EntryStats|null}
 */
export function columnStats(table, column, entry) {
	const text = String(entry ?? "").trim();
	if (text && EXCEPT_COLUMNS[table?.page] === column) return { kind: "armourCondition", system: { condition: "except", situation: `against ${text.toLowerCase()}` } };
	return entryStats(text);
}

/**
 * The rolled columns of a Knight's table whose result goes somewhere else
 * now than it went when it was rolled: onto a companion rather than the line
 * naming it, as a thrown way to fight rather than the weapon's own dice, as a
 * piece of its own beside armour, or naming a companion at all. Others are
 * left as they are.
 * @param {{columns: string[], rows: string[][], rolls: number[], page?: number|null}|null} table
 * @param {Record<string, object>} applied What each column did, by the Knight's flag.
 * @returns {number[]}
 */
export function columnsToRedo(table, applied) {
	return (table?.columns ?? []).map((_name, column) => column).filter((column) => {
		const roll = table.rolls?.[column] ?? 0;
		if (!roll) return false;
		const was = applied?.[column] ?? null;
		if (namingColumn(table) === column) return was?.kind !== "name";
		const stats = columnStats(table, column, table.rows[roll - 1]?.[column]);
		if (!stats) return false;
		if (!was) return ["alternate", "guard", "trample", "armourCondition", "effect", "loss"].includes(stats.kind) || Boolean(stats.name && ["weapon", "armour"].includes(stats.kind));
		if (was.kind !== stats.kind) return true;
		if (was.retypedFrom && isCompanionLine(was.retypedFrom)) return true;
		return Boolean(stats.kind === "armour" && stats.name && stats.armourKind && !was.retypedFrom && !was.created && !was.actor);
	});
}
