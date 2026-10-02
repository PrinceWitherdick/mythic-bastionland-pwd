import { t, warn } from "../chat/cards.js";
import { deletionEntry, queryAsker, replacementEntry } from "../compat.js";
import {
	HEX_SHARED_FLAG,
	HEX_SHARED_VERSION,
	forgetPartyNote,
	forgetShared,
	forgetTold,
	normaliseShared,
	normaliseSharedRecord,
	recordTold,
	setPartyNote
} from "../rules/hex-shared.js";
import { serialWrites } from "../rules/queue.js";
import { hexKey, inRealm } from "../rules/realm-geometry.js";
import { sightedMarks } from "../rules/sighted.js";
import { openableHex } from "../rules/travels.js";
import { SYSTEM_ID } from "../system-id.js";
import { calendarLabel, getCalendar } from "./calendar.js";
import { getJourney } from "./journey.js";
import { getRealm, hexHiddenByHand, isRealmScene, sceneGeometry } from "./realm.js";
import { getSighted } from "./sighted.js";

/**
 * What the players hold about each hex: what the Referee told them, and the
 * Company's own note. It rides in a Scene flag every client reads, which is
 * the point — nothing goes in here that the players weren't meant to have.
 */

/** Called on every client, with the Scene's id, when anything the players' record shows may have changed. */
export const TRAVELS_CHANGED_HOOK = `${SYSTEM_ID}.travelsChanged`;

/** A player's note on a hex, written for them by the active GM. */
const PARTY_NOTE_QUERY = `${SYSTEM_ID}.writePartyNote`;

/**
 * @param {Scene|null} scene
 * @returns {import("../rules/hex-shared.js").HexShared} An empty store for a Scene that isn't a Realm.
 */
export function getHexShared(scene) {
	return normaliseShared(isRealmScene(scene) ? scene.getFlag(SYSTEM_ID, HEX_SHARED_FLAG) : null);
}

/**
 * @param {Scene|null} scene
 * @param {{col: number, row: number}} hex
 * @returns {import("../rules/hex-shared.js").SharedRecord|null}
 */
export function getHexSharedRecord(scene, hex) {
	if (!isRealmScene(scene)) return null;
	return normaliseSharedRecord(scene.getFlag(SYSTEM_ID, HEX_SHARED_FLAG)?.hexes?.[hexKey(hex)]);
}

/** Shared writes, taken one at a time. */
const queueSharedWrite = serialWrites();

/** @returns {string} An update path into the flag. */
const flagPath = (...parts) => `flags.${SYSTEM_ID}.${HEX_SHARED_FLAG}.${parts.join(".")}`;

/**
 * Change what's held for one hex, writing that hex's own path whole, so a note
 * rubbed out really goes and a change to another hex isn't written over. GMs only.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {(shared: object) => object} edit
 * @returns {Promise<boolean>} Whether anything was written.
 */
export function editHexShared(scene, hex, edit) {
	if (!game.user.isGM || !isRealmScene(scene)) return Promise.resolve(false);
	return queueSharedWrite(async () => {
		const shared = getHexShared(scene);
		const next = edit(shared);
		if (next === shared) return false;
		const key = hexKey(hex);
		const record = next.hexes[key] ?? null;
		const [path, value] = record ? replacementEntry(flagPath("hexes", key), record) : deletionEntry(flagPath("hexes", key));
		await scene.update({ [flagPath("version")]: HEX_SHARED_VERSION, [path]: value });
		return true;
	});
}

/**
 * Keep what was just told to the players of a hex, as it was told.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {{note: string, messageId?: string}} told
 * @returns {Promise<boolean>}
 */
export const recordToldHex = (scene, hex, { note, messageId = "" }) => editHexShared(scene, hex, (shared) => recordTold(shared, hex, {
	id: foundry.utils.randomID(),
	note,
	when: getCalendar(),
	at: Date.now(),
	messageId
}));

/** Strike one telling out of a hex. @returns {Promise<boolean>} */
export const forgetHexTold = (scene, hex, id) => editHexShared(scene, hex, (shared) => forgetTold(shared, hex, id));

/** Rub out the Company's note on a hex. @returns {Promise<boolean>} */
export const forgetHexPartyNote = (scene, hex) => editHexShared(scene, hex, (shared) => forgetPartyNote(shared, hex));

/** Forget all the players were told of a hex, and their note on it. @returns {Promise<boolean>} */
export const forgetHexShared = (scene, hex) => editHexShared(scene, hex, (shared) => forgetShared(shared, hex));

/**
 * Whether the players may open a hex of a Scene's Realm.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {boolean}
 */
export function hexOpenable(scene, hex) {
	const entry = getRealm(scene);
	if (!entry) return false;
	const marks = sightedMarks(entry.realm, getSighted(scene), (at) => hexHiddenByHand(scene, at));
	return openableHex({ journey: getJourney(scene), shared: getHexShared(scene), marks }, hex);
}

/**
 * Write the Company's note on a hex, as a User.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {string} text
 * @param {User} user Who wrote it.
 * @returns {Promise<boolean>}
 */
const keepPartyNote = (scene, hex, text, user) => editHexShared(scene, hex, (shared) => setPartyNote(shared, hex, {
	text,
	by: user.id,
	byName: user.name,
	when: getCalendar(),
	at: Date.now()
}));

/**
 * Write the Company's note on a hex. A GM writes it at once; a player asks the
 * active GM, since only a GM may change a Scene.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {string} text
 * @returns {Promise<boolean>} Whether it was written, or already said that.
 */
export async function writePartyNote(scene, hex, text) {
	if (!isRealmScene(scene)) return false;
	if (game.user.isGM) {
		await keepPartyNote(scene, hex, text, game.user);
		return true;
	}
	const gm = game.users.activeGM;
	if (!gm) {
		warn("travels.party.needsGM");
		return false;
	}
	try {
		const saved = await gm.query(PARTY_NOTE_QUERY, { sceneId: scene.id, hex: { col: hex.col, row: hex.row }, text: String(text ?? "") }, { timeout: 10000 });
		if (saved) return true;
	} catch (error) {
		console.warn(`${SYSTEM_ID} | Couldn't write the Company's note`, error);
	}
	warn("travels.party.refused");
	return false;
}

/**
 * A player's note, written by the GM who was asked. Nothing the player sends
 * is believed but the words: the hex must be one the players may open, and
 * the note is signed with who the query came from.
 * @param {{sceneId?: string, hex?: {col: number, row: number}, text?: string}} data
 * @param {object} context
 * @returns {Promise<boolean>}
 */
export async function onPartyNoteQuery(data = {}, context = {}) {
	const asker = queryAsker(context);
	if (!asker || !game.user.isGM) return false;
	const scene = game.scenes.get(data.sceneId);
	if (!scene || !isRealmScene(scene) || typeof data.text !== "string") return false;
	const hex = { col: data.hex?.col, row: data.hex?.row };
	if (!Number.isInteger(hex.col) || !Number.isInteger(hex.row) || !inRealm(sceneGeometry(scene), hex)) return false;
	if (!hexOpenable(scene, hex)) return false;
	await keepPartyNote(scene, hex, data.text, asker);
	return true;
}

/** Answer players' notes. Called during init. */
export function registerHexSharedQuery() {
	CONFIG.queries[PARTY_NOTE_QUERY] = onPartyNoteQuery;
}

/**
 * @param {{text: string, byName: string, when: object|null}|null} party
 * @returns {string} Who last wrote the Company's note, and when.
 */
export function partyNoteBy(party) {
	if (!party) return "";
	const name = party.byName || t("travels.party.someone");
	return party.when ? t("travels.party.byWhen", { name, when: calendarLabel(party.when) }) : t("travels.party.by", { name });
}

/**
 * @param {{text: string, byName: string, when: object|null}|null|undefined} party
 * @returns {{text: string, by: string}|null} The Company's note as a window shows it.
 */
export const partyNoteView = (party) => (party ? { text: party.text, by: partyNoteBy(party) } : null);

/**
 * @param {import("../rules/hex-shared.js").SharedRecord|null} record
 * @returns {string} How often the players were told of a hex, and when last, for the GM.
 */
export function toldLabel(record) {
	const told = record?.told ?? [];
	if (!told.length) return "";
	const last = told.at(-1);
	const when = last.when ? calendarLabel(last.when) : t("travels.visits.unknown");
	return t(told.length === 1 ? "hexLore.toldOnce" : "hexLore.toldMany", { count: told.length, when });
}
