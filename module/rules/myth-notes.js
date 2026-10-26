/**
 * What the GM has written about each Myth of a Realm, and whether the group
 * feels it's resolved. A resolved Myth earns each Knight 1 Glory and gives way
 * to another next Season (p27), so a note is kept under the Myth's number together with the roll that
 * made it: a new Myth rolled under the same number starts with nothing written,
 * rather than inheriting the old one's. Pure, so it can be tested without Foundry.
 */
import { isDie, isTableRoll, rollLabel } from "./book-art.js";
import { anyOmenScene, normaliseOmenScenes, omenScenesByNumber } from "./omen-scenes.js";
import { ownMythKey } from "./own-myths.js";
import { MYTH_COUNT } from "./realm.js";

export const MYTH_NOTES_VERSION = 1;

/**
 * @typedef {object} MythNote
 * @property {string} roll  The Myth's roll on the Myths table (p27), such as "2-07".
 * @property {string} note  In the GM's own words.
 * @property {boolean} resolved
 * @property {Record<string, string[]>} [scenes] The Scenes linked to its Omens, keyed by Omen number; left out when none is.
 */

/**
 * @typedef {object} MythNotes
 * @property {number} version
 * @property {Record<string, MythNote>} myths Keyed by the Myth's number, 1-6.
 */

/** @returns {MythNotes} */
export const emptyMythNotes = () => ({ version: MYTH_NOTES_VERSION, myths: {} });

/**
 * @param {{d6: number|null, d12: number|null, own?: string}} myth
 * @returns {string} Its roll, what tells a Myth the Referee wrote from any
 *   other, or "" for a Myth whose dice don't read as a roll.
 */
export const mythRoll = (myth) => ownMythKey(myth) ?? (isTableRoll(myth) ? rollLabel(myth.d6, myth.d12) : "");

/**
 * @param {unknown} raw
 * @returns {MythNote|null} Null for one that says nothing.
 */
function normaliseNote(raw) {
	if (!raw || typeof raw !== "object") return null;
	const roll = typeof raw.roll === "string" ? raw.roll : "";
	const note = typeof raw.note === "string" ? raw.note.trim() : "";
	const resolved = raw.resolved === true;
	const scenes = normaliseOmenScenes(raw.scenes);
	if (anyOmenScene(scenes)) return { roll, note, resolved, scenes: omenScenesByNumber(scenes) };
	return note || resolved ? { roll, note, resolved } : null;
}

/**
 * @param {MythNotes} notes
 * @param {{number: number}} myth
 * @returns {object|null} What's kept under the Myth's number, if it was written about this Myth.
 */
function keptFor(notes, myth) {
	const kept = notes?.myths?.[String(myth.number)];
	return kept && kept.roll === mythRoll(myth) ? kept : null;
}

/**
 * Notes from whatever the Scene flag holds, however old or bad.
 * @param {unknown} raw
 * @returns {MythNotes}
 */
export function normaliseMythNotes(raw) {
	const notes = emptyMythNotes();
	const myths = raw && typeof raw === "object" ? raw.myths : null;
	if (!myths || typeof myths !== "object") return notes;
	for (const [number, value] of Object.entries(myths)) {
		if (!isDie(Number(number), MYTH_COUNT) || String(Number(number)) !== number) continue;
		const note = normaliseNote(value);
		if (note) notes.myths[number] = note;
	}
	return notes;
}

/**
 * What's written about a Myth, or nothing if what's kept under its number was
 * written about a Myth it has since replaced.
 * @param {MythNotes} notes
 * @param {{number: number, d6: number, d12: number}} myth
 * @returns {{note: string, resolved: boolean}}
 */
export function mythNoteFor(notes, myth) {
	const kept = keptFor(notes, myth);
	return kept ? { note: kept.note, resolved: kept.resolved } : { note: "", resolved: false };
}

/**
 * The Scenes linked to a Myth's Omens, or none if they were linked to a Myth it has since replaced.
 * @param {MythNotes} notes
 * @param {{number: number, d6: number, d12: number}} myth
 * @returns {import("./omen-scenes.js").OmenScenes}
 */
export const mythScenesFor = (notes, myth) => normaliseOmenScenes(keptFor(notes, myth)?.scenes);

/**
 * The Realm as the Myths still at work in it see it: a resolved Myth shows no
 * more Omens, and nobody tells of it, until another takes its place next Season (p27).
 * @template {{myths: object[]}} R
 * @param {R} realm
 * @param {MythNotes} notes
 * @returns {R} The same Realm when none is resolved.
 */
export function withoutResolved(realm, notes) {
	const myths = realm.myths.filter((myth) => !mythNoteFor(notes, myth).resolved);
	return myths.length === realm.myths.length ? realm : { ...realm, myths };
}

/**
 * @param {MythNotes} notes
 * @param {{number: number, d6: number, d12: number}} myth
 * @param {{note?: string, resolved?: boolean, scenes?: import("./omen-scenes.js").OmenScenes}} changes
 * @returns {MythNotes} Unchanged when nothing would change. A Myth left with
 *   nothing written, not resolved and no Scene linked is forgotten.
 */
export function withMythNote(notes, myth, changes) {
	const current = mythNoteFor(notes, myth);
	const scenes = changes.scenes ? normaliseOmenScenes(changes.scenes) : mythScenesFor(notes, myth);
	const next = {
		roll: mythRoll(myth),
		note: typeof changes.note === "string" ? changes.note.trim() : current.note,
		resolved: typeof changes.resolved === "boolean" ? changes.resolved : current.resolved,
		...(anyOmenScene(scenes) ? { scenes: omenScenesByNumber(scenes) } : {})
	};
	const key = String(myth.number);
	const kept = notes.myths[key] ?? null;
	const keep = Boolean(next.note || next.resolved || next.scenes);
	const same = kept && kept.roll === next.roll && kept.note === next.note && kept.resolved === next.resolved
		&& JSON.stringify(kept.scenes ?? null) === JSON.stringify(next.scenes ?? null);
	if (keep && same) return notes;
	if (!keep && !kept) return notes;
	const myths = { ...notes.myths };
	if (keep) myths[key] = next;
	else delete myths[key];
	return { version: MYTH_NOTES_VERSION, myths };
}
