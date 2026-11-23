/**
 * The hexes a chat card names, as they're numbered now. A card keeps the hex
 * keys it was posted with; an expansion to the north or west since moves every
 * hex along, and a Realm put back from its backup may take some away. Every
 * card that carries a hex reads it through here.
 */
import { isRealmScene, sceneGeometry } from "../actions/realm.js";
import { hexNumbering } from "../rules/hex-numbers.js";
import { parseHexKey } from "../rules/realm-geometry.js";
import { cardOffset, shiftHex } from "../rules/realm-growth.js";
import { postedAt } from "./posted-at.js";

/**
 * @param {ChatMessage|null|undefined} message The card.
 * @param {Scene|null|undefined} scene The Realm it names hexes of.
 * @returns {{offset: import("../rules/realm-growth.js").Offset, g: object|null,
 *   shift: (hex: {col: number, row: number}|null) => {col: number, row: number}|null,
 *   hex: (key: string|null|undefined) => {col: number, row: number}|null}}
 *   How far its hexes have moved and the Realm's geometry now; `shift` moves a hex the card names,
 *   `hex` reads one of its keys. Either is null for a hex that's gone, or a key naming none.
 */
export function cardHexes(message, scene) {
	const offset = cardOffset(postedAt(message), hexNumbering(scene));
	const g = isRealmScene(scene) ? sceneGeometry(scene) : null;
	const shift = (hex) => shiftHex(hex, offset, g);
	return { offset, g, shift, hex: (key) => shift(parseHexKey(key ?? "")) };
}
