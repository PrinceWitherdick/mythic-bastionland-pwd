/**
 * The numbers a hex is shown by. A hex is stored counting from 1 at the map's
 * top-left, but once a map has grown to the north or west its Referee may
 * have kept every hex's old number (realm-growth.js), so what's printed can
 * differ from what's stored. Every printing of a hex's column and row goes
 * through here, and nowhere else uses their two strings, so nothing prints a
 * stored number by mistake (tests/rules/hex-numbers.test.js). Pure.
 */
import { REALM_GROWTH_FLAG, shownHex } from "./realm-growth.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * @param {{flags?: object}|null|undefined} scene A Realm Scene, or its data.
 * @returns {unknown} How its hexes are numbered: its growth flag, or nothing for a map that never grew.
 */
export const hexNumbering = (scene) => scene?.flags?.[SYSTEM_ID]?.[REALM_GROWTH_FLAG] ?? null;

/**
 * @param {{col: number, row: number}} hex As stored.
 * @param {unknown} numbering From hexNumbering.
 * @param {(key: string, data?: object) => string} t
 * @returns {string} e.g. "Column 5, Row 7".
 */
export const hexNumberWords = (hex, numbering, t) => t("realm.hex", shownHex(hex, numbering));

/**
 * @param {{col: number, row: number}} hex As stored.
 * @param {unknown} numbering From hexNumbering.
 * @param {(key: string, data?: object) => string} t
 * @returns {string} e.g. "(5, 7)", as the hover readout writes it.
 */
export const hexPointWords = (hex, numbering, t) => t("realm.readout.coordinates", shownHex(hex, numbering));
