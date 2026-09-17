// A sheet's pages are picked from a column of icon tabs hung off the window's
// right edge, the way the Stonetop character sheet does it.
//
// A sheet renders the rail as a part of its own, templates/actor/tab-rail.hbs,
// so it sits straight inside `.window-content`, where Foundry's own tabs look
// for it. It's positioned against the window frame, which the stylesheet stops
// clipping, so it can hang outside the window. The sheet also needs the
// `bastionland-has-tab-rail` class.

/** Gap between the bottom of the sheet's header and the top of the rail, in px. */
const RAIL_HEADER_GAP = 16;

/** How many frames to wait for a newly opened window to be laid out. */
const MEASURE_RETRIES = 4;

/** @type {WeakMap<HTMLElement, number>} Each frame's rail width, measured once: it doesn't change. */
const railWidths = new WeakMap();

/**
 * Start the rail below the sheet's header, on whichever side has room.
 * Call after each render.
 * @param {HTMLElement} frame   The application element.
 * @param {string} anchorSelector  The header the rail hangs below.
 */
export function placeTabRail(frame, anchorSelector) {
	requestAnimationFrame(() => {
		const anchor = frame.querySelector(anchorSelector);
		if (anchor?.offsetHeight) {
			frame.style.setProperty("--bastionland-rail-top", `${offsetTopWithin(anchor, frame) + anchor.offsetHeight + RAIL_HEADER_GAP}px`);
		}
		stampRailSide(frame);
	});
}

/**
 * Hang the rail off the window's left edge when the right has no room for it,
 * such as a window dragged against the right of the screen. Cheap enough for
 * every frame of a drag: given the window's position, nothing is measured
 * after the rail's width is known.
 * @param {HTMLElement} frame
 * @param {{left: number, width: number, scale?: number}} [position] The window's position; measured when omitted.
 * @param {number} [retries]
 */
export function stampRailSide(frame, position, retries = MEASURE_RETRIES) {
	if (!frame) return;
	let railWidth = railWidths.get(frame);
	if (!railWidth) {
		railWidth = frame.querySelector(".window-content > nav.bastionland-tab-rail")?.getBoundingClientRect().width;
		if (!railWidth) {
			if (retries > 0) requestAnimationFrame(() => stampRailSide(frame, position, retries - 1));
			return;
		}
		railWidths.set(frame, railWidth);
	}
	const frameRect = Number.isFinite(position?.left) && Number.isFinite(position?.width)
		? { left: position.left, right: position.left + position.width * (position.scale ?? 1) }
		: frame.getBoundingClientRect();
	frame.classList.toggle("bastionland-tab-rail-left", railHangsLeft(frameRect, railWidth, window.innerWidth));
}

/**
 * Whether the rail should hang off the left edge: it doesn't fit on the right,
 * and the left has more room. Only the frame is measured, so the answer doesn't
 * change when the rail moves sides.
 * @param {{left: number, right: number}} frameRect
 * @param {number} railWidth
 * @param {number} viewportWidth
 * @returns {boolean}
 */
export function railHangsLeft(frameRect, railWidth, viewportWidth) {
	const spaceRight = viewportWidth - frameRect.right;
	return railWidth > spaceRight && frameRect.left > spaceRight;
}

/**
 * How far below the top of `ancestor` an element sits, ignoring scrolling and
 * any scale applied to the window.
 * @param {HTMLElement} element
 * @param {HTMLElement} ancestor
 * @returns {number} px
 */
function offsetTopWithin(element, ancestor) {
	let top = 0;
	for (let node = element; node && node !== ancestor; node = node.offsetParent) top += node.offsetTop;
	return top;
}
