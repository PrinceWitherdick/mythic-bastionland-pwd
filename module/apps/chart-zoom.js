import {
	CHART_DOUBLE_CLICK_ZOOM, chartBoxHolding, chartBoxText, chartZoomed, clampChartBox, panChartBox, parseChartBox, wheelZoomFactor, zoomChartBox
} from "../rules/travels-chart.js";
import { wirePanDrag } from "./pan-drag.js";

/**
 * The Company's chart handled as Stonetop's relationship map is: Ctrl and
 * the wheel bring it closer about the pointer; once it's closer, either button drags
 * it about, and a flick slides it on a little; a double-click on its paper
 * brings it closer there, or shows it whole again. The chart is drawn in
 * lines, so only its viewBox changes and it stays sharp.
 */

/** @type {WeakMap<SVGSVGElement, (at: {x: number, y: number}) => void>} Each chart's way of bringing a point of it into view. */
const holders = new WeakMap();

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

	const paint = (next) => {
		// Drawn again, the old chart's drag and slide are over, and the new one keeps the state.
		if (!svg.isConnected) return;
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

	/* Dragging, once it's closer, and sliding on after a throw */

	const drag = wirePanDrag(svg, {
		draggingClass: "is-dragging",
		grab: () => (chartZoomed(whole, box) ? box : null),
		pan(from, dx, dy) {
			const scale = perPixel();
			if (scale) paint(panChartBox(whole, from, dx * scale, dy * scale));
		},
		slide(dx, dy) {
			const scale = perPixel();
			if (!scale) return null;
			const from = box;
			paint(panChartBox(whole, from, dx * scale, dy * scale));
			return { x: Math.abs(box.x - (from.x - dx * scale)) > 1e-6, y: Math.abs(box.y - (from.y - dy * scale)) > 1e-6 };
		}
	});

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
		drag.stop();
		paint(zoomChartBox(whole, box, factor, at));
		// A drag under way carries on from the chart as the zoom left it.
		drag.rebase(box);
	}, { passive: false });

	svg.addEventListener("dblclick", (event) => {
		if (event.target.closest(".bastionland-travels-chart__place")) return;
		drag.stop();
		if (chartZoomed(whole, box)) return paint(whole);
		const at = onChart(event);
		if (at) paint(zoomChartBox(whole, box, CHART_DOUBLE_CLICK_ZOOM, at));
	});

	button?.addEventListener("click", () => {
		drag.stop();
		paint(whole);
	});

	holders.set(svg, (at) => {
		drag.stop();
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
