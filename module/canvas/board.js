/**
 * Presses on the map itself, told apart from those on a window or the sidebar,
 * and a right click told apart from a right drag that pans the map.
 */

/** How far the pointer may travel between a right button going down and coming up and still count as a click, not a pan. */
const CLICK_SLOP = 6;

/**
 * @param {Event} event
 * @returns {boolean} Whether the event happened over the map rather than over a window or the sidebar.
 */
export const onBoard = (event) => event.target instanceof Element && event.target.id === "board";

/**
 * @param {{x: number, y: number}} down Where the right button went down.
 * @param {PointerEvent} event Its coming up.
 * @returns {boolean} Whether it was a click, not a drag that panned the map.
 */
export const isRightClick = (down, event) => Math.hypot(event.clientX - down.x, event.clientY - down.y) <= CLICK_SLOP;

/**
 * Watch presses on the map, caught before the canvas sees them. A right button
 * is left to the canvas, so the map can still be dragged about, and only a
 * right click that didn't pan is passed on.
 * @param {object} handlers
 * @param {(event: PointerEvent) => void} [handlers.onPress] Any other button going down over the map.
 * @param {() => void} [handlers.onRightClick]
 * @returns {() => void} Stop watching.
 */
export function watchBoard({ onPress = () => {}, onRightClick = () => {} }) {
	let rightDown = null;
	const down = (event) => {
		if (!onBoard(event)) return;
		if (event.button === 2) rightDown = { x: event.clientX, y: event.clientY };
		else onPress(event);
	};
	const up = (event) => {
		if (event.button !== 2) return;
		const was = rightDown;
		rightDown = null;
		if (was && onBoard(event) && isRightClick(was, event)) onRightClick();
	};
	window.addEventListener("pointerdown", down, true);
	window.addEventListener("pointerup", up, true);
	return () => {
		window.removeEventListener("pointerdown", down, true);
		window.removeEventListener("pointerup", up, true);
	};
}
