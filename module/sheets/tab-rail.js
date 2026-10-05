// A sheet's pages are picked from a column of icon tabs hung off the window's
// right edge, the way the Stonetop character sheet does it.
//
// TabRailMixin renders the rail as the sheet's first part, templates/actor/tab-rail.hbs,
// so it sits straight inside `.window-content`, where Foundry's own tabs look
// for it. It's positioned against the window frame, which the stylesheet stops
// clipping, so it can hang outside the window. The mixin also gives the sheet
// the `bastionland-has-tab-rail` class and keeps the rail in place.

import { templatePath } from "../system-id.js";

/** Gap between the bottom of the sheet's header and the top of the rail, in px. */
const RAIL_HEADER_GAP = 16;

/** How many frames to wait for a newly opened window to be laid out. */
const MEASURE_RETRIES = 4;

/** @type {WeakMap<HTMLElement, number>} Each frame's rail width, measured once: it doesn't change. */
const railWidths = new WeakMap();

/** @type {WeakMap<HTMLElement, {anchor: HTMLElement, observer: ResizeObserver}>} The header each frame's rail is watching. */
const watchedAnchors = new WeakMap();

/**
 * A sheet with the rail: drawn before the sheet's own PARTS, hung below the
 * header its RAIL_ANCHOR names after each render, and changing sides as the
 * window is dragged near the screen's edge.
 * @param {typeof foundry.applications.api.ApplicationV2} Base
 */
export const TabRailMixin = (Base) => class extends Base {
	static DEFAULT_OPTIONS = { classes: ["bastionland-has-tab-rail"] };

	/** The header the rail hangs below. */
	static RAIL_ANCHOR = "";

	/** @override */
	_configureRenderParts(options) {
		return { tabs: { template: templatePath("actor/tab-rail.hbs") }, ...super._configureRenderParts(options) };
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		placeTabRail(this.element, this.constructor.RAIL_ANCHOR);
	}

	/** @override */
	_onPosition(position) {
		super._onPosition(position);
		stampRailSide(this.element, position);
	}
};

/**
 * Start the rail below the sheet's header, on whichever side has room, and
 * keep it there whenever the header changes height, such as when Text Size or
 * Typeface is changed or the window is resized. Call after each render: a
 * header drawn afresh is watched in place of the old one.
 * @param {HTMLElement} frame   The application element.
 * @param {string} anchorSelector  The header the rail hangs below.
 */
export function placeTabRail(frame, anchorSelector) {
	requestAnimationFrame(() => {
		stampRailSide(frame);
		measureRailHeight(frame);
	});
	const anchor = frame.querySelector(anchorSelector);
	const watched = watchedAnchors.get(frame);
	if (watched?.anchor === anchor) return;
	watched?.observer.disconnect();
	watchedAnchors.delete(frame);
	if (!anchor) return;
	if (typeof ResizeObserver !== "function") {
		requestAnimationFrame(() => hangRailBelow(frame, anchor));
		return;
	}
	// Called once as soon as the header is laid out, and again whenever its size changes.
	const observer = new ResizeObserver(() => {
		if (!frame.isConnected || !anchor.isConnected) {
			observer.disconnect();
			if (watchedAnchors.get(frame)?.observer === observer) watchedAnchors.delete(frame);
			return;
		}
		hangRailBelow(frame, anchor);
	});
	observer.observe(anchor);
	watchedAnchors.set(frame, { anchor, observer });
}

/**
 * Set the rail's top a little below the header's bottom.
 * @param {HTMLElement} frame
 * @param {HTMLElement} anchor
 */
function hangRailBelow(frame, anchor) {
	const bottom = anchorBottom(frame, anchor);
	if (bottom !== null) frame.style.setProperty("--bastionland-rail-top", `${bottom + RAIL_HEADER_GAP}px`);
}

/**
 * Note the rail's full height, borders and all, so the stylesheet can keep its
 * middle within the top third of a window too short to hang it below the
 * header. Read past the height cap, which the stylesheet works out from this.
 * @param {HTMLElement} frame
 */
function measureRailHeight(frame) {
	const rail = frame.querySelector(".window-content > nav.bastionland-tab-rail");
	if (!rail?.scrollHeight) return;
	frame.style.setProperty("--bastionland-rail-height", `${rail.scrollHeight + rail.offsetHeight - rail.clientHeight}px`);
}

/**
 * How far below the top of the frame the header's bottom sits, in the frame's
 * own pixels: as drawn on screen, less the scale Foundry gives the window and
 * whatever the pages between them have been scrolled.
 * @param {HTMLElement} frame
 * @param {HTMLElement} anchor
 * @returns {number|null} px, or null while the header isn't shown.
 */
export function anchorBottom(frame, anchor) {
	const anchorRect = anchor.getBoundingClientRect();
	const frameRect = frame.getBoundingClientRect();
	if (!anchorRect.height || !frame.offsetHeight) return null;
	let bottom = anchorRect.bottom - frameRect.top;
	// A page scrolled when it was measured would lift the rail with it.
	for (let node = anchor.parentElement; node && node !== frame; node = node.parentElement) {
		if (node.scrollTop) bottom += node.scrollTop * onScreenScale(node);
	}
	return bottom / onScreenScale(frame);
}

/**
 * How much larger an element is drawn than its own layout, from the window's
 * scale and any zoom on the way, which Text Size sets on the sheet's pages.
 * @param {HTMLElement} element
 * @returns {number}
 */
const onScreenScale = (element) => (element.offsetHeight ? element.getBoundingClientRect().height / element.offsetHeight : 1) || 1;

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
