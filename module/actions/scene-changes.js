import { changedKey } from "../compat.js";
import { COMPANY_LAST_HEX_FLAG } from "./company.js";
import { HEX_LORE_FLAG } from "./hex-lore.js";
import { JOURNEY_FLAG } from "./journey.js";
import { MYTH_NOTES_FLAG } from "./myth-notes.js";
import { HEX_NAMES_FLAG } from "../rules/hex-names.js";
import { HEX_SHARED_FLAG } from "../rules/hex-shared.js";
import { TRACKED_HEXES_FLAG } from "../rules/hex-tracked.js";
import { SIGHTED_FLAG } from "../rules/sighted.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * Telling what a Scene update changed of a Realm: the Realm itself, which is
 * read from the Realm's own flag and its Tiles and Drawings, or only what is
 * kept for its hexes beside it, such as the Company's visits or a hex's notes.
 * Most writes to a Realm Scene are the second kind, and need nothing read again.
 */

/**
 * @typedef {object} HexStoreFlag
 * @property {boolean} journal Whether the hexes' Journal entries show it.
 * @property {string[]} toolkit The Toolkit's parts that show it, or "realm" for every part a Realm shows in.
 */

/** @type {Map<string, HexStoreFlag>|null} Made on first use, as some of these modules read this one back. */
let hexFlags = null;

/**
 * The system's Scene flags that keep something for each hex, or where the
 * Company stood, rather than the Realm, and where each shows. A new one goes
 * here alone. A hex's name is shown wherever the hex is; where the Company
 * stood when its Token went, nowhere.
 * @returns {Map<string, HexStoreFlag>}
 */
export const hexStoreFlags = () => hexFlags ??= new Map([
	[HEX_LORE_FLAG, { journal: true, toolkit: ["places"] }],
	[JOURNEY_FLAG, { journal: true, toolkit: ["places"] }],
	[HEX_SHARED_FLAG, { journal: true, toolkit: ["places"] }],
	[HEX_NAMES_FLAG, { journal: true, toolkit: ["realm"] }],
	[SIGHTED_FLAG, { journal: true, toolkit: [] }],
	[TRACKED_HEXES_FLAG, { journal: false, toolkit: ["places"] }],
	[MYTH_NOTES_FLAG, { journal: false, toolkit: ["myths", "time"] }],
	[COMPANY_LAST_HEX_FLAG, { journal: false, toolkit: [] }]
]);

/** Scene fields no Realm, nor anything drawn of one, reads: the lighting, the thumbnail, Foundry's own bookkeeping. */
const QUIET_FIELDS = new Set(["_id", "_stats", "thumb", "environment", "fog", "weather", "playlist", "playlistSound", "journal", "journalEntryPage", "navOrder", "sort", "folder"]);

/**
 * Each update's reading, as every hook that hears it asks for it, and they
 * are all handed the same changes.
 * @type {WeakMap<object, {realm: boolean, system: boolean, hexFlags: Set<string>}>}
 */
const readings = new WeakMap();

/**
 * @param {object} changes From `updateScene`.
 * @returns {{realm: boolean, system: boolean, hexFlags: Set<string>}} `realm`: whether the Realm, or anything
 *   not known to leave it be, changed. `system`: whether any of the system's flags were written, or deleted
 *   whole. `hexFlags`: the per-hex flags written, by name. Not to be changed, as it's kept for the next to ask.
 */
export function realmSceneChanges(changes) {
	if (!changes || typeof changes !== "object") return readSceneChanges(changes);
	let reading = readings.get(changes);
	if (!reading) readings.set(changes, reading = readSceneChanges(changes));
	return reading;
}

/**
 * @param {object} changes
 * @returns {{realm: boolean, system: boolean, hexFlags: Set<string>}}
 */
function readSceneChanges(changes) {
	const written = new Set();
	let realm = false;
	let system = false;
	for (const [key, value] of Object.entries(changes ?? {})) {
		const field = changedKey(key, value);
		if (field.name !== "flags") {
			if (!QUIET_FIELDS.has(field.name)) realm = true;
			continue;
		}
		// Every flag of every scope deleted or replaced at once.
		if (field.whole) {
			realm = system = true;
			continue;
		}
		for (const [scopeKey, flags] of Object.entries(value ?? {})) {
			const scope = changedKey(scopeKey, flags);
			if (scope.name !== SYSTEM_ID) continue;
			system = true;
			// The system's flags deleted or replaced whole, as a Scene stops being a Realm.
			if (scope.whole || !flags || typeof flags !== "object") {
				realm = true;
				continue;
			}
			for (const [flagKey, flagValue] of Object.entries(flags)) {
				const flag = changedKey(flagKey, flagValue).name;
				if (hexStoreFlags().has(flag)) written.add(flag);
				else realm = true;
			}
		}
	}
	return { realm, system, hexFlags: written };
}

/** Keys of a per-hex flag beside its `hexes`. */
const BESIDE_HEXES = new Set(["version", "next"]);

/** A hex's key, column and row, as hexKey writes it. */
const HEX_KEY = /^-?\d+,-?\d+$/;

/**
 * The hexes a write of one per-hex flag changed, from its `hexes` record.
 * @param {object} changes From `updateScene`.
 * @param {string} flag
 * @returns {string[]|null} Their keys, or null when the flag was written whole or some other way, so any hex may have changed.
 */
export function changedHexKeys(changes, flag) {
	const flags = changes?.flags?.[SYSTEM_ID];
	if (!flags || typeof flags !== "object" || changedKey(SYSTEM_ID, flags).whole) return null;
	let written;
	for (const [key, value] of Object.entries(flags)) {
		const own = changedKey(key, value);
		if (own.name !== flag) continue;
		// Deleted or replaced whole: the hexes it held before are gone too, and those aren't named.
		if (own.whole) return null;
		written = value;
	}
	if (written === undefined) return [];
	if (!written || typeof written !== "object") return null;
	const keys = [];
	for (const [key, value] of Object.entries(written)) {
		// Kept beside the hexes, and changing none of them: the record's version, the Journey's next number.
		if (BESIDE_HEXES.has(key)) continue;
		const { name, whole } = changedKey(key, value);
		// A flag kept by hex with no record around them, as the marks of what was seen from afar are.
		if (HEX_KEY.test(name)) keys.push(name);
		else if (key === "hexes" && !whole && value && typeof value === "object") {
			keys.push(...Object.entries(value).map(([hex, record]) => changedKey(hex, record).name));
		}
		else return null;
	}
	return keys;
}
