import { hexVertices } from "../rules/realm-geometry.js";

/**
 * Trace a hex's borders in the line style already set, closed so the last
 * corner joins as the others do.
 * @param {PIXI.Graphics} graphics
 * @param {object} g The Realm's geometry.
 * @param {{col: number, row: number}} hex
 */
export function traceHex(graphics, g, hex) {
	const [first, ...rest] = hexVertices(g, hex);
	graphics.moveTo(first.x, first.y);
	for (const corner of rest) graphics.lineTo(corner.x, corner.y);
	graphics.closePath();
}
