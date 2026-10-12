/**
 * The arithmetic of moving about the Timeline, after Stonetop's: how far past
 * its edges the board can be dragged, where a zoom keeps the point under the
 * pointer, and how the Age scrubber's slider maps onto the board's scroll.
 * Pure, so it can be tested without Foundry or a page; apps/timeline-scroll.js
 * wires it to the board.
 */

/** What one notch of the wheel multiplies the zoom by: gentle, since a board of words is read, not looked over. */
const ZOOM_STEP = 1.08;

/** How far the board zooms: a long campaign seen whole, to a card large enough to read under a magnifier. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;

/** The slider's top value; its bottom is 0. Fine enough that the thumb never moves in steps. */
export const SCRUB_MAX = 1000;

/**
 * @param {unknown} scale
 * @returns {number} A zoom inside the range; nonsense is 1.
 */
export function clampScale(scale) {
	const n = Number(scale);
	if (!Number.isFinite(n) || n <= 0) return 1;
	return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
}

/**
 * How many notches of zoom a wheel event is: in is positive, a trackpad's
 * small nudge a fraction of one, never more than one a time.
 * @param {{deltaY?: number, deltaMode?: number}} event
 * @returns {number}
 */
export function wheelNotches({ deltaY = 0, deltaMode = 0 } = {}) {
	const delta = Number(deltaY);
	if (!Number.isFinite(delta) || !delta) return 0;
	const per = deltaMode === 1 ? 3 : deltaMode === 2 ? 1 : 100;
	return Math.max(-1, Math.min(1, -delta / per));
}

/**
 * @param {number} scale
 * @param {number} notches Signed, and need not be whole.
 * @returns {number} The zoom after them.
 */
export function stepZoom(scale, notches) {
	const from = clampScale(scale);
	const n = Number(notches);
	if (!Number.isFinite(n) || !n) return from;
	return clampScale(from * ZOOM_STEP ** n);
}

/**
 * Where the board must scroll after a zoom so the point under the pointer
 * stays under it. One axis, in the board's scroll coordinates; the picture's
 * corner is measured before and after, since a centred picture's moves.
 * @param {{scroll?: number, pointer?: number, originBefore?: number, originAfter?: number, from?: number, to?: number}} at
 * @returns {number}
 */
export function anchoredScroll({ scroll = 0, pointer = 0, originBefore = 0, originAfter = 0, from = 1, to = 1 } = {}) {
	if (!(from > 0) || !(to > 0)) return scroll;
	return originAfter + ((scroll + pointer - originBefore) / from) * to - pointer;
}

/**
 * The empty room past the board's edges it can be dragged into: a share of
 * the box it's seen through, capped at the browser's window so a box that
 * grows with its content can't grow its own room forever.
 * @param {{width: number, height: number}} box
 * @param {{width?: number, height?: number}} [screen]
 * @param {number} [share] Of the box, a side.
 * @returns {{x: number, y: number}}
 */
export function gutterFor(box, screen = {}, share = 0) {
	const side = (n, cap) => {
		const size = Math.min(Number(n) || 0, Number.isFinite(cap) && cap > 0 ? cap : Infinity);
		return Math.max(0, Math.round(size * (Number(share) || 0)));
	};
	return { x: side(box?.width, screen?.width), y: side(box?.height, screen?.height) };
}

/**
 * The scroll along one axis that puts a span in the middle of the view. A
 * span longer than the view is laid against its near edge instead, less an
 * inset, so it reads from its start; `fromStart: false` centres it anyway.
 * @param {{scroll?: number, viewStart?: number, viewSize?: number, spanStart?: number, spanSize?: number, inset?: number, fromStart?: boolean}} at
 * @returns {number}
 */
export function centredScroll({ scroll = 0, viewStart = 0, viewSize = 0, spanStart = 0, spanSize = 0, inset = 0, fromStart = true } = {}) {
	if (fromStart && spanSize > viewSize) return Math.round(scroll + spanStart - viewStart - inset);
	return Math.round(scroll + (spanStart + spanSize / 2) - (viewStart + viewSize / 2));
}

/** The slider's two ends as scrolls: the first and last Ages drawn. */
function ends(targets) {
	const known = targets.filter(Number.isFinite);
	return known.length ? { from: known[0], to: known.at(-1) } : null;
}

/**
 * The scroll for a slider value: a straight share of the way from the first
 * Age's scroll to the last's, wherever those between fall, so the thumb
 * never sticks on a tick.
 * @param {(number|null)[]} targets The scroll that brings each Age into view.
 * @param {number} value 0 to SCRUB_MAX.
 * @returns {number|null} Null when no Age is drawn.
 */
export function scrollForValue(targets = [], value = 0) {
	const line = ends(targets);
	if (!line) return null;
	const share = Math.min(1, Math.max(0, value / SCRUB_MAX));
	return Math.round(line.from + (line.to - line.from) * share);
}

/**
 * @param {(number|null)[]} targets
 * @param {number} offset The board's scroll along the Timeline.
 * @returns {number} The slider value it's at; -1 when no Age is drawn.
 */
export function valueForScroll(targets = [], offset = 0) {
	const line = ends(targets);
	if (!line) return -1;
	if (line.to === line.from) return 0;
	return Math.min(1, Math.max(0, (offset - line.from) / (line.to - line.from))) * SCRUB_MAX;
}

/**
 * @param {(number|null)[]} targets
 * @returns {(number|null)[]} Where each Age's tick falls along the slider, 0 to 1; null for one not drawn.
 */
export function tickShares(targets = []) {
	const line = ends(targets);
	return targets.map((offset) => {
		if (!line || !Number.isFinite(offset)) return null;
		if (line.to === line.from) return 0;
		return Number(((offset - line.from) / (line.to - line.from)).toFixed(4));
	});
}

/**
 * The Age a slider value is nearest, for the readout. Two the board's end
 * holds at one place share a tick: the first half of the slider names the
 * earlier, the second half the later.
 * @param {(number|null)[]} targets
 * @param {number} value
 * @returns {number} An index into the Ages; -1 when none is drawn.
 */
export function nearestStop(targets = [], value = 0) {
	const at = value / SCRUB_MAX;
	const late = at > 0.5;
	let best = -1;
	let gap = Infinity;
	tickShares(targets).forEach((share, index) => {
		if (share === null) return;
		const d = Math.abs(share - at);
		if (d < gap || (late && d === gap)) {
			best = index;
			gap = d;
		}
	});
	return best;
}

/**
 * Where each Age's tick is first drawn, evenly spread, until the board is
 * laid out and each is moved to where its Age falls.
 * @param {unknown[]} stops
 * @returns {number[]}
 */
export function scrubTicks(stops = []) {
	const last = stops.length - 1;
	return stops.map((_, index) => (last > 0 ? Number((index / last).toFixed(4)) : 0));
}
