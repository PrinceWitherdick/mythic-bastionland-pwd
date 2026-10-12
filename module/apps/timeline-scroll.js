import {
	SCRUB_MAX, anchoredScroll, centredScroll, clampScale, gutterFor, nearestStop, scrollForValue, stepZoom, tickShares, valueForScroll, wheelNotches
} from "../rules/timeline-scroll.js";
import { wirePanDrag } from "./pan-drag.js";

/**
 * Moving about the Timeline, after Stonetop's: drag the board and throw it,
 * Ctrl and the wheel zoom it about the pointer, as on the chart and the map, the Age scrubber slides along it, its menus shut on a click outside and fit the room below them, its
 * toolbar's second line lines up under the first, and the control that had the
 * keyboard has it again after a redraw. The arithmetic is rules/timeline-scroll.js.
 *
 * The board is a real scroll box, so the wheel, the scrollbar and the keyboard
 * already move it; the drag and the scrubber speak its scroll too. The zoom is
 * CSS `zoom` on the picture, which lays it out larger rather than stretching
 * it, so the scroll grows with it and the sticky heads still pin.
 */

/** What a left press never drags from: anything aimed at rather than grabbed. */
const CONTROLS = "a, button, input, select, textarea, summary, label, [contenteditable], [draggable='true'], [role='button']";

/** How far past each edge the board can be dragged, as a share of the box it's seen in. */
const GUTTER_SHARE = 0.75;

/** The custom properties the stylesheet spends: the zoom, and the room past each edge. */
const ZOOM_VAR = "--timeline-zoom";
const GUTTER = Object.freeze({ x: "--timeline-gutter-x", y: "--timeline-gutter-y", top: "--timeline-gutter-top", left: "--timeline-gutter-left" });

/** Kept clear between an open menu's foot and the Timeline's, so its shadow isn't cut flat. */
const MENU_MARGIN = 8;

/**
 * How much bigger an element is drawn than laid out, as when Foundry's UI is
 * scaled: rects are on screen, scrolls and widths are not.
 * @param {HTMLElement} el
 * @param {DOMRect} [rect]
 * @param {boolean} [across] Which axis to read.
 */
function drawnScale(el, rect = el?.getBoundingClientRect?.(), across = true) {
	if (!rect) return 1;
	const drawn = across ? rect.width : rect.height;
	const laid = across ? el.offsetWidth : el.offsetHeight;
	if (!drawn || !laid) return 1;
	return Math.abs(drawn - laid) < 1 ? 1 : drawn / laid;
}

/**
 * @typedef {object} TimelineHostState What a Timeline's host keeps across its redraws.
 * @property {number} zoom
 * @property {{zoom: number, left: number, top: number}|null} view Where the board was left, past its gutter.
 * @property {Record<string, boolean>} menus Which of its menus are open.
 * @property {string|null} focus The control that had the keyboard, by its data-timeline-focus.
 */

/**
 * @param {HTMLElement} root
 * @returns {HTMLElement|null} The Timeline it is or holds.
 */
export const timelineIn = (root) => (root?.matches?.(".bastionland-timeline") ? root : (root?.querySelector?.(".bastionland-timeline") ?? null));

/** @returns {TimelineHostState} */
export const hostState = () => ({ zoom: 1, view: null, menus: {}, focus: null });

/**
 * @param {HTMLElement} el The box that scrolls.
 * @returns {HTMLElement|null} What it scrolls, padded by the room past the board's edges.
 */
const canvasOf = (el) => el.querySelector(":scope > .bastionland-timeline__canvas");

/**
 * Drag the board and throw it.
 * @param {HTMLElement} el The box that scrolls.
 * @param {HTMLElement|null} canvas What it scrolls, which takes the room past the edges.
 * @param {{pinTop?: boolean, pinLeft?: boolean, pinBottom?: boolean}} pins Edges with no room past them, for the sticky heads there.
 * @returns {() => void} Takes it off.
 */
function wireDrag(el, canvas, { pinTop = false, pinLeft = false, pinBottom = false } = {}) {
	/** How much larger the box is drawn than laid out, as the press found it. */
	let scale = 1;

	// A press on the box's own scrollbar drags the thumb, which already scrolls.
	const onScrollbar = (event, box, s) => event.target === el && (event.clientX >= box.left + (el.clientLeft + el.clientWidth) * s || event.clientY >= box.top + (el.clientTop + el.clientHeight) * s);

	const drag = wirePanDrag(el, {
		draggingClass: "is-panning",
		grab(event) {
			// A finger already scrolls the box.
			if (event.pointerType === "touch") return null;
			if (event.button === 0 && event.target.closest?.(CONTROLS)) return null;
			const box = el.getBoundingClientRect();
			const s = drawnScale(el, box);
			if (onScrollbar(event, box, s)) return null;
			scale = s;
			return { left: el.scrollLeft, top: el.scrollTop };
		},
		pan(from, dx, dy) {
			el.scrollLeft = from.left - dx / scale;
			el.scrollTop = from.top - dy / scale;
		},
		slide(dx, dy) {
			const left = el.scrollLeft - dx / scale;
			const top = el.scrollTop - dy / scale;
			el.scrollLeft = left;
			el.scrollTop = top;
			// An axis that couldn't go any further is done.
			return { x: Math.abs(el.scrollLeft - left) >= 1, y: Math.abs(el.scrollTop - top) >= 1 };
		}
	});
	const onEnter = () => el.classList.toggle("is-pannable", el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth);
	const listeners = [
		["pointerenter", onEnter],
		["wheel", drag.stop, { passive: true }]
	];
	for (const [type, fn, options] of listeners) el.addEventListener(type, fn, options);

	// The room past the edges, sized now and whenever the box changes size. Each change moves the
	// scroll by as much, so the board stays where it was on screen; read before the room moves and
	// written as a sum after, since the browser's scroll anchoring may nudge it in between. The room
	// goes on the canvas, whose children don't inherit it: on the box, every frame of a window being
	// resized would style the whole board again.
	let gutter = { x: 0, y: 0, top: 0, left: 0 };
	const size = () => {
		if (!el.isConnected || !canvas) return;
		// A tab that isn't showing measures nothing: its room is kept as it was, rather than folded
		// away and moving the board by all of it when the tab is shown again.
		if (!el.clientWidth || !el.clientHeight) return;
		const s = drawnScale(el);
		const measured = gutterFor({ width: el.clientWidth, height: el.clientHeight }, { width: innerWidth / s, height: innerHeight / s }, GUTTER_SHARE);
		const next = { x: measured.x, y: pinBottom ? 0 : measured.y, top: pinTop ? 0 : measured.y, left: pinLeft ? 0 : measured.x };
		if (Object.keys(next).every((key) => next[key] === gutter[key])) return;
		const left = el.scrollLeft + next.left - gutter.left;
		const top = el.scrollTop + next.top - gutter.top;
		gutter = next;
		for (const [key, name] of Object.entries(GUTTER)) canvas.style.setProperty(name, `${next[key]}px`);
		el.scrollLeft = left;
		el.scrollTop = top;
	};
	size();
	const resizes = typeof ResizeObserver === "function" ? new ResizeObserver(size) : null;
	resizes?.observe(el);

	return () => {
		drag.off();
		resizes?.disconnect();
		for (const [type, fn, options] of listeners) el.removeEventListener(type, fn, options);
	};
}

/**
 * The room before the board, as the drag last sized it: a view is kept from
 * the board's own corner, since the box may be another size next time.
 * @param {HTMLElement|null} canvas
 */
const gutterOf = (canvas) => ({ x: Number.parseFloat(canvas?.style.getPropertyValue(GUTTER.left)) || 0, y: Number.parseFloat(canvas?.style.getPropertyValue(GUTTER.top)) || 0 });

/**
 * The wheel zooms the board about the pointer, as Stonetop's does; a swipe
 * sideways on a trackpad still scrolls it, and the drag moves it about.
 * @param {HTMLElement} el The box that scrolls.
 * @param {TimelineHostState} state
 * @param {() => void} moved Told after each zoom.
 * @returns {() => void}
 */
function wireZoom(el, state, moved) {
	const paint = (scale) => el.style.setProperty(ZOOM_VAR, String(scale));
	paint(clampScale(state.zoom));
	const picture = () => el.querySelector(".bastionland-timeline__canvas > *");
	const originOf = (target, box, s) => {
		const r = target?.getBoundingClientRect();
		return r ? { x: (r.left - box.left) / s - el.clientLeft + el.scrollLeft, y: (r.top - box.top) / s - el.clientTop + el.scrollTop } : { x: 0, y: 0 };
	};
	// One zoom a frame however many wheel events come in it: a trackpad sends dozens.
	let held = 0;
	let cursor = { x: 0, y: 0 };
	let frame = 0;
	const apply = () => {
		frame = 0;
		const notches = held;
		held = 0;
		const from = clampScale(state.zoom);
		const to = stepZoom(from, notches);
		if (to === from) return;
		const target = picture();
		const box = el.getBoundingClientRect();
		const s = drawnScale(el, box);
		const pointer = { x: (cursor.x - box.left) / s - el.clientLeft, y: (cursor.y - box.top) / s - el.clientTop };
		const before = originOf(target, box, s);
		const scroll = { x: el.scrollLeft, y: el.scrollTop };
		state.zoom = to;
		paint(to);
		// Measured after the new zoom is on, which lays the board out again.
		const after = originOf(target, el.getBoundingClientRect(), s);
		el.scrollLeft = anchoredScroll({ scroll: scroll.x, pointer: pointer.x, originBefore: before.x, originAfter: after.x, from, to });
		el.scrollTop = anchoredScroll({ scroll: scroll.y, pointer: pointer.y, originBefore: before.y, originAfter: after.y, from, to });
		moved();
	};
	// The wheel alone scrolls the board, which a thread laid down the page needs.
	const onWheel = (event) => {
		if (!event.ctrlKey && !event.metaKey) return;
		const notches = wheelNotches(event);
		if (!notches) return;
		event.preventDefault();
		held += notches;
		cursor = { x: event.clientX, y: event.clientY };
		frame ||= requestAnimationFrame(apply);
	};
	el.addEventListener("wheel", onWheel, { passive: false });
	return () => {
		el.removeEventListener("wheel", onWheel, { passive: false });
		if (frame) cancelAnimationFrame(frame);
	};
}

/**
 * The view's own rectangle on screen, less its scrollbars, and how much
 * larger it's drawn than laid out.
 * @param {HTMLElement} el
 */
function viewRect(el) {
	const r = el.getBoundingClientRect();
	const scale = drawnScale(el, r);
	return { left: r.left + el.clientLeft * scale, top: r.top + el.clientTop * scale, width: el.clientWidth ? el.clientWidth * scale : r.width, height: el.clientHeight ? el.clientHeight * scale : r.height, scale };
}

/** centredScroll for a view and a span measured on screen, brought back to laid-out pixels first. */
const centredOnScreen = (view, { viewStart, viewSize, spanStart, spanSize, ...at }) =>
	centredScroll({ ...at, viewStart: viewStart / view.scale, viewSize: viewSize / view.scale, spanStart: spanStart / view.scale, spanSize: spanSize / view.scale });

/**
 * The scroll that brings a span on screen into the view along one axis.
 * @param {HTMLElement} el The box that scrolls.
 * @param {ReturnType<typeof viewRect>} view
 * @param {{left: number, top: number, right: number, bottom: number}} span
 * @param {boolean} across Along the page, rather than down it.
 * @param {{inset?: number, fromStart?: boolean}} [at] As centredScroll takes them.
 */
const centredAlong = (el, view, span, across, at = {}) => centredOnScreen(view, across
	? { scroll: el.scrollLeft, viewStart: view.left, viewSize: view.width, spanStart: span.left, spanSize: span.right - span.left, ...at }
	: { scroll: el.scrollTop, viewStart: view.top, viewSize: view.height, spanStart: span.top, spanSize: span.bottom - span.top, ...at });

/**
 * Each Age's extent on screen, from every Season and cell stamped with it.
 * @param {HTMLElement} el
 * @returns {Map<string, {left: number, top: number, right: number, bottom: number}>}
 */
function ageRects(el) {
	const rects = new Map();
	for (const part of el.querySelectorAll("[data-age]")) {
		const key = part.dataset.age;
		if (!key) continue;
		const r = part.getBoundingClientRect();
		if (!r.width && !r.height) continue;
		const had = rects.get(key);
		rects.set(key, had ? { left: Math.min(had.left, r.left), top: Math.min(had.top, r.top), right: Math.max(had.right, r.right), bottom: Math.max(had.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
	}
	return rects;
}

/**
 * The Age scrubber: slide and the board follows, bringing that Age into view;
 * move the board any other way and the thumb follows it.
 * @param {HTMLElement} el The box that scrolls.
 * @param {HTMLElement} bar The scrubber.
 * @param {{across: boolean}} options
 * @returns {() => void}
 */
function wireScrubber(el, bar, { across }) {
	const range = bar?.querySelector("input[type=range]");
	const stops = [...(bar?.querySelectorAll(".bastionland-timeline__scrub-tick") ?? [])].map((tick) => ({ key: tick.dataset.stop, label: tick.dataset.label, tick }));
	if (!range || stops.length < 2) return () => {};
	// Never a sheet's own field.
	const onChange = (event) => event.stopPropagation();
	const readout = bar.querySelector("output");
	const inset = 12;
	let wrote = null;
	let frame = 0;

	const measure = () => {
		const view = viewRect(el);
		const room = across ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
		const spans = ageRects(el);
		return stops.map(({ key }) => {
			const span = spans.get(key);
			if (!span) return null;
			const target = centredAlong(el, view, span, across, across ? {} : { inset });
			return Math.min(Math.max(0, room), Math.max(0, target));
		});
	};
	const show = (value, targets) => {
		range.value = String(Number(value.toFixed(1)));
		const stop = stops[nearestStop(targets, value)];
		if (!stop) return;
		range.setAttribute("aria-valuetext", stop.label);
		if (readout) readout.textContent = stop.label;
	};
	const go = (value, targets = measure()) => {
		const main = scrollForValue(targets, value);
		if (main === null) return;
		// The other way, the board is put back in the middle: a scrub is how a board dragged off is found again.
		const view = viewRect(el);
		const whole = el.querySelector(".bastionland-timeline__canvas > *")?.getBoundingClientRect();
		if (across) {
			el.scrollLeft = main;
			if (whole) el.scrollTop = centredAlong(el, view, whole, false, { fromStart: false });
		} else {
			el.scrollTop = main;
			if (whole) el.scrollLeft = centredAlong(el, view, whole, true, { inset });
		}
		show(value, targets);
		wrote = { left: el.scrollLeft, top: el.scrollTop };
	};
	const echo = () => Boolean(wrote) && Math.abs(el.scrollLeft - wrote.left) <= 1 && Math.abs(el.scrollTop - wrote.top) <= 1;
	const onInput = () => go(Math.min(SCRUB_MAX, Math.max(0, Number(range.value) || 0)));
	// The keyboard steps a whole Age, to the next tick along.
	const KEYS = { ArrowRight: 1, ArrowUp: 1, PageUp: 1, ArrowLeft: -1, ArrowDown: -1, PageDown: -1 };
	const onKey = (event) => {
		const dir = KEYS[event.key];
		if (event.key !== "Home" && event.key !== "End" && !dir) return;
		event.preventDefault();
		if (event.key === "Home") return go(0);
		if (event.key === "End") return go(SCRUB_MAX);
		const value = Number(range.value) || 0;
		const targets = measure();
		const marks = tickShares(targets).filter((share) => share !== null).map((share) => share * SCRUB_MAX);
		go(dir > 0 ? (marks.find((m) => m > value + 0.5) ?? SCRUB_MAX) : (marks.findLast((m) => m < value - 0.5) ?? 0), targets);
	};
	const follow = () => {
		frame = 0;
		if (!el.isConnected || echo()) return;
		const targets = measure();
		tickShares(targets).forEach((share, at) => {
			const { tick } = stops[at];
			tick.hidden = share === null;
			if (share !== null) tick.style.setProperty("--at", String(share));
		});
		wrote = null;
		const value = valueForScroll(targets, across ? el.scrollLeft : el.scrollTop);
		if (value >= 0 && Math.abs(value - Number(range.value)) > 0.05) show(value, targets);
	};
	const onScroll = () => {
		frame ||= requestAnimationFrame(follow);
	};
	range.addEventListener("change", onChange);
	range.addEventListener("input", onInput);
	range.addEventListener("keydown", onKey);
	el.addEventListener("scroll", onScroll, { passive: true });
	onScroll();
	return () => {
		range.removeEventListener("change", onChange);
		range.removeEventListener("input", onInput);
		range.removeEventListener("keydown", onKey);
		el.removeEventListener("scroll", onScroll);
		if (frame) cancelAnimationFrame(frame);
	};
}

/**
 * Tell an open menu how much room it has down to the Timeline's foot, which
 * the stylesheet caps it at: a sheet's tab can't be dragged taller.
 * @param {HTMLDetailsElement} menu
 */
function fitMenu(menu) {
	if (!menu?.open) return;
	const box = menu.querySelector(":scope > :not(summary)");
	const timeline = menu.closest(".bastionland-timeline");
	if (!box || !timeline?.offsetHeight) return;
	const frame = timeline.getBoundingClientRect();
	const room = (frame.bottom - box.getBoundingClientRect().top) / drawnScale(timeline, frame, false) - MENU_MARGIN;
	box.style.setProperty("--timeline-menu-room", `${Math.max(0, Math.floor(room))}px`);
}

/**
 * The toolbar's second line, once it wraps, laid from the left with each of
 * its buttons as wide as the one above it.
 * @param {HTMLElement} toolbar
 * @returns {() => void}
 */
function wireToolbarWrap(toolbar) {
	const end = toolbar?.querySelector(":scope > .bastionland-timeline__toolbar-end");
	if (!end || typeof ResizeObserver !== "function") return () => {};
	const above = [...toolbar.children].filter((el) => el !== end);
	if (!above.length) return () => {};
	const lay = () => {
		const matched = [...end.querySelectorAll(":scope > button, :scope > details > summary")];
		toolbar.classList.remove("is-wrapped");
		for (const el of matched) el.style.minWidth = "";
		if (!toolbar.offsetWidth || end.getBoundingClientRect().top < above[0].getBoundingClientRect().bottom) return;
		toolbar.classList.add("is-wrapped");
		matched.forEach((el, at) => {
			if (above[at]) el.style.minWidth = `${above[at].offsetWidth}px`;
		});
	};
	// Only a change of width: the toolbar's height moves with the very change this makes.
	const widths = new Map();
	const observer = new ResizeObserver((entries) => {
		let moved = false;
		for (const { target } of entries) {
			if (widths.get(target) !== target.offsetWidth) moved = true;
			widths.set(target, target.offsetWidth);
		}
		if (moved) lay();
	});
	for (const el of [toolbar, ...above]) observer.observe(el);
	return () => observer.disconnect();
}

/**
 * Wire a Timeline just drawn: its board, scrubber, menus, toolbar and the
 * keyboard's place. Call after every draw, with the host's own state and the
 * last call's answer to take the old wiring off. A board drawn again is put
 * back where it was left (`state.view`); one with nowhere kept is brought to
 * the Season it is now.
 * @param {HTMLElement} root Holding the Timeline.
 * @param {TimelineHostState} state
 * @param {object} [options]
 * @param {(view: {zoom: number, left: number, top: number}) => void} [options.onView] Told where the board is as it moves.
 * @returns {() => void} Takes the wiring off.
 */
export function wireTimeline(root, state, { onView = () => {} } = {}) {
	const timeline = timelineIn(root);
	if (!timeline) return () => {};
	const offs = [];
	const scroll = timeline.querySelector(".bastionland-timeline__scroll");
	const across = timeline.classList.contains("bastionland-timeline--across");
	const board = Boolean(timeline.querySelector(".bastionland-timeline__board, .bastionland-timeline__swim"));

	if (scroll) {
		const canvas = canvasOf(scroll);
		// A tab that isn't showing measures nothing, and keeps the view it had.
		const noteView = () => {
			if (!scroll.clientHeight) return;
			const { x, y } = gutterOf(canvas);
			state.view = { zoom: state.zoom, left: Math.round(scroll.scrollLeft - x), top: Math.round(scroll.scrollTop - y) };
		};
		// The zoom goes on before the board is placed, so a kept scroll isn't clamped against a smaller picture.
		offs.push(wireZoom(scroll, state, () => {
			noteView();
			onView(state.view);
		}));
		// A board's heads are pinned to its top and left; one thread has room either side of its line.
		offs.push(wireDrag(scroll, canvas, board ? { pinTop: true, pinLeft: true, pinBottom: true } : { pinTop: !across, pinLeft: across, pinBottom: !across }));
		if (state.view) {
			const { x, y } = gutterOf(canvas);
			scroll.scrollLeft = x + state.view.left;
			scroll.scrollTop = y + state.view.top;
		} else {
			// Moved in its own box alone, along the Timeline: scrollIntoView would scroll the sheet round it too.
			const now = scroll.querySelector(".is-now[data-period]") ?? [...scroll.querySelectorAll("[data-period]:not([data-period=''])")].at(-1);
			const span = now?.getBoundingClientRect();
			if (span) scroll[across ? "scrollLeft" : "scrollTop"] = centredAlong(scroll, viewRect(scroll), span, across, { fromStart: false });
		}
		const onScroll = () => {
			noteView();
			onView(state.view);
		};
		scroll.addEventListener("scroll", onScroll, { passive: true });
		offs.push(() => scroll.removeEventListener("scroll", onScroll));
		offs.push(wireScrubber(scroll, timeline.querySelector(".bastionland-timeline__scrub"), { across }));
	}

	// Each menu keeps whether it's open across the redraws its own ticks cause, fits the room below
	// it, and shuts on a press anywhere outside it.
	const menus = new AbortController();
	offs.push(() => menus.abort());
	for (const menu of timeline.querySelectorAll("details[data-timeline-menu]")) {
		const name = menu.dataset.timelineMenu;
		menu.open = Boolean(state.menus[name]);
		fitMenu(menu);
		menu.addEventListener("toggle", () => {
			state.menus[name] = menu.open;
			fitMenu(menu);
		}, { signal: menus.signal });
	}
	const onPress = (event) => {
		for (const menu of timeline.querySelectorAll("details[data-timeline-menu][open]")) if (!menu.contains(event.target)) menu.open = false;
	};
	document.addEventListener("pointerdown", onPress, true);
	offs.push(() => document.removeEventListener("pointerdown", onPress, true));
	offs.push(wireToolbarWrap(timeline.querySelector(".bastionland-timeline__toolbar")));

	// The keyboard comes back to the control it was on: a write anywhere at the table draws the Timeline again.
	const onFocus = (event) => {
		state.focus = event.target.closest?.("[data-timeline-focus]")?.dataset.timelineFocus ?? null;
	};
	// A control swept away by a redraw is let go of with nowhere to go, as is one clicked away from onto the
	// canvas: only the swept-away one is no longer on the page a moment later.
	const onBlur = (event) => {
		if (event.relatedTarget) {
			if (!timeline.contains(event.relatedTarget)) state.focus = null;
			return;
		}
		const left = event.target;
		setTimeout(() => {
			if (left.isConnected && state.focus === left.closest?.("[data-timeline-focus]")?.dataset.timelineFocus) state.focus = null;
		});
	};
	timeline.addEventListener("focusin", onFocus);
	timeline.addEventListener("focusout", onBlur);
	offs.push(() => {
		timeline.removeEventListener("focusin", onFocus);
		timeline.removeEventListener("focusout", onBlur);
	});
	const lost = !document.activeElement || document.activeElement === document.body;
	if (state.focus && lost) timeline.querySelector(`[data-timeline-focus="${CSS.escape(state.focus)}"]`)?.focus({ preventScroll: true });

	return () => {
		for (const off of offs) off();
	};
}
