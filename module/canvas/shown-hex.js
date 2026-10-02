import { sceneGeometry } from "../actions/realm.js";
import { INK_HEX } from "../rules/colour.js";
import { watchBoard } from "./board.js";
import { traceHex } from "./trace-hex.js";

/**
 * The hex last shown on the map with "Show on the map", ringed in green for
 * this user alone until they click the map, another hex is shown, or the
 * Scene goes away. A hex can also be ringed for as long as the pointer rests
 * on a row that stands for it.
 */

/** Green, for the hex being shown. */
const GREEN_HEX = 0x3fae4f;

/** @type {{ring: PIXI.Graphics, tearDown: number, unwatch: () => void}|null} */
let shown = null;

/** @type {{ring: PIXI.Graphics|null, element: Element}|null} */
let hovered = null;

/** Take the green ring off the map. */
export function clearShownHex() {
	const was = shown;
	if (!was) return;
	shown = null;
	was.unwatch();
	Hooks.off("canvasTearDown", was.tearDown);
	if (!was.ring.destroyed) was.ring.destroy();
}

/**
 * Draw a green ring round a hex's borders.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {PIXI.Graphics|null} Nothing when the Scene isn't the one on the canvas.
 */
function drawRing(scene, hex) {
	if (!canvas?.ready || canvas.scene?.id !== scene.id) return null;
	const g = sceneGeometry(scene);
	const ring = (canvas.controls ?? canvas.stage).addChild(new PIXI.Graphics());
	ring.eventMode = "none";
	// A dark edge under the green keeps it plain on a pale map and a dark one alike.
	for (const { width, color, alpha } of [
		{ width: g.size / 7, color: INK_HEX, alpha: 0.55 },
		{ width: g.size / 11, color: GREEN_HEX, alpha: 1 }
	]) {
		ring.lineStyle({ width, color, alpha, join: PIXI.LINE_JOIN.ROUND });
		traceHex(ring, g, hex);
	}
	return ring;
}

/**
 * Ring a hex's borders in green on the map this user is looking at.
 * @param {Scene} scene The Scene on the canvas.
 * @param {{col: number, row: number}} hex
 */
export function ringShownHex(scene, hex) {
	clearShownHex();
	const ring = drawRing(scene, hex);
	if (!ring) return;
	// A click on the map clears it; a right drag that pans the map keeps it.
	shown = { ring, tearDown: Hooks.on("canvasTearDown", clearShownHex), unwatch: watchBoard({ onPress: clearShownHex, onRightClick: clearShownHex }) };
}

/**
 * The pointer has moved onto something new: once it's off the hovered row,
 * or that row has been drawn again or closed, the hover ring goes.
 * @param {PointerEvent} event
 */
function onPointerOver(event) {
	if (hovered && !(hovered.element.isConnected && hovered.element.contains(event.target))) clearHoveredHex();
}

/** Take the hover ring off the map. */
export function clearHoveredHex() {
	const was = hovered;
	if (!was) return;
	hovered = null;
	window.removeEventListener("pointerover", onPointerOver, true);
	if (was.ring && !was.ring.destroyed) was.ring.destroy();
}

/**
 * Ring a hex in green while the pointer rests on an element that stands for it.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {Element} element The row under the pointer; leaving it takes the ring away.
 */
export function ringHoveredHex(scene, hex, element) {
	if (hovered?.element === element) return;
	clearHoveredHex();
	hovered = { ring: drawRing(scene, hex), element };
	window.addEventListener("pointerover", onPointerOver, true);
}
