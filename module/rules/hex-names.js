/**
 * The names the Referee gives hexes of a Realm, such as "the Weeping Fen".
 * Kept in a Scene flag of their own that every client reads, apart from what
 * the players were told of a hex: a name alone doesn't put a hex in the
 * players' Places, so a hex named before the Company gets there is still
 * theirs to find. Pure, so it can be tested without Foundry.
 */
import { hexKey, hexRecords } from "./realm-geometry.js";
import { trimmedText } from "./text.js";

export const HEX_NAMES_VERSION = 1;

/** The Scene flag holding them. Every client reads it, players included. */
export const HEX_NAMES_FLAG = "hexNames";

/** How long a hex's name may run. */
export const MAX_HEX_NAME = 80;

/**
 * @typedef {object} HexNames
 * @property {number} version
 * @property {Record<string, {name: string}>} hexes Keyed by `hexKey`.
 */

/** @returns {HexNames} */
export const emptyHexNames = () => ({ version: HEX_NAMES_VERSION, hexes: {} });

/**
 * @param {unknown} value
 * @returns {string} A name on one line, trimmed, and cut to length.
 */
export const cleanHexName = (value) => trimmedText(value).replace(/\s+/g, " ").slice(0, MAX_HEX_NAME).trim();

/**
 * A store from whatever the Scene flag holds, however old or bad.
 * @param {unknown} raw
 * @returns {HexNames}
 */
export function normaliseHexNames(raw) {
	return {
		...emptyHexNames(),
		hexes: hexRecords(raw, (value) => {
			const name = cleanHexName(value?.name);
			return name ? { name } : null;
		})
	};
}

/**
 * @param {HexNames|null|undefined} names
 * @param {{col: number, row: number}} hex
 * @returns {string} The hex's name, or nothing where it has none.
 */
export const hexNameAt = (names, hex) => names?.hexes?.[hexKey(hex)]?.name ?? "";

/**
 * Name a hex. A blank name takes the name away.
 * @param {HexNames} names
 * @param {{col: number, row: number}} hex
 * @param {string} name
 * @returns {HexNames} Unchanged when the name is the one it had.
 */
export function setHexName(names, hex, name) {
	const clean = cleanHexName(name);
	if (clean === hexNameAt(names, hex)) return names;
	const hexes = { ...names.hexes };
	if (clean) hexes[hexKey(hex)] = { name: clean };
	else delete hexes[hexKey(hex)];
	return { version: HEX_NAMES_VERSION, hexes };
}

/**
 * How a hex is called in a line of text: by its name with its column and row
 * after, or by its column and row alone while it has no name.
 * @param {{col: number, row: number}} hex
 * @param {string} name
 * @param {(key: string, data?: object) => string} t The language's words for a key.
 * @returns {string} e.g. "The Weeping Fen (Column 5, Row 7)".
 */
export const hexLabelText = (hex, name, t) => (name ? t("realm.hexNamed", { name, hex: t("realm.hex", hex) }) : t("realm.hex", hex));

/**
 * How a window's heading calls a hex: by its name, with the column and row
 * under it in small print, or by the column and row alone.
 * @param {string} name
 * @param {string} coords Its column and row, in words.
 * @returns {{title: string, coords: string}} `coords` is empty while it has no name.
 */
export const headingWords = (name, coords) => ({ title: name || coords, coords: name ? coords : "" });
