/**
 * The Company's own chart of a Realm: every hex ruled faintly, and only those
 * it knows of drawn in. A hex it has been to takes its terrain's colour, one
 * only heard of is dashed round, and what was found there gets a small mark.
 * Built from the players' views alone, so it can't show what they don't
 * know. Pure, so it can be tested without Foundry.
 */
import { allHexes, directionNames, hexCentre, hexDistance, hexKey, hexVertices, parseHexKey } from "./realm-geometry.js";
import { TERRAIN } from "./realm.js";
import { escapeHTML } from "./text.js";

/**
 * @typedef {object} ChartPalette
 * @property {string} paper
 * @property {string} ink
 * @property {string} rule
 * @property {string} accent
 * @property {string[]} solid One colour per terrain, in TERRAIN order.
 */

/**
 * @typedef {object} ChartOptions
 * @property {ChartPalette} palette
 * @property {string} title                       What the chart is, for screen readers.
 * @property {(view: import("./travels.js").PlayerHexView) => string} label What a hex is, for its button and tooltip.
 * @property {string|null} [selected]             The key of the hex chosen.
 * @property {{col: number, row: number}[]|null} [route] The hexes come into, in the order they were, to draw the way between.
 * @property {import("./travels.js").PlayerHexView[]} [holdings] Holdings known but not otherwise on the chart, drawn on the faint grid.
 */

/** @param {number} value @returns {number} To a tenth of a pixel, which is all a drawing needs. */
const round = (value) => Math.round(value * 10) / 10;

/** @param {{x: number, y: number}[]} corners @returns {string} */
const points = (corners) => corners.map(({ x, y }) => `${round(x)},${round(y)}`).join(" ");

/**
 * @param {{x: number, y: number}} centre
 * @param {{x: number, y: number}[]} corners
 * @param {number} scale How far toward its corners each is drawn.
 * @returns {{x: number, y: number}[]}
 */
const shrunk = (centre, corners, scale) => corners.map(({ x, y }) => ({ x: centre.x + (x - centre.x) * scale, y: centre.y + (y - centre.y) * scale }));

/** How far toward its corners the ring round the chosen hex is drawn. */
const HALO_SCALE = 0.86;

/**
 * The ring round the chosen hex, worked out from the hex's outline as drawn,
 * so it can move to another hex without the whole chart being drawn again.
 * @param {string} outline A hex polygon's points, as the chart writes them.
 * @returns {string} The ring's points.
 */
export function haloPoints(outline) {
	const corners = String(outline ?? "").trim().split(/\s+/).map((pair) => {
		const [x, y] = pair.split(",").map(Number);
		return { x, y };
	});
	const centre = { x: corners.reduce((sum, { x }) => sum + x, 0) / corners.length, y: corners.reduce((sum, { y }) => sum + y, 0) / corners.length };
	return points(shrunk(centre, corners, HALO_SCALE));
}

/**
 * The small marks of what stands in a hex, each a shape centred on (0,0) and
 * one unit across, scaled to the hex where drawn.
 */
const GLYPHS = Object.freeze({
	// A tower with a battlement.
	holding: "M-0.5,0.5 L-0.5,-0.25 L-0.3,-0.25 L-0.3,-0.5 L-0.1,-0.5 L-0.1,-0.3 L0.1,-0.3 L0.1,-0.5 L0.3,-0.5 L0.3,-0.25 L0.5,-0.25 L0.5,0.5 Z",
	// A five-pointed star.
	myth: "M0,-0.55 L0.13,-0.18 L0.52,-0.17 L0.21,0.07 L0.32,0.45 L0,0.22 L-0.32,0.45 L-0.21,0.07 L-0.52,-0.17 L-0.13,-0.18 Z",
	// A standing stone.
	landmark: "M0,-0.55 L0.48,0.45 L-0.48,0.45 Z",
	// A pennant on its staff.
	company: "M-0.3,0.55 L-0.3,-0.55 L0.45,-0.3 L-0.3,-0.05"
});

/** How thick a mark's outline is, in its own units, which are scaled with it. */
const GLYPH_PEN = 0.15;

/**
 * @param {string} kind A key of GLYPHS.
 * @param {{x: number, y: number}} at
 * @param {number} size
 * @param {string} fill
 * @param {string} ink The outline's colour.
 * @returns {string}
 */
const glyph = (kind, at, size, fill, ink) => `<path class="bastionland-travels-chart__glyph bastionland-travels-chart__glyph--${kind}" d="${GLYPHS[kind]}" transform="translate(${round(at.x)} ${round(at.y)}) scale(${round(size)})" fill="${fill}" stroke="${ink}" stroke-width="${GLYPH_PEN}" stroke-linejoin="round"/>`;

/**
 * @param {import("./travels.js").PlayerHexView} view
 * @returns {string[]} The marks a hex shows, in the order they stand left to right.
 */
const marksOf = (view) => [view.holding && "holding", view.myth && "myth", view.landmark && "landmark"].filter(Boolean);

/**
 * The lines of the way the Company went, broken wherever it went further than
 * the next hex, as a Token picked up and put down elsewhere does.
 * @param {object} g
 * @param {{col: number, row: number}[]} route
 * @returns {string[]} One `points` list per unbroken stretch.
 */
export function routeStretches(g, route) {
	const stretches = [];
	let stretch = [];
	let last = null;
	for (const hex of route ?? []) {
		if (last && hexDistance(g, last, hex) !== 1) {
			if (stretch.length > 1) stretches.push(stretch);
			stretch = [];
		}
		stretch.push(hexCentre(g, hex));
		last = hex;
	}
	if (stretch.length > 1) stretches.push(stretch);
	return stretches.map(points);
}

/**
 * Draw the chart.
 * @param {import("./travels.js").PlayerHexView[]} views Every hex the players may open.
 * @param {object} g From realmGeometry.
 * @param {ChartOptions} options
 * @returns {string} SVG markup.
 */
export function travelsChart(views, g, { palette, title, label, selected = null, route = null, holdings = [] }) {
	const known = new Map(views.map((view) => [view.key, view]));
	const sides = directionNames(g);
	const r = g.radius;
	const pen = round(r * 0.06);

	// Every hex ruled faintly, so the known ones are seen where they lie.
	const grid = allHexes(g).filter((hex) => !known.has(hexKey(hex))).map((hex) => `<polygon points="${points(hexVertices(g, hex))}"/>`);

	const hexes = views.map((view) => {
		const centre = hexCentre(g, view.hex);
		const corners = hexVertices(g, view.hex);
		const visited = Boolean(view.visits);
		const terrain = TERRAIN.indexOf(view.terrain);
		// A hex reached whose terrain the GM hid still shows it was reached, in the rule's colour.
		const fill = !visited ? palette.paper : terrain >= 0 ? palette.solid[terrain] : palette.rule;
		const name = label(view);
		const parts = [
			`<title>${escapeHTML(name)}</title>`,
			`<polygon class="bastionland-travels-chart__hex" points="${points(corners)}" fill="${fill}" stroke="${palette.ink}" stroke-width="${pen}" stroke-opacity="${visited ? 0.55 : 0.75}"${visited ? "" : ` stroke-dasharray="${round(r * 0.18)} ${round(r * 0.12)}"`}/>`
		];
		// The Barriers it's known to have, along the edges they close.
		const closed = new Set([...view.barriers, ...view.met.map((met) => met.direction)]);
		for (const side of closed) {
			const direction = sides.indexOf(side);
			if (direction < 0) continue;
			const [from, to] = [corners[direction], corners[(direction + 1) % 6]];
			parts.push(`<line class="bastionland-travels-chart__barrier" x1="${round(from.x)}" y1="${round(from.y)}" x2="${round(to.x)}" y2="${round(to.y)}" stroke="${palette.accent}" stroke-width="${round(r * 0.14)}" stroke-linecap="round"/>`);
		}
		// Something seen from afar there, not yet reached: a dotted ring.
		if (!visited && view.sighted) parts.push(`<circle class="bastionland-travels-chart__sighted" cx="${round(centre.x)}" cy="${round(centre.y)}" r="${round(r * 0.32)}" fill="none" stroke="${palette.ink}" stroke-width="${pen}" stroke-dasharray="${round(r * 0.06)} ${round(r * 0.1)}"/>`);
		const marks = marksOf(view);
		const step = r * 0.52;
		marks.forEach((kind, index) => {
			const at = { x: centre.x + (index - (marks.length - 1) / 2) * step, y: centre.y };
			const seat = kind === "holding" && view.holding.seat;
			parts.push(glyph(kind, at, r * 0.42, seat ? palette.accent : kind === "holding" ? palette.ink : palette.paper, palette.ink));
		});
		// What the Referee told, or the Company wrote, a dot high on the hex.
		if (view.told.length) parts.push(`<circle class="bastionland-travels-chart__told" cx="${round(centre.x + r * 0.3)}" cy="${round(centre.y - r * 0.55)}" r="${round(r * 0.11)}" fill="${palette.accent}"/>`);
		if (view.party) parts.push(`<circle class="bastionland-travels-chart__noted" cx="${round(centre.x - r * 0.3)}" cy="${round(centre.y - r * 0.55)}" r="${round(r * 0.11)}" fill="${palette.paper}" stroke="${palette.ink}" stroke-width="${pen}"/>`);
		if (view.here) {
			// Under what stands there, or in the middle of an empty hex.
			const at = { x: centre.x, y: centre.y + r * (marks.length ? 0.52 : 0) };
			const size = r * (marks.length ? 0.36 : 0.5);
			parts.push(glyph("company", at, size, palette.accent, palette.ink));
		}
		if (view.key === selected) parts.push(`<polygon class="bastionland-travels-chart__halo" points="${points(shrunk(centre, corners, HALO_SCALE))}" fill="none" stroke="${palette.accent}" stroke-width="${round(r * 0.1)}" stroke-dasharray="${round(r * 0.22)} ${round(r * 0.14)}"/>`);
		const classes = ["bastionland-travels-chart__place", visited ? "is-visited" : "is-heard", view.here && "is-here", view.key === selected && "is-selected"].filter(Boolean).join(" ");
		return `<g class="${classes}" data-hex="${view.key}" data-action="pickTravelsHex" role="button" tabindex="0" aria-label="${escapeHTML(name)}"${view.key === selected ? " aria-current=\"true\"" : ""}>${parts.join("")}</g>`;
	});

	// A Holding known but never reached: its mark alone on the faint grid, named on hover.
	const afar = holdings.filter((view) => view.holding && !known.has(view.key)).map((view) => {
		const name = label(view);
		const fill = view.holding.seat ? palette.accent : palette.ink;
		return `<g class="bastionland-travels-chart__afar" data-hex="${view.key}" data-tags="holding"><title>${escapeHTML(name)}</title>${glyph("holding", hexCentre(g, view.hex), r * 0.42, fill, palette.ink)}</g>`;
	});

	const way = route?.length ? routeStretches(g, route).map((list) => `<polyline points="${list}"/>`) : [];
	const margin = round(r * 0.2);
	return [
		// The paper fills the whole box, so a chart held to the page's height has paper either side, not the page.
		`<svg xmlns="http://www.w3.org/2000/svg" class="bastionland-travels-chart__svg" viewBox="${-margin} ${-margin} ${round(g.width + margin * 2)} ${round(g.height + margin * 2)}" style="background: ${palette.paper}" role="group" aria-label="${escapeHTML(title)}">`,
		`<g class="bastionland-travels-chart__grid" fill="none" stroke="${palette.rule}" stroke-width="${pen}" stroke-opacity="0.6" aria-hidden="true">${grid.join("")}</g>`,
		afar.length ? `<g class="bastionland-travels-chart__holdings">${afar.join("")}</g>` : "",
		`<g class="bastionland-travels-chart__places">${hexes.join("")}</g>`,
		way.length ? `<g class="bastionland-travels-chart__route" fill="none" stroke="${palette.ink}" stroke-width="${round(r * 0.09)}" stroke-opacity="0.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${round(r * 0.02)} ${round(r * 0.2)}" pointer-events="none" aria-hidden="true">${way.join("")}</g>` : "",
		"</svg>"
	].join("");
}

/** The marks the chart's key explains, in the order it lists them. */
export const LEGEND_KINDS = Object.freeze(["visited", "heardOf", "holding", "seat", "myth", "landmark", "told", "noted", "company", "barrier"]);

/**
 * A small drawing of one of the chart's marks, for its key.
 * @param {string} kind One of LEGEND_KINDS.
 * @param {ChartPalette} palette
 * @returns {string} SVG markup, hidden from screen readers, since a label always goes with it.
 */
export function legendGlyph(kind, palette) {
	const hex = "-0.9,0 -0.45,-0.78 0.45,-0.78 0.9,0 0.45,0.78 -0.45,0.78";
	const outline = `fill="${palette.paper}" stroke="${palette.ink}" stroke-width="0.12"`;
	const markOutline = `fill="${palette.paper}" stroke="${palette.ink}" stroke-width="${GLYPH_PEN}"`;
	const body = {
		visited: `<polygon points="${hex}" fill="${palette.solid[TERRAIN.indexOf("forest")]}" stroke="${palette.ink}" stroke-width="0.08" stroke-opacity="0.55"/>`,
		heardOf: `<polygon points="${hex}" ${outline} stroke-dasharray="0.25 0.15"/>`,
		holding: `<path d="${GLYPHS.holding}" transform="scale(1.4)" fill="${palette.ink}" stroke="${palette.ink}" stroke-width="${GLYPH_PEN}"/>`,
		seat: `<path d="${GLYPHS.holding}" transform="scale(1.4)" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="${GLYPH_PEN}"/>`,
		myth: `<path d="${GLYPHS.myth}" transform="scale(1.5)" ${markOutline}/>`,
		landmark: `<path d="${GLYPHS.landmark}" transform="scale(1.4)" ${markOutline}/>`,
		told: `<circle r="0.35" fill="${palette.accent}"/>`,
		noted: `<circle r="0.35" ${outline}/>`,
		company: `<path d="${GLYPHS.company}" transform="scale(1.4)" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="${GLYPH_PEN}" stroke-linejoin="round"/>`,
		barrier: `<line x1="-0.8" y1="0" x2="0.8" y2="0" stroke="${palette.accent}" stroke-width="0.3" stroke-linecap="round"/>`
	}[kind] ?? "";
	return `<svg class="bastionland-travels-chart__key" viewBox="-1 -1 2 2" aria-hidden="true" focusable="false">${body}</svg>`;
}

/**
 * @param {object} journey
 * @returns {{col: number, row: number}[]} Every hex come into, in the order it was, once for each time.
 */
export function routeOf(journey) {
	return Object.entries(journey?.hexes ?? {})
		.flatMap(([key, visits]) => visits.arrivals.map((arrival) => ({ hex: parseHexKey(key), order: arrival.order })))
		.filter(({ hex }) => hex)
		.sort((a, b) => a.order - b.order)
		.map(({ hex }) => hex);
}

/**
 * How far to scroll a pane down so a hex of the chart is in view: nothing
 * while it's whole in view already, else enough to bring it to the middle.
 * @param {{top: number, bottom: number}} place The hex, on screen.
 * @param {{top: number, bottom: number}} pane What scrolls, on screen.
 * @returns {number} Pixels, below 0 to scroll up.
 */
export function chartScrollBy(place, pane) {
	if (place.top >= pane.top && place.bottom <= pane.bottom) return 0;
	return Math.round((place.top + place.bottom) / 2 - (pane.top + pane.bottom) / 2);
}

/* -------------------------------------------- */
/*  Zooming the chart                           */
/* -------------------------------------------- */

/**
 * The part of the chart shown, in the chart's own units, as an SVG viewBox.
 * @typedef {object} ChartBox
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/** How close the chart can be brought: a sixth of its width across the page. */
export const CHART_MAX_ZOOM = 6;

/** How much one notch of the wheel brings the chart closer, or takes it away. */
export const CHART_ZOOM_STEP = 1.2;

/**
 * @param {string|null|undefined} text An SVG viewBox attribute.
 * @returns {ChartBox|null}
 */
export function parseChartBox(text) {
	const [x, y, width, height] = String(text ?? "").trim().split(/[\s,]+/).map(Number);
	return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0 ? { x, y, width, height } : null;
}

/**
 * @param {ChartBox} box
 * @returns {string} The box as an SVG viewBox attribute.
 */
export const chartBoxText = (box) => [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 1000) / 1000).join(" ");

/**
 * A box kept to the chart: no larger than the whole of it nor closer than
 * CHART_MAX_ZOOM, the chart's own shape, and never past its edges.
 * @param {ChartBox} whole The chart's own viewBox.
 * @param {ChartBox} box
 * @returns {ChartBox}
 */
export function clampChartBox(whole, box) {
	const width = Math.min(whole.width, Math.max(whole.width / CHART_MAX_ZOOM, box.width));
	const height = (whole.height * width) / whole.width;
	return {
		x: Math.min(Math.max(box.x, whole.x), whole.x + whole.width - width),
		y: Math.min(Math.max(box.y, whole.y), whole.y + whole.height - height),
		width,
		height
	};
}

/**
 * @param {ChartBox} whole
 * @param {ChartBox} box
 * @returns {boolean} Whether the box shows less than the whole chart.
 */
export const chartZoomed = (whole, box) => box.width < whole.width * 0.999;

/**
 * The box once the chart is brought closer or taken away about a point, the
 * point staying where it was on the page.
 * @param {ChartBox} whole
 * @param {ChartBox} box What's shown now.
 * @param {number} factor Above 1 brings it closer.
 * @param {{x: number, y: number}} at In the chart's units.
 * @returns {ChartBox}
 */
export function zoomChartBox(whole, box, factor, at) {
	const width = clampChartBox(whole, { ...box, width: box.width / factor }).width;
	const scale = width / box.width;
	return clampChartBox(whole, { x: at.x - (at.x - box.x) * scale, y: at.y - (at.y - box.y) * scale, width, height: box.height * scale });
}

/**
 * The box dragged by so much of the chart, the drawing following the pointer.
 * @param {ChartBox} whole
 * @param {ChartBox} box Where the drag began.
 * @param {number} dx In the chart's units, rightwards.
 * @param {number} dy Downwards.
 * @returns {ChartBox}
 */
export const panChartBox = (whole, box, dx, dy) => clampChartBox(whole, { ...box, x: box.x - dx, y: box.y - dy });

/**
 * The box moved to hold a point of the chart, where it doesn't already.
 * @param {ChartBox} whole
 * @param {ChartBox} box
 * @param {{x: number, y: number}} at
 * @returns {ChartBox} The same box while the point is in it, else one centred on it.
 */
export function chartBoxHolding(whole, box, at) {
	const inside = at.x >= box.x && at.x <= box.x + box.width && at.y >= box.y && at.y <= box.y + box.height;
	return inside ? box : clampChartBox(whole, { ...box, x: at.x - box.width / 2, y: at.y - box.height / 2 });
}

/** How much closer a double-click on the whole chart brings it. */
export const CHART_DOUBLE_CLICK_ZOOM = 3;

/**
 * How far one turn of the wheel brings the chart closer. A mouse's notch is
 * a step; a trackpad's small turns make part of one, and a wheel spun freely
 * goes no more than a step a turn, so the chart doesn't leap past where it was wanted.
 * @param {number} deltaY From the wheel event, below 0 turned away from the reader.
 * @param {number} [deltaMode] 0 for pixels, 1 for lines, 2 for pages.
 * @returns {number} Above 1 to bring it closer, 1 for no turn.
 */
export function wheelZoomFactor(deltaY, deltaMode = 0) {
	const perNotch = [100, 3, 1][deltaMode] ?? 100;
	const notches = Math.max(-1, Math.min(1, (Number(deltaY) || 0) / perNotch));
	return CHART_ZOOM_STEP ** -notches;
}
