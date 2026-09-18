/**
 * What the GM has written about each Myth of a Realm, and whether the group
 * feels it's resolved. "When the group feels that a Myth is resolved the
 * Knights each gain 1 Glory and a new Myth replaces it in the next Season"
 * (p27), so a note is kept under the Myth's number together with the roll that
 * made it: a new Myth rolled under the same number starts with nothing written,
 * rather than inheriting the old one's. Pure, so it can be tested without Foundry.
 */
import { isDie, isTableRoll, rollLabel } from "./book-art.js";
import { MYTH_COUNT } from "./realm.js";

export const MYTH_NOTES_VERSION = 1;

/**
 * @typedef {object} MythNote
 * @property {string} roll  The Myth's roll on the Myths table (p27), such as "2-07".
 * @property {string} note  In the GM's own words.
 * @property {boolean} resolved
 */

/**
 * @typedef {object} MythNotes
 * @property {number} version
 * @property {Record<string, MythNote>} myths Keyed by the Myth's number, 1-6.
 */

/** @returns {MythNotes} */
export const emptyMythNotes = () => ({ version: MYTH_NOTES_VERSION, myths: {} });

/**
 * @param {{d6: number, d12: number}} myth
 * @returns {string} Its roll, or "" for a Myth whose dice don't read as a roll.
 */
export const mythRoll = (myth) => (isTableRoll(myth) ? rollLabel(myth.d6, myth.d12) : "");

/**
 * @param {unknown} raw
 * @returns {MythNote|null} Null for one that says nothing.
 */
function normaliseNote(raw) {
	if (!raw || typeof raw !== "object") return null;
	const roll = typeof raw.roll === "string" ? raw.roll : "";
	const note = typeof raw.note === "string" ? raw.note.trim() : "";
	const resolved = raw.resolved === true;
	return note || resolved ? { roll, note, resolved } : null;
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
	const kept = notes?.myths?.[String(myth.number)];
	if (!kept || kept.roll !== mythRoll(myth)) return { note: "", resolved: false };
	return { note: kept.note, resolved: kept.resolved };
}

/**
 * @param {MythNotes} notes
 * @param {{number: number, d6: number, d12: number}} myth
 * @param {{note?: string, resolved?: boolean}} changes
 * @returns {MythNotes} Unchanged when nothing would change. A Myth left with
 *   nothing written and not resolved is forgotten.
 */
export function withMythNote(notes, myth, changes) {
	const current = mythNoteFor(notes, myth);
	const next = {
		roll: mythRoll(myth),
		note: typeof changes.note === "string" ? changes.note.trim() : current.note,
		resolved: typeof changes.resolved === "boolean" ? changes.resolved : current.resolved
	};
	const key = String(myth.number);
	const kept = notes.myths[key] ?? null;
	const keep = next.note || next.resolved;
	if (keep && kept && kept.roll === next.roll && kept.note === next.note && kept.resolved === next.resolved) return notes;
	if (!keep && !kept) return notes;
	const myths = { ...notes.myths };
	if (keep) myths[key] = next;
	else delete myths[key];
	return { version: MYTH_NOTES_VERSION, myths };
}
