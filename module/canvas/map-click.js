import { sceneGeometry } from "../actions/realm.js";
import { hexAt, sameHex } from "../rules/realm-geometry.js";
import { watchBoard } from "./board.js";

/**
 * The next click on a hex of the Realm, taken by one thing at a time: carrying
 * the Company (company-placement.js) or asking for a hex (hex-pick.js). What
 * it draws follows the pointer hex by hex, and a left click takes the hex
 * under it. A right click, Escape or the Realm going away gives up, and a
 * right drag still pans the map.
 */

/**
 * @typedef {object} MapClick
 * @property {string} owner Who is taking the click.
 * @property {Scene} scene
 * @property {PIXI.Container} marks What's drawn over the hex under the pointer, hidden past the edge of the Realm.
 * @property {(hex: {col: number, row: number}) => void} draw Draw the marks over a hex.
 * @property {object|null} note The standing notification saying what to do.
 * @property {(hex: {col: number, row: number}) => void} onPick
 * @property {(options: {quiet: boolean}) => void} onCancel `quiet` where nobody gave up, but the Realm went or something else took the click.
 * @property {() => void} [onEnd] Anything else to clear away.
 * @property {{col: number, row: number}|null} hex Where the pointer is now.
 * @property {(() => void)|null} unwatch Stops watching the map's presses.
 * @property {number|null} tearDown The `canvasTearDown` hook watching for the Realm going away.
 */

/** @type {MapClick|null} */
let taking = null;

/**
 * @param {string} [owner]
 * @returns {boolean} Whether anything, or that owner, is taking the next click on the map.
 */
export const takingMapClick = (owner) => Boolean(taking) && (!owner || taking.owner === owner);

/** @returns {{col: number, row: number}|null} The hex under the pointer, or null past the edge of the Realm. */
function hexAtPointer() {
	if (!taking) return null;
	return hexAt(sceneGeometry(taking.scene), canvas.mousePosition);
}

/**
 * Draw over the hex under the pointer, or show nothing past the edge of the Realm.
 * @param {{col: number, row: number}|null} hex
 */
function drawAt(hex) {
	taking.hex = hex;
	taking.marks.visible = Boolean(hex);
	if (hex) taking.draw(hex);
}

/** Follow the pointer, redrawing only as it crosses into another hex. */
function onPointerMove() {
	if (!taking) return;
	const hex = hexAtPointer();
	if (hex ? sameHex(hex, taking.hex) : !taking.hex) return;
	drawAt(hex);
}

/**
 * Stop taking the click and clear everything it put up.
 * @returns {MapClick|null} What was taking it.
 */
function end() {
	const was = taking;
	if (!was) return null;
	canvas?.stage?.off("pointermove", onPointerMove);
	was.unwatch?.();
	window.removeEventListener("keydown", onKeyDown, true);
	if (was.tearDown !== null) Hooks.off("canvasTearDown", was.tearDown);
	if (was.note) ui.notifications.remove(was.note);
	was.marks.destroy({ children: true });
	was.onEnd?.();
	taking = null;
	return was;
}

/**
 * Give up taking the next click on the map, whoever is taking it.
 * @param {object} [options]
 * @param {boolean} [options.quiet] True where nobody gave up, so there's nothing to say.
 */
export function cancelMapClick({ quiet = false } = {}) {
	end()?.onCancel({ quiet });
}

/**
 * A left click on a hex takes it. The click is caught before the canvas sees
 * it, so the tool in hand — Inspect, a terrain brush — doesn't act on
 * the same click.
 * @param {PointerEvent} event
 */
function onPress(event) {
	if (!taking || event.button !== 0) return;
	const hex = hexAtPointer();
	// Past the edge of the Realm there's no hex to take, and nothing to take the click for.
	if (!hex) return;
	event.preventDefault();
	event.stopImmediatePropagation();
	end().onPick(hex);
}

/**
 * Escape gives up, before Foundry takes the key for its own.
 * @param {KeyboardEvent} event
 */
function onKeyDown(event) {
	if (!taking || event.key !== "Escape") return;
	event.preventDefault();
	event.stopImmediatePropagation();
	cancelMapClick();
}

/**
 * Take the next click on a hex of the Realm on the canvas, quietly giving up
 * whatever was taking it before.
 * @param {Omit<MapClick, "hex"|"unwatch"|"tearDown">} options
 */
export function takeMapClick(options) {
	cancelMapClick({ quiet: true });
	options.marks.eventMode = "none";
	taking = { ...options, hex: null, unwatch: null, tearDown: null };
	taking.tearDown = Hooks.on("canvasTearDown", () => cancelMapClick({ quiet: true }));
	canvas.stage.on("pointermove", onPointerMove);
	// A right click gives up; a right drag pans the map and keeps going.
	taking.unwatch = watchBoard({ onPress, onRightClick: () => cancelMapClick() });
	window.addEventListener("keydown", onKeyDown, true);
	drawAt(hexAtPointer());
}
