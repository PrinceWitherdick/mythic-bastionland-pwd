import { t } from "../chat/cards.js";
import {
	HEX_NAMES_FLAG,
	HEX_NAMES_VERSION,
	cleanHexName,
	headingWords,
	hexLabelText,
	normaliseHexNames,
	setHexName
} from "../rules/hex-names.js";
import { hexKey } from "../rules/realm-geometry.js";
import { SYSTEM_ID } from "../system-id.js";
import { hexFlagEditor } from "./hex-flags.js";
import { isRealmScene } from "./realm.js";

/**
 * The names the GM gives hexes, read wherever a hex is called by name: the
 * Places window, the Lay of the Land, the readout under the map, chat cards
 * and the hex's Journal entry.
 */

/**
 * @param {Scene|null} scene
 * @returns {import("../rules/hex-names.js").HexNames} An empty store for a Scene that isn't a Realm.
 */
export const getHexNames = (scene) => normaliseHexNames(isRealmScene(scene) ? scene.getFlag(SYSTEM_ID, HEX_NAMES_FLAG) : null);

/**
 * One hex's name, read without the whole store, since the readout asks at every hex crossed.
 * @param {Scene|null} scene
 * @param {{col: number, row: number}|null} hex
 * @returns {string} Nothing where it has none.
 */
export const hexName = (scene, hex) => (hex && isRealmScene(scene) ? cleanHexName(scene.flags?.[SYSTEM_ID]?.[HEX_NAMES_FLAG]?.hexes?.[hexKey(hex)]?.name) : "");

/** @type {(scene: Scene, edit: (names: object) => object) => Promise<boolean>} */
const editHexNames = hexFlagEditor({ flag: HEX_NAMES_FLAG, version: HEX_NAMES_VERSION, read: getHexNames });

/**
 * Name a hex, or take its name away with a blank one. GMs only.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {string} name
 * @returns {Promise<boolean>} Whether anything was written.
 */
export const renameHex = (scene, hex, name) => editHexNames(scene, (names) => setHexName(names, hex, name));

/**
 * How a card or a notice calls a hex.
 * @param {{col: number, row: number}} hex
 * @param {Scene|null} scene The Realm it's in.
 * @returns {string} e.g. "The Weeping Fen (Column 5, Row 7)", or "Column 5, Row 7" while it has no name.
 */
export const hexLabel = (hex, scene) => hexLabelText(hex, hexName(scene, hex), t);

/**
 * How a window's heading calls a hex: by its name over its column and row.
 * Only a GM names a hex, by clicking it.
 * @param {Scene|null} scene
 * @param {{col: number, row: number}} hex
 * @returns {{title: string, coords: string, rename: {value: string}|null}}
 */
export function hexHeading(scene, hex) {
	const name = hexName(scene, hex);
	return { ...headingWords(name, t("realm.hex", hex)), rename: game.user?.isGM ? { value: name } : null };
}
