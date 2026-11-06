/**
 * Taking back a time advance pressed by mistake: Next Phase, Weeks Pass,
 * Months Pass, A Year Passes or a journey to a distant Realm. While one runs,
 * every write it makes is noted with what the written place held before it
 * (actions/time-undo.js); an Undo then puts back each value that still stands
 * as the advance left it, and keeps any changed since. Pure: no Foundry
 * documents here, only compat.js reading how a write's keys were asked.
 */
import { changedKey } from "../compat.js";

/** How many advances are kept to be taken back, newest last. */
export const UNDO_KEEP = 5;

/**
 * @typedef {object} FieldNote One place a document was written, as it stood before the advance and after it.
 * @property {boolean} had   Whether it held anything before.
 * @property {*} before      What it held, when it did.
 * @property {boolean} [has] Whether it holds anything after.
 * @property {*} [after]     What it holds after, when it does.
 * @property {number} [at]   When it was noted, by the server's clock, so two clients' notes can be put in order.
 */

/**
 * @typedef {object} AdvanceRecord
 * @property {string} id
 * @property {string} kind "phase", "weeks", "season", "age" or "distant", below `bastionland.timeUndo.kinds`.
 * @property {number} at   When it was made, in milliseconds.
 * @property {object} before The calendar before the advance.
 * @property {object} after  The calendar it left.
 * @property {{uuid: string, name: string, fields: Record<string, FieldNote>}[]} docs Documents it wrote.
 * @property {{uuid: string, documentName: string, name: string, data?: object}[]} created Documents it made that the
 *   Undo deletes, each but a card with its data as the advance left it, so one changed since is kept.
 * @property {{parentUuid: string|null, documentName: string, data: object, name: string}[]} deleted Documents it deleted, oldest first.
 * @property {{key: string, had: boolean, before: string|null, has: boolean, after: string|null, at?: number}[]} settings World settings, as stored JSON.
 * @property {{before: string|null, after: string|null, beforeName: string, afterName: string}} [scenes] The active
 *   Scene's UUID before and after, when the advance changed it.
 */

/**
 * @param {unknown} value
 * @returns {boolean} Whether it's a plain object, which a write merges into rather than replaces.
 */
export const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
	&& [Object.prototype, null].includes(Object.getPrototypeOf(value));

/**
 * @param {object} source
 * @param {string} path Dotted.
 * @returns {{has: boolean, value: *}} What the path holds in it.
 */
export function readPath(source, path) {
	let here = source;
	for (const part of path.split(".")) {
		if (here === null || typeof here !== "object" || !Object.hasOwn(here, part)) return { has: false, value: undefined };
		here = here[part];
	}
	return { has: true, value: here };
}

/**
 * Whether two values hold the same, however their keys are ordered.
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
export function sameValue(a, b) {
	if (a === b) return true;
	if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return Number.isNaN(a) && Number.isNaN(b);
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) return false;
	return keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}

/**
 * A deep copy of plain data, for a note that mustn't change as the document does.
 * @param {*} value
 * @returns {*}
 */
export const copyData = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * Every place a write changes, each as deep as the document already holds an
 * object there: a key new to the document is one place, whatever it holds, so
 * taking it back deletes it whole rather than leaving its shell.
 * @param {object} changes The write, as an update hook is handed it, nested or dotted.
 * @param {object} source  The document's data before the write.
 * @returns {string[]} Dotted paths.
 */
export function changedPaths(changes, source) {
	const paths = new Set();
	const walk = (write, prefix) => {
		for (const [key, value] of Object.entries(write ?? {})) {
			if (!prefix.length && key === "_id") continue;
			// Whether it deletes or replaces what's there whole: v13's `-=` and `==`, or v14's operators.
			const parts = key.split(".");
			const { name, whole } = changedKey(parts.at(-1), value);
			const path = [...prefix, ...parts.slice(0, -1), name];
			// A dotted key may run through places the document holds no object at.
			let at = path.length;
			for (let depth = prefix.length + 1; depth < path.length; depth++) {
				if (!isPlainObject(readPath(source, path.slice(0, depth).join(".")).value)) {
					at = depth;
					break;
				}
			}
			if (at < path.length) {
				paths.add(path.slice(0, at).join("."));
				continue;
			}
			const held = readPath(source, path.join(".")).value;
			if (!whole && isPlainObject(value) && isPlainObject(held)) walk(value, path);
			else paths.add(path.join("."));
		}
	};
	walk(changes, []);
	return [...paths];
}

/**
 * @param {string} path
 * @param {string} other
 * @returns {boolean} Whether `path` lies inside `other`.
 */
const within = (path, other) => path.startsWith(`${other}.`);

/**
 * Note what a document held at each place a write changes, the first time
 * each is written during the advance. A place inside one noted already is
 * covered by it; one around places noted already takes their notes into its own.
 * @param {Record<string, FieldNote>} fields The document's notes so far, changed in place.
 * @param {string[]} paths From changedPaths.
 * @param {object} source The document's data before the write.
 * @param {(path: string) => boolean} [leftOut] Places never put back, such as the Ledger.
 * @param {number} [at] When, to put the notes of two clients in order (joinParts).
 * @returns {Record<string, FieldNote>}
 */
export function noteFields(fields, paths, source, leftOut = () => false, at = undefined) {
	for (const path of paths) {
		if (leftOut(path)) continue;
		const { has, value } = readPath(source, path);
		addNote(fields, path, { had: has, before: has ? copyData(value) : null, ...(at === undefined ? {} : { at }) });
	}
	return fields;
}

/**
 * Add one note, unless its place is noted already or lies inside one that is.
 * Notes inside it are folded into it, as they were before the advance.
 * @param {Record<string, FieldNote>} fields Changed in place.
 * @param {string} path
 * @param {FieldNote} note Changed in place.
 * @returns {boolean} Whether it was added.
 */
function addNote(fields, path, note) {
	if (Object.hasOwn(fields, path) || Object.keys(fields).some((noted) => within(path, noted))) return false;
	for (const inner of Object.keys(fields).filter((noted) => within(noted, path))) {
		// What the advance itself wrote there earlier is undone inside the larger note.
		if (note.had && isPlainObject(note.before)) restoreInside(note.before, inner.slice(path.length + 1), fields[inner]);
		if (fields[inner].at !== undefined) note.at = Math.min(note.at ?? Infinity, fields[inner].at);
		delete fields[inner];
	}
	fields[path] = note;
	return true;
}

/**
 * Put an inner place's earlier value back inside an object noted around it.
 * @param {object} target
 * @param {string} path Below the target.
 * @param {FieldNote} note
 */
function restoreInside(target, path, note) {
	const parts = path.split(".");
	let here = target;
	for (const part of parts.slice(0, -1)) {
		if (!isPlainObject(here[part])) here[part] = {};
		here = here[part];
	}
	const last = parts.at(-1);
	if (note.had) here[last] = copyData(note.before);
	else delete here[last];
}

/**
 * Whether a place still holds what the advance left there.
 * @param {{has: boolean, value: *}} now
 * @param {{has?: boolean, after?: *}} note
 * @returns {boolean}
 */
export const asLeft = (now, note) => now.has === Boolean(note.has) && (!now.has || sameValue(now.value, note.after));

/**
 * Whether a place already holds what it held before the advance.
 * @param {{has: boolean, value: *}} now
 * @param {{had: boolean, before: *}} note
 * @returns {boolean}
 */
export const asFound = (now, note) => now.has === note.had && (!now.has || sameValue(now.value, note.before));

/**
 * Finish a document's notes with what each place holds now the advance is
 * over, dropping any it left as it found them.
 * @param {Record<string, FieldNote>} fields
 * @param {object} source The document's data now.
 * @returns {Record<string, FieldNote>} Only the places the advance changed.
 */
export function finishFields(fields, source) {
	const done = {};
	for (const [path, note] of Object.entries(fields)) {
		const now = readPath(source, path);
		if (asFound(now, note)) continue;
		done[path] = { ...note, has: now.has, after: now.has ? copyData(now.value) : null };
	}
	return done;
}

/**
 * @typedef {object} UndoPlan
 * @property {{uuid: string, name: string, set: [string, *][], unset: string[]}[]} writes Places put back, by document.
 * @property {{uuid: string, name: string, paths: string[]}[]} kept Places changed since the advance, left as they are,
 *   and things it made that were changed since, with no paths.
 * @property {string[]} deletes Documents the advance made, still here as it left them.
 * @property {AdvanceRecord["deleted"]} recreates Documents the advance deleted, not since made again, newest first,
 *   so a parent is made again before anything deleted from it before it went.
 * @property {{uuid: string|null, from: string|null, name: string}|null} activate The Scene to make active again, or
 *   none (uuid null) to stop `from` being active.
 * @property {{key: string, had: boolean, before: string|null}[]} settings Settings put back, the calendar last.
 * @property {string[]} keptSettings Settings changed since, left as they are.
 */

/**
 * @param {string} place
 * @param {string} path
 * @returns {boolean} Whether a place is the path or lies inside it.
 */
const atOrWithin = (place, path) => place === path || within(place, path);

/**
 * A copy of a value with some places inside it taken out.
 * @param {*} value What `path` holds.
 * @param {string} path
 * @param {string[]} places Inside `path`.
 * @returns {*}
 */
function without(value, path, places) {
	if (!places.length || !isPlainObject(value)) return value;
	const copy = copyData(value);
	for (const place of places) {
		const parts = (path ? place.slice(path.length + 1) : place).split(".");
		const holder = parts.length > 1 ? readPath(copy, parts.slice(0, -1).join(".")).value : copy;
		if (isPlainObject(holder)) delete holder[parts.at(-1)];
	}
	return copy;
}

/**
 * What a place goes back to when some places inside it are kept as they stand
 * now, such as the Ledger's lines: what it held, with those as they are.
 * @param {FieldNote} note
 * @param {string} path
 * @param {string[]} places Inside `path`.
 * @param {object} source The document's data now.
 * @returns {{has: boolean, value: *}}
 */
function graft(note, path, places, source) {
	const held = places.map((place) => ({ place, now: readPath(source, place) }));
	const keeps = held.some(({ now }) => now.has);
	if (!isPlainObject(note.before) && !keeps) return { has: note.had, value: note.before };
	const value = isPlainObject(note.before) ? without(note.before, path, places) : {};
	for (const { place, now } of held) {
		if (!now.has) continue;
		const parts = place.slice(path.length + 1).split(".");
		let here = value;
		for (const part of parts.slice(0, -1)) here = isPlainObject(here[part]) ? here[part] : (here[part] = {});
		here[parts.at(-1)] = copyData(now.value);
	}
	return { has: true, value };
}

/**
 * What taking an advance back writes, read against the world as it stands now.
 * @param {AdvanceRecord} record
 * @param {object} world
 * @param {(uuid: string) => object|null} world.sourceOf A document's data now, or null once it's gone.
 * @param {(key: string) => string|null|undefined} world.settingOf A world setting's stored JSON now, undefined with none stored.
 * @param {string} [world.lastKey] The setting put back after every other: the calendar.
 * @param {(uuid: string, source: object) => string[]} [world.keptPlaces] Places in a document kept as they stand
 *   whatever the advance did, such as the Ledger, or a Realm's finds played alone.
 * @param {() => string|null} [world.activeScene] The active Scene's UUID now.
 * @returns {UndoPlan}
 */
export function undoPlan(record, { sourceOf, settingOf, lastKey, keptPlaces = () => [], activeScene = () => null }) {
	const plan = { writes: [], kept: [], deletes: [], recreates: [], activate: null, settings: [], keptSettings: [] };
	for (const { uuid, name, fields } of record.docs ?? []) {
		const source = sourceOf(uuid);
		if (!source) continue;
		const places = keptPlaces(uuid, source);
		const write = { uuid, name, set: [], unset: [] };
		const kept = [];
		for (const [path, note] of Object.entries(fields)) {
			if (places.some((place) => atOrWithin(path, place))) continue;
			const inside = places.filter((place) => within(place, path));
			const read = readPath(source, path);
			const now = { has: read.has, value: without(read.value, path, inside) };
			const bare = (value) => without(value, path, inside);
			if (asFound(now, { had: note.had, before: bare(note.before) })) continue;
			if (!asLeft(now, { has: note.has, after: bare(note.after) })) {
				kept.push(path);
				continue;
			}
			const back = inside.length ? graft(note, path, inside, source) : { has: note.had, value: note.before };
			if (back.has) write.set.push([path, copyData(back.value)]);
			else write.unset.push(path);
		}
		if (write.set.length || write.unset.length) plan.writes.push(write);
		if (kept.length) plan.kept.push({ uuid, name, paths: kept });
	}
	for (const { uuid, documentName, name, data } of record.created ?? []) {
		const source = sourceOf(uuid);
		if (!source) continue;
		// Cards always go. Anything else changed since the advance made it, such as a Token moved, is kept.
		const places = keptPlaces(uuid, source);
		if (documentName === "ChatMessage" || !data || sameValue(without(source, "", places), without(data, "", places))) plan.deletes.push(uuid);
		else plan.kept.push({ uuid, name, paths: [] });
	}
	plan.recreates = (record.deleted ?? []).filter(({ data, parentUuid, documentName }) => !sourceOf(childUuid(parentUuid, documentName, data))).reverse();
	const scenes = record.scenes;
	if (scenes && scenes.before !== scenes.after) {
		if (activeScene() === scenes.after) plan.activate = { uuid: scenes.before, from: scenes.after, name: scenes.before ? scenes.beforeName : scenes.afterName };
		else if (scenes.after) plan.kept.push({ uuid: scenes.after, name: scenes.afterName, paths: ["active"] });
	}
	for (const note of record.settings ?? []) {
		const value = settingOf(note.key);
		const now = { has: value !== undefined, value };
		if (asFound(now, note)) continue;
		if (asLeft(now, note)) plan.settings.push({ key: note.key, had: note.had, before: note.before });
		else plan.keptSettings.push(note.key);
	}
	plan.settings.sort((a, b) => Number(a.key === lastKey) - Number(b.key === lastKey));
	return plan;
}

/**
 * Where a deleted document would stand again, made with the id it had.
 * @param {string|null} parentUuid
 * @param {string} documentName
 * @param {{_id?: string}} data
 * @returns {string}
 */
export function childUuid(parentUuid, documentName, data) {
	const own = `${documentName}.${data?._id ?? ""}`;
	return parentUuid ? `${parentUuid}.${own}` : own;
}

/**
 * @param {UndoPlan} plan
 * @returns {boolean} Whether taking the advance back would change anything but the calendar.
 */
export const planChanges = (plan) => Boolean(plan.writes.length || plan.deletes.length || plan.recreates.length || plan.activate || plan.settings.length);

/**
 * Put one more advance on the list, the oldest falling off past UNDO_KEEP.
 * @param {AdvanceRecord[]} records
 * @param {AdvanceRecord} record
 * @returns {AdvanceRecord[]}
 */
export const keepRecord = (records, record) => [...(records ?? []), record].slice(-UNDO_KEEP);

/**
 * The advance an Undo takes back now: the newest, while time still stands where it left it.
 * @param {AdvanceRecord[]} records
 * @param {object} calendar Now.
 * @param {(a: object, b: object) => boolean} same Whether two calendars are one moment.
 * @returns {AdvanceRecord|null}
 */
export function undoable(records, calendar, same) {
	const newest = records?.at(-1);
	return newest && same(newest.after, calendar) ? newest : null;
}

/**
 * Join what two clients noted of one advance: the Referee who pressed it, and
 * the active GM whose client answers the calendar. A place both wrote keeps
 * whichever note was made first, and the record's end, as it was read last.
 * A place inside another noted is folded into it, as on one client.
 * @param {AdvanceRecord} record
 * @param {Partial<AdvanceRecord>|null} part
 * @returns {AdvanceRecord}
 */
export function joinParts(record, part) {
	if (!part) return record;
	// A note with no time is taken as the earliest, and on a tie the record's comes first.
	const when = (note) => note.at ?? -Infinity;
	const byWhen = (a, b) => (when(a) === when(b) ? 0 : when(a) - when(b));
	const docs = new Map(record.docs.map((doc) => [doc.uuid, doc]));
	for (const doc of part.docs ?? []) {
		const mine = docs.get(doc.uuid);
		if (!mine) {
			docs.set(doc.uuid, doc);
			continue;
		}
		const notes = [
			...Object.entries(mine.fields).map(([path, note]) => ({ path, note, mine: true })),
			...Object.entries(doc.fields).map(([path, note]) => ({ path, note, mine: false }))
		].sort((a, b) => byWhen(a.note, b.note));
		const fields = {};
		for (const { path, note } of notes) addNote(fields, path, copyData(note));
		// The record's end is the latest read of a place both noted.
		for (const [path, note] of Object.entries(mine.fields)) {
			if (fields[path]) Object.assign(fields[path], { has: note.has, after: copyData(note.after) });
		}
		docs.set(doc.uuid, { ...mine, fields });
	}
	const settings = new Map(record.settings.map((note) => [note.key, note]));
	for (const note of part.settings ?? []) {
		const mine = settings.get(note.key);
		if (!mine) settings.set(note.key, note);
		else if (when(note) < when(mine)) settings.set(note.key, { ...note, has: mine.has, after: mine.after });
	}
	const created = new Map([...record.created, ...(part.created ?? [])].map((entry) => [entry.uuid, entry]));
	return {
		...record,
		docs: [...docs.values()],
		created: [...created.values()],
		deleted: [...record.deleted, ...(part.deleted ?? [])].sort(byWhen),
		settings: [...settings.values()]
	};
}
