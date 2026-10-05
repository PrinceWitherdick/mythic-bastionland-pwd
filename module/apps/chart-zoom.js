import { reducesMotion } from "../client-settings.js";
import { GLIDE_WINDOW_MS, glideStep, throwVelocity, worthGliding } from "../rules/glide.js";
import {
	CHART_DOUBLE_CLICK_ZOOM, chartBoxHolding, chartBoxText, chartZoomed, clampChartBox, panChartBox, parseChartBox, wheelZoomFactor, zoomChartBox
} from "../rules/travels-chart.js";

/**
 * The Company's chart handled as Stonetop's relationship map is: Ctrl and
 * the wheel bring it closer about the pointer; once it's closer, either button drags
 * it about, and a flick slides it on a little; a double-click on its paper
 * brings it closer there, or shows it whole again. The chart is drawn in
 * lines, so only its viewBox changes and it stays sharp.
 */

/** How far, in pixels, a press moves before it drags the chart rather than choosing a hex. */
const DRAG_FROM = 4;

/** @type {WeakMap<SVGSVGElement, (at: {x: number, y: number}) => void>} Each chart's way of bringing a point of it into view. */
const holders = new WeakMap();

/** @returns {number} The clock a drag's trail and a slide are timed on. */
const now = () => performance.now();

/**
 * Let a chart be zoomed and dragged, keeping where it was brought to in the
 * list's state, so a chart drawn again for the same Realm opens there.
 * @param {HTMLElement} list The list holding the chart.
 * @param {{zoom?: {realm: string|null, box: import("../rules/travels-chart.js").ChartBox}|null}} state
 */
export function wireChartZoom(list, state) {
	const svg = list.querySelector(".bastionland-travels-chart__svg");
	const whole = parseChartBox(svg?.getAttribute("viewBox"));
	if (!whole) return;
	const page = svg.closest("[data-view]") ?? list;
	const button = page.querySelector("[data-travels-whole]");
	const hint = page.querySelector(".bastionland-travels-chart__hint");
	const realm = list.dataset.sceneId ?? null;
	let box = whole;
	/** @type {{id: number, x: number, y: number, lastX: number, lastY: number, box: object, moving: boolean, right: boolean}|null} */
	let press = null;
	/** @type {{t: number, x: number, y: number}[]} The end of a drag's trail, for how hard it was thrown. */
	let marks = [];
	/** The frame a drag's paint waits on, so many moves make one paint. */
	let frame = 0;
	/** @type {{velocity: {x: number, y: number}, at: number, id: number}|null} */
	let glide = null;
	/** Whether the next click ends a drag, or caught a sliding chart, rather than choosing a hex. */
	let swallow = false;

	const stopGlide = () => {
		const running = Boolean(glide);
		if (glide) cancelAnimationFrame(glide.id);
		glide = null;
		return running;
	};

	const paint = (next) => {
		// Drawn again, the old chart's drag and slide are over, and the new one keeps the state.
		if (!svg.isConnected) {
			stopGlide();
			return;
		}
		box = next;
		const zoomed = chartZoomed(whole, box);
		state.zoom = zoomed ? { realm, box } : null;
		svg.setAttribute("viewBox", chartBoxText(box));
		svg.classList.toggle("is-zoomed", zoomed);
		if (button) button.hidden = !zoomed;
		if (hint) hint.hidden = zoomed;
	};
	paint(state.zoom?.realm === realm && state.zoom.box ? clampChartBox(whole, state.zoom.box) : whole);

	/** @returns {number|null} How much of the chart one pixel of the page is. */
	const perPixel = () => {
		const matrix = svg.getScreenCTM();
		return matrix?.a ? 1 / matrix.a : null;
	};

	/** @returns {{x: number, y: number}|null} Where a point of the page falls on the chart. */
	const onChart = (event) => {
		const matrix = svg.getScreenCTM();
		if (!matrix) return null;
		const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
		return { x: point.x, y: point.y };
	};

	/* Sliding on after a throw */

	const glideFrame = () => {
		if (!glide) return;
		const scale = perPixel();
		if (!scale || !svg.isConnected) {
			glide = null;
			return;
		}
		const t = now();
		const { dx, dy, velocity } = glideStep(glide.velocity, t - glide.at);
		glide.at = t;
		glide.velocity = velocity;
		const from = box;
		paint(panChartBox(whole, from, dx * scale, dy * scale));
		// Stopped by an edge, it slides on along it, or stops.
		if (Math.abs(box.x - (from.x - dx * scale)) > 1e-6) glide.velocity.x = 0;
		if (Math.abs(box.y - (from.y - dy * scale)) > 1e-6) glide.velocity.y = 0;
		if (worthGliding(glide.velocity)) glide.id = requestAnimationFrame(glideFrame);
		else glide = null;
	};

	const startGlide = (velocity) => {
		if (!worthGliding(velocity) || reducesMotion()) return;
		glide = { velocity, at: now(), id: 0 };
		glide.id = requestAnimationFrame(glideFrame);
	};

	/* Dragging */

	const mark = (event) => {
		const t = now();
		marks.push({ t, x: event.clientX, y: event.clientY });
		while (marks.length > 2 && t - marks[0].t > GLIDE_WINDOW_MS) marks.shift();
	};

	const dragPaint = () => {
		const scale = perPixel();
		if (press?.moving && scale) paint(panChartBox(whole, press.box, (press.lastX - press.x) * scale, (press.lastY - press.y) * scale));
	};

	svg.addEventListener("pointerdown", (event) => {
		// Any press stops a sliding chart, and the click a left one makes chooses nothing.
		swallow = stopGlide() && event.button === 0;
		const right = event.button === 2;
		if ((event.button !== 0 && !right) || event.buttons > 2 || press || !chartZoomed(whole, box)) return;
		press = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, box, moving: false, right };
		marks = [{ t: now(), x: event.clientX, y: event.clientY }];
	});

	svg.addEventListener("pointermove", (event) => {
		if (press?.id !== event.pointerId) return;
		press.lastX = event.clientX;
		press.lastY = event.clientY;
		mark(event);
		if (!press.moving) {
			if (Math.hypot(press.lastX - press.x, press.lastY - press.y) < DRAG_FROM) return;
			press.moving = true;
			svg.setPointerCapture(event.pointerId);
			svg.classList.add("is-dragging");
		}
		frame ||= requestAnimationFrame(() => {
			frame = 0;
			dragPaint();
		});
	});

	const release = (event) => {
		if (press?.id !== event.pointerId) return;
		// Where it was let go, not a frame behind.
		if (frame) {
			cancelAnimationFrame(frame);
			frame = 0;
			dragPaint();
		}
		const { moving, right } = press;
		press = null;
		svg.classList.remove("is-dragging");
		if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
		// Taken away rather than let go, there's no click to come and no throw.
		if (event.type === "pointercancel") {
			swallow = false;
			marks = [];
			return;
		}
		if (!moving) return;
		// A drag isn't a click on the hex it was let go over; a right drag makes no click.
		if (!right) swallow = true;
		mark(event);
		startGlide(throwVelocity(marks, now()));
		marks = [];
	};
	svg.addEventListener("pointerup", release);
	svg.addEventListener("pointercancel", release);

	svg.addEventListener("click", (event) => {
		if (!swallow) return;
		swallow = false;
		// A press let go off the chart makes no click, so the flag outlives it: a hex chosen by its key still goes through.
		if (event.detail === 0) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	}, { capture: true });

	// The right button drags, so the browser's menu stays shut over the chart.
	svg.addEventListener("contextmenu", (event) => event.preventDefault());

	/* The wheel, a double-click and the Whole chart button */

	svg.addEventListener("wheel", (event) => {
		// Without Ctrl (Cmd on a Mac) the wheel scrolls the page past the chart; a trackpad's pinch comes with Ctrl.
		if (!event.ctrlKey && !event.metaKey) return;
		const at = onChart(event);
		if (!at) return;
		// Held with Ctrl the wheel zooms the browser, so over the chart it's the chart's even when it can go no further out.
		event.preventDefault();
		const factor = wheelZoomFactor(event.deltaY, event.deltaMode);
		if (factor === 1 || (factor < 1 && !chartZoomed(whole, box))) return;
		stopGlide();
		paint(zoomChartBox(whole, box, factor, at));
		// A drag under way carries on from the chart as the zoom left it.
		if (press) Object.assign(press, { x: press.lastX, y: press.lastY, box });
	}, { passive: false });

	svg.addEventListener("dblclick", (event) => {
		if (event.target.closest(".bastionland-travels-chart__place")) return;
		stopGlide();
		if (chartZoomed(whole, box)) return paint(whole);
		const at = onChart(event);
		if (at) paint(zoomChartBox(whole, box, CHART_DOUBLE_CLICK_ZOOM, at));
	});

	button?.addEventListener("click", () => {
		stopGlide();
		paint(whole);
	});

	holders.set(svg, (at) => {
		stopGlide();
		paint(chartBoxHolding(whole, box, at));
	});
}

/**
 * Move a zoomed chart so a hex of it is in view, where it isn't already.
 * @param {SVGGraphicsElement} place A hex of the chart.
 */
export function holdChartPlace(place) {
	const hold = holders.get(place.ownerSVGElement);
	if (!hold) return;
	const { x, y, width, height } = place.getBBox();
	hold({ x: x + width / 2, y: y + height / 2 });
}
