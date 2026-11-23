import { FOG_VERSION, fogLook, foggedKeys, liftFog, normaliseFog, toggleFogAt, veilFog } from "../rules/realm-fog.js";
import { allHexes, hexKey } from "../rules/realm-geometry.js";
import { wallNow } from "../server-now.js";
import { SYSTEM_ID } from "../system-id.js";
import { hexFlagEditor } from "./hex-flags.js";
import { getJourney } from "./journey.js";
import { isRealmScene, sceneGeometry } from "./realm.js";
import { secretsKeptOn } from "./solo.js";

/**
 * Each Realm's Fog of War (rules/realm-fog.js), kept on its Scene: whether
 * it's on, whether Holdings show through it, and the hexes lifted, or fogged
 * again, by hand or by what the Company learned. The Company's visits clear
 * the fog by themselves, so a move writes nothing here.
 */

/** The Scene flag. Not `fog`, which is a field of Foundry's own on every Scene. */
export const REALM_FOG_FLAG = "realmFog";

/**
 * @param {Scene|null|undefined} scene
 * @returns {{on: boolean, holdings: boolean, hexes: Record<string, object>}} Off, with no hexes, for a Scene that isn't a Realm.
 */
export const getRealmFog = (scene) => normaliseFog(isRealmScene(scene) ? scene.getFlag?.(SYSTEM_ID, REALM_FOG_FLAG) : null);

/**
 * @param {Scene|null|undefined} scene
 * @returns {{on: boolean, holdings: boolean}} Whether the Realm's fog is on, and its Holdings show through,
 *   as getRealmFog reads them, without reading every hex's record.
 */
export function realmFogOptions(scene) {
	const raw = isRealmScene(scene) ? scene.getFlag?.(SYSTEM_ID, REALM_FOG_FLAG) : null;
	return { on: raw?.on === true, holdings: raw?.holdings === true };
}

/**
 * @param {Scene|null|undefined} scene
 * @returns {boolean} Whether the Realm's Fog of War is on. Read off the flag alone, as every Token's
 *   visibility asks it, without reading every hex's record.
 */
export const realmFogOn = (scene) => isRealmScene(scene) && scene.getFlag?.(SYSTEM_ID, REALM_FOG_FLAG)?.on === true;

/**
 * @param {Scene|null|undefined} scene
 * @returns {boolean} Whether the Realm's Holdings and Seats show through its fog. Read off the flag alone,
 *   as each Holding's Tile asks it on every refresh.
 */
export const realmFogHoldingsShow = (scene) => realmFogOn(scene) && scene.getFlag(SYSTEM_ID, REALM_FOG_FLAG).holdings === true;

const editor = hexFlagEditor({ flag: REALM_FOG_FLAG, version: FOG_VERSION, read: getRealmFog });

/**
 * Change the hexes' records, in one write. GMs only. Nothing is written
 * while the Realm's fog is off, so no hex is lifted ahead of its turning on.
 * @param {Scene} scene
 * @param {(fog: object) => object} edit
 * @returns {Promise<boolean>}
 */
const editRealmFog = (scene, edit) => editor(scene, (fog) => (fog.on ? edit(fog) : fog));

/**
 * Turn a Realm's fog on or off, and whether its Holdings show through. GMs
 * only. The hexes' records stay as they were, so turning it off and on again
 * keeps what was lifted.
 * @param {Scene} scene
 * @param {{on?: boolean, holdings?: boolean}} options Whichever is to change.
 * @returns {Promise<boolean>} Whether anything was written.
 */
export async function setRealmFogOptions(scene, { on, holdings } = {}) {
	if (!game.user.isGM || !isRealmScene(scene)) return false;
	const before = realmFogOptions(scene);
	const path = (key) => `flags.${SYSTEM_ID}.${REALM_FOG_FLAG}.${key}`;
	const update = {};
	if (typeof on === "boolean" && on !== before.on) update[path("on")] = on;
	if (typeof holdings === "boolean" && holdings !== before.holdings) update[path("holdings")] = holdings;
	if (!Object.keys(update).length) return false;
	update[path("version")] = FOG_VERSION;
	await scene.update(update);
	return true;
}

/** @param {{col: number, row: number}[]} hexes */
const keysOf = (hexes) => hexes.filter(Boolean).map(hexKey);

/**
 * Lift the fog from some hexes of a Realm, each group for its own reason, in one write. GMs only.
 * @param {Scene} scene
 * @param {{hexes: {col: number, row: number}[], by: string}[]} groups Each `by` one of rules/realm-fog.js's lifters.
 * @returns {Promise<boolean>} Whether anything was written.
 */
export function liftRealmFogBy(scene, groups) {
	const at = wallNow();
	return editRealmFog(scene, (fog) => {
		const journey = getJourney(scene).hexes;
		return groups.reduce((lifted, { hexes, by }) => liftFog(lifted, keysOf(hexes), by, at, journey), fog);
	});
}

/**
 * Lift the fog from some hexes of a Realm. GMs only.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes
 * @param {string} by One of rules/realm-fog.js's lifters.
 * @returns {Promise<boolean>} Whether anything was written.
 */
export const liftRealmFog = (scene, hexes, by) => liftRealmFogBy(scene, [{ hexes, by }]);

/**
 * Bring the fog back over some hexes of a Realm, even where the Company has been. GMs only.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes
 * @returns {Promise<boolean>}
 */
export const veilRealmFog = (scene, hexes) => editRealmFog(scene, (fog) => veilFog(fog, keysOf(hexes), getJourney(scene).hexes));

/**
 * One hex's fog the other way. GMs only.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {Promise<boolean>}
 */
export const toggleRealmFogAt = (scene, hex) =>
	editRealmFog(scene, (fog) => toggleFogAt(fog, hexKey(hex), wallNow(), getJourney(scene).hexes));

/** @param {Scene} scene */
const everyHex = (scene) => (isRealmScene(scene) ? allHexes(sceneGeometry(scene)) : []);

/** Lift the fog from every hex of a Realm. GMs only. */
export const liftAllRealmFog = (scene) => liftRealmFog(scene, everyHex(scene), "hand");

/** Bring the fog back over every hex of a Realm, the Company's own among them till it next arrives. GMs only. */
export const veilAllRealmFog = (scene) => veilRealmFog(scene, everyHex(scene));

/** The hexes in the fog on each Realm, as the players see it, by Scene id: read on every move of the pointer. */
const fogged = new Map();

/** Nothing in the fog. Not to be changed. */
const NONE = Object.freeze(new Set());

/**
 * Forget a Realm's fog as last read, after its Scene changed.
 * @param {string} [sceneId] Every Realm's, if not given.
 */
export function forgetRealmFog(sceneId) {
	if (sceneId) fogged.delete(sceneId);
	else fogged.clear();
}

/**
 * @param {Scene|null|undefined} scene
 * @returns {Set<string>} The keys of the hexes the fog lies over for the players. Not to be changed.
 */
export function foggedForPlayers(scene) {
	if (!realmFogOn(scene)) return NONE;
	let keys = fogged.get(scene.id);
	if (!keys) fogged.set(scene.id, keys = foggedKeys(sceneGeometry(scene), getRealmFog(scene), getJourney(scene).hexes));
	return keys;
}

/**
 * @param {Scene|null|undefined} scene
 * @returns {"none"|"veil"|"full"} How the fog is drawn on this client: a veil for a Referee not playing alone.
 *   One drawing their own Realm alone sees it as any Referee does, as they see its secrets.
 */
export const realmFogLook = (scene) => fogLook({ on: realmFogOn(scene), gm: Boolean(game.user?.isGM), solo: secretsKeptOn(scene ?? null) });

/**
 * @param {Scene|null|undefined} scene
 * @returns {Set<string>} The keys of the hexes this client can't see into; none for a Referee who sees through the fog.
 */
export const foggedForMe = (scene) => (realmFogLook(scene) === "full" ? foggedForPlayers(scene) : NONE);

/**
 * @param {Scene|null|undefined} scene
 * @returns {Set<string>} The keys of the hexes whose Holdings and Seats this client can't see for the fog:
 *   none where the Realm's Holdings show through it. Not to be changed.
 */
export const holdingsFoggedForMe = (scene) => (realmFogHoldingsShow(scene) ? NONE : foggedForMe(scene));

/**
 * @param {Scene|null|undefined} scene
 * @param {{col: number, row: number}|null} hex
 * @returns {boolean} Whether this client can't see into the hex for the fog.
 */
export const hexFoggedForMe = (scene, hex) => Boolean(hex) && foggedForMe(scene).has(hexKey(hex));

/**
 * @param {Scene|null|undefined} scene
 * @param {{col: number, row: number}|null} hex
 * @returns {boolean} Whether the players can't see into the hex for the fog.
 */
export const hexFoggedForPlayers = (scene, hex) => Boolean(hex) && foggedForPlayers(scene).has(hexKey(hex));
