import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hostState, wireTimeline } from "../../module/apps/timeline-scroll.js";

/**
 * A Timeline in a sheet's tab, going off the page and coming back: a tab
 * that isn't showing measures 0x0 and reads 0 both ways, and the reader should
 * find the board where they left it when they come back to it.
 */

const GUTTER_VARS = ["--timeline-gutter-x", "--timeline-gutter-y", "--timeline-gutter-top", "--timeline-gutter-left"];

let observers;

beforeEach(() => {
	observers = [];
	globalThis.ResizeObserver = class {
		constructor(fn) {
			this.fn = fn;
			this.targets = new Set();
			observers.push(this);
		}

		observe(target) {
			this.targets.add(target);
		}

		disconnect() {
			this.targets.clear();
		}
	};
	globalThis.innerWidth = 1920;
	globalThis.innerHeight = 1080;
	globalThis.document = { activeElement: null, body: {}, addEventListener() {}, removeEventListener() {} };
});

afterEach(() => {
	delete globalThis.ResizeObserver;
	delete globalThis.innerWidth;
	delete globalThis.innerHeight;
	delete globalThis.document;
});

/** An element's inline style, kept in `vars`. */
const styled = (vars) => ({
	setProperty: (name, value) => { vars[name] = value; },
	getPropertyValue: (name) => vars[name] ?? ""
});

/**
 * The board's scroll box, whose range grows with the room its canvas is padded by,
 * and which reads 0 both ways and takes no scroll while `hidden`.
 */
function scrollBox({ w = 400, h = 300, cw = 3000, ch = 1500 } = {}) {
	const vars = {};
	const ownVars = {};
	const canvas = { style: styled(vars), vars };
	const listeners = new Map();
	const room = (name) => Number.parseFloat(vars[name]) || 0;
	let left = 0;
	let top = 0;
	const box = {
		isConnected: true,
		hidden: false,
		clientLeft: 0,
		clientTop: 0,
		get clientWidth() { return box.hidden ? 0 : w; },
		get clientHeight() { return box.hidden ? 0 : h; },
		get offsetWidth() { return box.clientWidth; },
		get offsetHeight() { return box.clientHeight; },
		getBoundingClientRect: () => ({ left: 0, top: 0, width: box.clientWidth, height: box.clientHeight }),
		get scrollLeft() { return box.hidden ? 0 : left; },
		set scrollLeft(v) {
			if (!box.hidden) left = Math.min(Math.max(v, 0), Math.max(cw + room("--timeline-gutter-left") + room("--timeline-gutter-x") - w, 0));
		},
		get scrollTop() { return box.hidden ? 0 : top; },
		set scrollTop(v) {
			if (!box.hidden) top = Math.min(Math.max(v, 0), Math.max(ch + room("--timeline-gutter-top") + room("--timeline-gutter-y") - h, 0));
		},
		style: styled(ownVars),
		ownVars,
		canvas,
		classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
		querySelector: (selector) => (selector === ":scope > .bastionland-timeline__canvas" ? canvas : null),
		querySelectorAll: () => [],
		addEventListener: (type, fn) => listeners.set(type, fn),
		removeEventListener: (type) => listeners.delete(type),
		/** The reader scrolling it: the box moves, then tells its listeners. */
		scrollTo(x, y) {
			box.scrollLeft = x;
			box.scrollTop = y;
			listeners.get("scroll")?.({ currentTarget: box });
		}
	};
	return box;
}

/** A single thread's Timeline holding `box`, read across or down. */
function timelineAround(box, { across = true } = {}) {
	return {
		matches: (selector) => selector === ".bastionland-timeline",
		classList: { contains: (name) => across && name === "bastionland-timeline--across" },
		querySelector: (selector) => (selector === ".bastionland-timeline__scroll" ? box : null),
		querySelectorAll: () => [],
		addEventListener() {},
		removeEventListener() {},
		contains: () => false
	};
}

/** The box's size changing, as the browser tells every observer watching it. */
function resized(box) {
	for (const observer of observers) if (observer.targets.has(box)) observer.fn([{ target: box }]);
}

const gutterOf = (box) => Object.fromEntries(GUTTER_VARS.map((name) => [name, box.canvas.vars[name]]));

describe("a Timeline whose tab is hidden and shown again", () => {
	for (const across of [true, false]) {
		const layout = across ? "across" : "down";

		it(`keeps its room past the edges while hidden (${layout})`, () => {
			const box = scrollBox();
			const unwire = wireTimeline(timelineAround(box, { across }), hostState());
			box.scrollTo(333, 444);
			const room = gutterOf(box);
			expect(Number.parseFloat(room[across ? "--timeline-gutter-top" : "--timeline-gutter-left"])).toBeGreaterThan(0);
			// On the canvas alone: on the box, its whole board would inherit it and be styled again.
			expect(Object.keys(box.ownVars).filter((name) => GUTTER_VARS.includes(name))).toEqual([]);

			box.hidden = true;
			resized(box);
			expect(gutterOf(box)).toEqual(room);

			box.hidden = false;
			resized(box);
			expect(gutterOf(box)).toEqual(room);
			expect([box.scrollLeft, box.scrollTop]).toEqual([333, 444]);
			unwire();
		});

		it(`comes back where it was left when the tab wires it again (${layout})`, () => {
			const box = scrollBox();
			const timeline = timelineAround(box, { across });
			const state = hostState();
			let unwire = wireTimeline(timeline, state);
			box.scrollTo(333, 444);

			box.hidden = true;
			resized(box);
			box.hidden = false;
			unwire();
			unwire = wireTimeline(timeline, state);
			resized(box);
			expect([box.scrollLeft, box.scrollTop]).toEqual([333, 444]);
			unwire();
		});
	}
});
