import { t, warn } from "../chat/cards.js";
import { queryAsker } from "../compat.js";
import {
	HEX_SHARED_FLAG,
	HEX_SHARED_VERSION,
	forgetBarrierMet,
	forgetPartyNote,
	forgetShared,
	forgetTold,
	normaliseShared,
	normaliseSharedRecord,
	recordBarrierMet,
	recordTold,
	setPartyNote
} from "../rules/hex-shared.js";
import { hexKey, inRealm } from "../rules/realm-geometry.js";
import { knownToPlayers } from "../rules/travels.js";
import { SYSTEM_ID } from "../system-id.js";
import { calendarLabel, getCalendar } from "./calendar.js";
import { hexFlagEditor } from "./hex-flags.js";
import { getHexVisits } from "./journey.js";
import { getRealm, isRealmScene, sceneGeometry } from "./realm.js";
import { sightedMarkAt } from "./sighted.js";
import { timelineNoteForgotten, timelinePartyNote } from "./timeline-events.js";

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

/**
 * Change what's held for hexes, in one write. GMs only.
 * @type {(scene: Scene, edit: (shared: object) => object) => Promise<boolean>}
 */
const editHexShared = hexFlagEditor({ flag: HEX_SHARED_FLAG, version: HEX_SHARED_VERSION, read: getHexShared });

/**
 * Keep what was just told to the players of a hex, as it was told.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {{note: string, messageId?: string}} told
 * @returns {Promise<boolean>}
 */
export const recordToldHex = (scene, hex, { note, messageId = "" }) => editHexShared(scene, (shared) => recordTold(shared, hex, {
	id: foundry.utils.randomID(),
	note,
	when: getCalendar(),
	at: Date.now(),
	messageId
}));

/**
 * Keep the hidden Barriers the Company found by running into them (p18), each
 * in the hex it was met from, in one write.
 * @param {Scene} scene
 * @param {{hex: {col: number, row: number}, edges: string[]}[]} met Where they stood, and the Barriers met from there.
 * @param {string} byName Who found them.
 * @returns {Promise<boolean>}
 */
export function recordBarriersMet(scene, met, byName) {
	const when = getCalendar();
	const at = Date.now();
	return editHexShared(scene, (shared) => met.reduce(
		(kept, { hex, edges }) => edges.reduce((next, edge) => recordBarrierMet(next, hex, { edge, byName, when, at }), kept),
		shared
	));
}

/**
 * Rub out the Company's note on a hex, on the Timeline too.
 * @returns {Promise<boolean>}
 */
export async function forgetHexPartyNote(scene, hex) {
	const forgot = await editHexShared(scene, (shared) => forgetPartyNote(shared, hex));
	if (forgot) await timelineNoteForgotten(scene, hex);
	return forgot;
}

/** Forget one telling of a hex. @returns {Promise<boolean>} */
export const forgetHexTold = (scene, hex, id) => editHexShared(scene, (shared) => forgetTold(shared, hex, id));

/** Forget a Barrier was met from a hex; it stays on the map. @returns {Promise<boolean>} */
export const forgetHexBarrierMet = (scene, hex, edge) => editHexShared(scene, (shared) => forgetBarrierMet(shared, hex, edge));

/**
 * Forget all the players hold of a hex, or whichever parts `parts` names. A
 * party note forgotten comes off the Timeline too.
 * @returns {Promise<boolean>}
 */
export async function forgetHexShared(scene, hex, parts) {
	const noted = parts?.party !== false && Boolean(getHexSharedRecord(scene, hex)?.party);
	const forgot = await editHexShared(scene, (shared) => forgetShared(shared, hex, parts));
	if (forgot && noted) await timelineNoteForgotten(scene, hex);
	return forgot;
}

/**
 * Whether the players may open a hex of a Scene's Realm.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {boolean}
 */
export function hexOpenable(scene, hex) {
	const entry = getRealm(scene);
	if (!entry) return false;
	// Read for this hex alone: a card can ask of several.
	return knownToPlayers({ visits: getHexVisits(scene, hex), record: getHexSharedRecord(scene, hex), mark: sightedMarkAt(scene, entry.realm, hex) });
}

/**
 * Write the Company's note on a hex, as a User.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {string} text
 * @param {User} user Who wrote it.
 * @returns {Promise<boolean>}
 */
export async function keepPartyNote(scene, hex, text, user) {
	const kept = await editHexShared(scene, (shared) => setPartyNote(shared, hex, {
		text,
		by: user.id,
		byName: user.name,
		when: getCalendar(),
		at: Date.now()
	}));
	if (kept) await timelinePartyNote(scene, hex, String(text ?? ""), user);
	return kept;
}

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
