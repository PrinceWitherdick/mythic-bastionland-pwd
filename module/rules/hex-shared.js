/**
 * What the players hold about each hex of a Realm: what the Referee told them
 * of it, and the Company's own note. Kept apart from the GM's own hex lore, so
 * nothing here is ever a secret, and so rubbing out the GM's working note
 * can't take away what was already said at the table. Pure, so it can be
 * tested without Foundry.
 */
import { normaliseWhen } from "./hex-lore.js";
import { hexKey, hexRecords } from "./realm-geometry.js";
import { trimmedText } from "./text.js";

export const HEX_SHARED_VERSION = 1;

/** The Scene flag holding it. Every client reads it, players included. */
export const HEX_SHARED_FLAG = "hexShared";

/**
 * How many tellings one hex keeps, the oldest dropping off first. The whole
 * Scene rides to every client on each change, so the list has an end.
 */
export const MAX_TOLD = 12;

/** How long one telling, and the Company's note, may run. */
export const MAX_TOLD_NOTE = 4000;

/** A hex has six edges, so it meets six Barriers at most. */
const MAX_MET = 6;
export const MAX_PARTY_NOTE = 2000;

/**
 * @typedef {object} Told
 * @property {string} id
 * @property {string} note      What the Referee told the players, as it was then.
 * @property {object|null} when The world's calendar when it was told.
 * @property {number} at        The real time it was told, for ordering two told at one moment.
 * @property {string} messageId The chat card it went out in, if it's still there.
 */

/**
 * @typedef {object} PartyNote
 * @property {string} text
 * @property {string} by       The id of the User who last wrote it.
 * @property {string} byName   Their name then, in case they leave the world.
 * @property {object|null} when
 * @property {number} at
 */

/**
 * @typedef {object} BarrierMet A hidden Barrier the Company ran into from this hex, which revealed it (p18).
 * @property {string} edge      Its edge key.
 * @property {string} byName    Who moved into it.
 * @property {object|null} when The world's calendar then.
 * @property {number} at
 */

/**
 * @typedef {object} SharedRecord
 * @property {Told[]} told    Oldest first.
 * @property {PartyNote} [party]
 * @property {BarrierMet[]} [met] Oldest first, one for each edge.
 */

/**
 * @typedef {object} HexShared
 * @property {number} version
 * @property {Record<string, SharedRecord>} hexes Keyed by `hexKey`.
 */

/** @returns {HexShared} */
export const emptyShared = () => ({ version: HEX_SHARED_VERSION, hexes: {} });

/** @returns {string} Trimmed, and cut to length. */
const capped = (value, max) => trimmedText(value).slice(0, max).trim();

/** @returns {number} */
const timeOf = (value) => (Number.isFinite(value) ? value : 0);

/**
 * @param {unknown} raw
 * @param {number} index Stands in for an id that went missing.
 * @returns {Told|null} Null for a telling that says nothing.
 */
function normaliseTold(raw, index) {
	if (!raw || typeof raw !== "object") return null;
	const note = capped(raw.note, MAX_TOLD_NOTE);
	if (!note) return null;
	return {
		id: trimmedText(raw.id) || String(index),
		note,
		when: normaliseWhen(raw.when),
		at: timeOf(raw.at),
		messageId: trimmedText(raw.messageId)
	};
}

/**
 * @param {unknown} raw
 * @returns {PartyNote|null} Null for a note with nothing written.
 */
export function normalisePartyNote(raw) {
	if (!raw || typeof raw !== "object") return null;
	const text = capped(raw.text, MAX_PARTY_NOTE);
	if (!text) return null;
	return { text, by: trimmedText(raw.by), byName: trimmedText(raw.byName), when: normaliseWhen(raw.when), at: timeOf(raw.at) };
}

/**
 * @param {unknown} raw
 * @returns {BarrierMet|null}
 */
function normaliseMet(raw) {
	if (!raw || typeof raw !== "object") return null;
	const edge = trimmedText(raw.edge);
	if (!/^\d+,\d+\|\d+,\d+$/.test(edge)) return null;
	return { edge, byName: trimmedText(raw.byName), when: normaliseWhen(raw.when), at: timeOf(raw.at) };
}

/**
 * @param {unknown} raw
 * @returns {SharedRecord|null} Null for a hex with nothing told, no note and no Barrier met.
 */
export function normaliseSharedRecord(raw) {
	if (!raw || typeof raw !== "object") return null;
	const told = (Array.isArray(raw.told) ? raw.told : []).map(normaliseTold).filter(Boolean).slice(-MAX_TOLD);
	const party = normalisePartyNote(raw.party);
	const met = (Array.isArray(raw.met) ? raw.met : []).map(normaliseMet).filter(Boolean).slice(-MAX_MET);
	return worthKeeping({ told, ...(party ? { party } : {}), ...(met.length ? { met } : {}) });
}

/** @returns {SharedRecord|null} A record worth keeping, or null once it holds nothing. */
const worthKeeping = (record) => (record.told.length || record.party || record.met?.length ? record : null);

/**
 * A store from whatever the Scene flag holds, however old or bad.
 * @param {unknown} raw
 * @returns {HexShared}
 */
export function normaliseShared(raw) {
	return { ...emptyShared(), hexes: hexRecords(raw, normaliseSharedRecord) };
}

/**
 * @param {HexShared|null|undefined} shared
 * @param {{col: number, row: number}} hex
 * @returns {SharedRecord|null}
 */
export const sharedAt = (shared, hex) => shared?.hexes?.[hexKey(hex)] ?? null;

/**
 * @param {HexShared} shared
 * @param {{col: number, row: number}} hex
 * @param {SharedRecord|null} record
 * @returns {HexShared}
 */
function withRecord(shared, hex, record) {
	const key = hexKey(hex);
	const hexes = { ...shared.hexes };
	if (record) hexes[key] = record;
	else delete hexes[key];
	return { version: HEX_SHARED_VERSION, hexes };
}

/** @returns {SharedRecord} */
const recordAt = (shared, hex) => sharedAt(shared, hex) ?? { told: [] };

/**
 * Keep what the Referee told the players of a hex. Telling the same words
 * again doesn't say anything new, so it only moves the last telling's date on.
 * @param {HexShared} shared
 * @param {{col: number, row: number}} hex
 * @param {Partial<Told>} told
 * @returns {HexShared} Unchanged when nothing was said.
 */
export function recordTold(shared, hex, told) {
	const here = recordAt(shared, hex);
	const added = normaliseTold(told, here.told.length);
	if (!added) return shared;
	const last = here.told.at(-1);
	const list = last?.note === added.note
		? [...here.told.slice(0, -1), { ...last, when: added.when, at: added.at, messageId: added.messageId || last.messageId }]
		: [...here.told, added].slice(-MAX_TOLD);
	return withRecord(shared, hex, { ...here, told: list });
}

/**
 * How what the players were last told of a hex stands beside the GM's note
 * now: told just as it reads ("current"), told but changed since ("stale"),
 * written but never told ("unsaid"), told and the note since rubbed out
 * ("kept"), or neither ("none").
 * @param {string} note The GM's note as it reads.
 * @param {string|null|undefined} latest What the players were last told.
 * @returns {"current"|"stale"|"unsaid"|"kept"|"none"}
 */
export function toldState(note, latest) {
	const now = capped(note, MAX_TOLD_NOTE);
	if (!latest) return now ? "unsaid" : "none";
	if (!now) return "kept";
	return now === latest ? "current" : "stale";
}

/**
 * Keep a Barrier the Company ran into from a hex. Meeting it again only moves
 * the date on.
 * @param {HexShared} shared
 * @param {{col: number, row: number}} hex
 * @param {Partial<BarrierMet>} met
 * @returns {HexShared} Unchanged when the edge isn't one.
 */
export function recordBarrierMet(shared, hex, met) {
	const added = normaliseMet(met);
	if (!added) return shared;
	const here = recordAt(shared, hex);
	const list = [...(here.met ?? []).filter((entry) => entry.edge !== added.edge), added].slice(-MAX_MET);
	return withRecord(shared, hex, { ...here, met: list });
}

/**
 * Write the Company's note on a hex. Rubbing it all out takes the note away.
 * @param {HexShared} shared
 * @param {{col: number, row: number}} hex
 * @param {Partial<PartyNote>} note
 * @returns {HexShared} Unchanged when the words are the same as before.
 */
export function setPartyNote(shared, hex, note) {
	const here = recordAt(shared, hex);
	const party = normalisePartyNote(note);
	if ((party?.text ?? "") === (here.party?.text ?? "")) return shared;
	const { party: _old, ...rest } = here;
	return withRecord(shared, hex, worthKeeping(party ? { ...rest, party } : rest));
}

/**
 * @param {HexShared} shared
 * @param {{col: number, row: number}} hex
 * @returns {HexShared} Unchanged when the hex had no note.
 */
export const forgetPartyNote = (shared, hex) => (sharedAt(shared, hex)?.party ? setPartyNote(shared, hex, null) : shared);

/**
 * Forget one telling of a hex, as though it was never said.
 * @param {HexShared} shared
 * @param {{col: number, row: number}} hex
 * @param {string} id The telling's.
 * @returns {HexShared} Unchanged when the hex has no such telling.
 */
export function forgetTold(shared, hex, id) {
	const here = sharedAt(shared, hex);
	if (!here?.told.some((told) => told.id === id)) return shared;
	return withRecord(shared, hex, worthKeeping({ ...here, told: here.told.filter((told) => told.id !== id) }));
}

/**
 * Forget the Company ran into a Barrier from a hex. The Barrier stays on the map.
 * @param {HexShared} shared
 * @param {{col: number, row: number}} hex
 * @param {string} edge The Barrier's edge key.
 * @returns {HexShared} Unchanged when no Barrier was met there.
 */
export function forgetBarrierMet(shared, hex, edge) {
	const here = sharedAt(shared, hex);
	if (!here?.met?.some((met) => met.edge === edge)) return shared;
	const { met, ...rest } = here;
	const kept = met.filter((one) => one.edge !== edge);
	return withRecord(shared, hex, worthKeeping(kept.length ? { ...rest, met: kept } : rest));
}

/**
 * Forget what the players hold of a hex: what was told of it, the Barriers met
 * from it and the Company's note on it. All of it, or the parts named.
 * @param {HexShared} shared
 * @param {{col: number, row: number}} hex
 * @param {{told?: boolean, met?: boolean, party?: boolean}} [parts] Which go; all three when not given.
 * @returns {HexShared} Unchanged when there was nothing.
 */
export function forgetShared(shared, hex, { told = true, met = true, party = true } = {}) {
	const here = sharedAt(shared, hex);
	if (!here || !((told && here.told.length) || (met && here.met?.length) || (party && here.party))) return shared;
	const { met: wasMet, party: wasParty, ...rest } = here;
	return withRecord(shared, hex, worthKeeping({
		...rest,
		told: told ? [] : here.told,
		...(!met && wasMet ? { met: wasMet } : {}),
		...(!party && wasParty ? { party: wasParty } : {})
	}));
}
