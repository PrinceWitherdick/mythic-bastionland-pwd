import { sceneGeometry } from "../actions/realm.js";
import { hexAt, sameHex } from "../rules/realm-geometry.js";

/**
 * The next click on a hex of the Realm, taken by one thing at a time: carrying
 * the Company (company-placement.js) or asking for a hex (hex-pick.js). What
 * it draws follows the pointer hex by hex, and a left click takes the hex
 * under it. A right click, Escape or the Realm going away gives up, and a
 * right drag still pans the map.
 */

/** How far the pointer may travel between a right button going down and coming up and still count as a click, not a pan. */
const CLICK_SLOP = 6;

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
 * @property {{x: number, y: number}|null} rightDown Where a right button went down, to tell a click from a pan.
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
 * @param {Event} event
 * @returns {boolean} Whether the event happened over the map rather than over a window or the sidebar.
 */
const onBoard = (event) => event.target instanceof Element && event.target.id === "board";

/**
 * Stop taking the click and clear everything it put up.
 * @returns {MapClick|null} What was taking it.
 */
function end() {
	const was = taking;
	if (!was) return null;
	canvas?.stage?.off("pointermove", onPointerMove);
	window.removeEventListener("pointerdown", onPointerDown, true);
	window.removeEventListener("pointerup", onPointerUp, true);
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
 * it, so the tool in hand — the Hex panel, a terrain brush — doesn't act on
 * the same click.
 * @param {PointerEvent} event
 */
function onPointerDown(event) {
	if (!taking || !onBoard(event)) return;
	// A right button is left to the canvas, so the map can still be dragged about.
	if (event.button === 2) {
		taking.rightDown = { x: event.clientX, y: event.clientY };
		return;
	}
	if (event.button !== 0) return;
	const hex = hexAtPointer();
	// Past the edge of the Realm there's no hex to take, and nothing to take the click for.
	if (!hex) return;
	event.preventDefault();
	event.stopImmediatePropagation();
	end().onPick(hex);
}

/**
 * A right click gives up; a right drag pans the map and keeps going.
 * @param {PointerEvent} event
 */
function onPointerUp(event) {
	if (!taking || event.button !== 2) return;
	const down = taking.rightDown;
	taking.rightDown = null;
	if (!down || !onBoard(event)) return;
	if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_SLOP) return;
	cancelMapClick();
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
 * @param {Omit<MapClick, "hex"|"rightDown"|"tearDown">} options
 */
export function takeMapClick(options) {
	cancelMapClick({ quiet: true });
	options.marks.eventMode = "none";
	taking = { ...options, hex: null, rightDown: null, tearDown: null };
	taking.tearDown = Hooks.on("canvasTearDown", () => cancelMapClick({ quiet: true }));
	canvas.stage.on("pointermove", onPointerMove);
	window.addEventListener("pointerdown", onPointerDown, true);
	window.addEventListener("pointerup", onPointerUp, true);
	window.addEventListener("keydown", onKeyDown, true);
	drawAt(hexAtPointer());
}
