import { TRACKED_HEXES_FLAG, TRACKED_HEXES_VERSION, normaliseTrackedHexes, setTracked } from "../rules/hex-tracked.js";
import { SYSTEM_ID } from "../system-id.js";
import { hexFlagEditor } from "./hex-flags.js";
import { isRealmScene } from "./realm.js";

/**
 * @param {Scene|null} scene
 * @returns {import("../rules/hex-tracked.js").TrackedHexes} An empty store for a Scene that isn't a Realm.
 */
export const getTrackedHexes = (scene) => normaliseTrackedHexes(isRealmScene(scene) ? scene.getFlag(SYSTEM_ID, TRACKED_HEXES_FLAG) : null);

/** @type {(scene: Scene, edit: (tracked: object) => object) => Promise<boolean>} */
const editTrackedHexes = hexFlagEditor({ flag: TRACKED_HEXES_FLAG, version: TRACKED_HEXES_VERSION, read: getTrackedHexes });

/**
 * Put a hex on the GM Toolkit's Custom list of places, or take it off. GMs only.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {boolean} on
 * @returns {Promise<boolean>} Whether anything was written.
 */
export const setHexTracked = (scene, hex, on) => editTrackedHexes(scene, (tracked) => setTracked(tracked, hex, on));
