/**
 * The map of a Site, drawn the way the book does (p15): circles for features,
 * triangles for dangers, a diamond for treasure, solid, crossed and dotted
 * lines for open, closed and hidden routes, and a hollow arrow into each
 * entrance. Pure, so the drawing can be tested without Foundry.
 *
 * The Referee's map can be clicked. Each point, route and entrance says which
 * of the window's actions it takes and what it is, for screen readers. The
 * players' map shows only what playerView allows.
 *
 * Shapes carry their own paper and ink, so the map reads without the
 * stylesheet. The stylesheet adds what changes: hovering, the selection, and
 * what players can't see yet.
 */
import { POSITION_KEYS, SITE_EDGES, SITE_POSITIONS, markedPoints, playerView, routeSlots, siteEdge } from "./sites.js";
import { escapeHTML } from "./text.js";

/** Distance from the centre to each corner, in the drawing's units. */
const RADIUS = 120;

/** Half the side of the drawing, with room beyond the corners for entrance arrows. */
const HALF_VIEW = 200;

const PAPER = "#efe8d8";
const INK = "#231f1a";
const FAINT = "#8a7d6a";
const BLOOD = "#8b1e1e";

/** How far an entrance arrow's tip stops short of its point, clear of the largest shape. */
const ARROW_GAP = 30;
const ARROW_LENGTH = 40;
const ARROW_HEAD = 14;
const ARROW_SHAFT = 4.5;
const ARROW_BARB = 11;

/** Half the length of the tick across a closed route. */
const TICK = 12;

/** Radius of a feature's circle. The other shapes are sized to look as large. */
const SHAPE = 19;

/** The target a pointer has to hit: around a point, and either side of a route. */
const HIT_RADIUS = 28;
const HIT_WIDTH = 22;

const POSITIONS = new Map(SITE_POSITIONS.map((position) => [position.key, position]));

/**
 * @param {number} value
 * @returns {number} Rounded to a tenth, to keep the markup short.
 */
const round = (value) => Math.round(value * 10) / 10 || 0;

/**
 * @param {string} key A position.
 * @returns {{x: number, y: number}} Where it's drawn.
 */
export function sitePoint(key) {
	const { x, y } = POSITIONS.get(key);
	return { x: x * RADIUS, y: y * RADIUS };
}

/**
 * @param {string} key One of SITE_EDGES' keys.
 * @returns {{x: number, y: number}} The middle of that route.
 */
export function edgeMiddle(key) {
	const [a, b] = siteEdge(key).ends.map(sitePoint);
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * @param {{x: number, y: number}} at A place in the drawing.
 * @returns {{x: number, y: number}} The same place as percentages across and down the drawing.
 */
export const mapPercent = ({ x, y }) => ({ x: round(((x + HALF_VIEW) / (HALF_VIEW * 2)) * 100), y: round(((y + HALF_VIEW) / (HALF_VIEW * 2)) * 100) });

/**
 * @param {{x: number, y: number}[]} corners
 * @returns {string} The `points` attribute of a polygon.
 */
const polygon = (corners) => corners.map(({ x, y }) => `${round(x)},${round(y)}`).join(" ");

/**
 * @param {string} kind One of POINT_KINDS.
 * @param {{x: number, y: number}} centre
 * @param {number} [size] A feature circle's radius.
 * @returns {string}
 */
function shape(kind, { x, y }, size = SHAPE) {
	const className = "class=\"bastionland-site-map__shape\"";
	if (kind === "danger") {
		const high = size * 1.3;
		const across = high * Math.sqrt(3) / 2;
		return `<polygon ${className} points="${polygon([{ x, y: y - high }, { x: x + across, y: y + high / 2 }, { x: x - across, y: y + high / 2 }])}"/>`;
	}
	if (kind === "treasure") {
		const reach = size * 1.15;
		return `<polygon ${className} points="${polygon([{ x, y: y - reach }, { x: x + reach, y }, { x, y: y + reach }, { x: x - reach, y }])}"/>`;
	}
	return `<circle ${className} cx="${round(x)}" cy="${round(y)}" r="${size}"/>`;
}

/**
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @param {string} kind One of ROUTE_KINDS.
 * @returns {string} The line, with a tick across the middle of a closed route.
 */
function routeLines(a, b, kind) {
	const dotted = kind === "hidden" ? " stroke-dasharray=\"0.1 8\"" : "";
	let markup = `<line class="bastionland-site-map__line" x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(b.x)}" y2="${round(b.y)}"${dotted}/>`;
	if (kind === "closed") {
		const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
		const across = { x: (-(b.y - a.y) / length) * TICK, y: ((b.x - a.x) / length) * TICK };
		const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
		markup += `<line class="bastionland-site-map__line" x1="${round(middle.x - across.x)}" y1="${round(middle.y - across.y)}" x2="${round(middle.x + across.x)}" y2="${round(middle.y + across.y)}"/>`;
	}
	return markup;
}

/**
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @returns {string} A wide, unpainted line that takes the pointer for a thin one.
 */
const hitLine = (a, b) => `<line class="bastionland-site-map__hit" x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(b.x)}" y2="${round(b.y)}" stroke="transparent" stroke-width="${HIT_WIDTH}"/>`;

/**
 * The way an arrow comes into a point. Corners are entered from outside the
 * hexagon. The centre can't be reached from outside without crossing a route,
 * so its arrow comes in through an erased corner if there is one, or between
 * the top and upper left corners if not.
 * @param {string} key The entrance's position.
 * @param {string[]} erased Unmarked positions.
 * @returns {{x: number, y: number}} A unit vector pointing out from the point.
 */
function outward(key, erased) {
	if (key !== "centre") return POSITIONS.get(key);
	const corner = erased.find((position) => position !== "centre");
	if (corner) return POSITIONS.get(corner);
	return { x: -0.5, y: -Math.sqrt(3) / 2 };
}

/**
 * @param {{x: number, y: number}} point
 * @param {{x: number, y: number}} out Unit vector pointing away from the point.
 * @returns {{x: number, y: number}[]} The corners of a block arrow like the book's, pointing at the point.
 */
function arrowCorners(point, out) {
	const along = (distance, side = 0) => ({
		x: point.x + out.x * distance - out.y * side,
		y: point.y + out.y * distance + out.x * side
	});
	const tail = ARROW_GAP + ARROW_LENGTH;
	const neck = ARROW_GAP + ARROW_HEAD;
	return [
		along(tail, ARROW_SHAFT), along(neck, ARROW_SHAFT), along(neck, ARROW_BARB), along(ARROW_GAP),
		along(neck, -ARROW_BARB), along(neck, -ARROW_SHAFT), along(tail, -ARROW_SHAFT)
	];
}

/**
 * @typedef {object} SiteMapLabels Words for each part of the map, for screen readers.
 * @property {(point: {number: number, kind: string}) => string} point
 * @property {() => string} erased
 * @property {(route: {from: number, to: number, kind: string|null}) => string} route A null kind is a gap where a route could go.
 * @property {(entrance: {number: number, kind: string}) => string} entrance
 * @property {() => string} glimpsed
 */

/**
 * @typedef {object} SiteMapOptions
 * @property {string} title                    Names the map, such as "Map of Blackmoss Isle".
 * @property {SiteMapLabels} labels
 * @property {boolean} [players]               Draw only what players have found, and nothing to click.
 * @property {"draw"|"reveal"|null} [mode]     What clicking the Referee's map does, or null for a map that can't be clicked.
 * @property {{type: "point"|"route", key: string}|null} [selected] The part picked for drawing.
 * @property {string} [idPrefix]               Gives each clickable part an id, so focus can find it again after a redraw.
 */

/**
 * @param {string} tag
 * @param {object} options
 * @param {string} options.className
 * @param {Record<string, string>} options.data   `data-` attributes.
 * @param {string|null} options.action            The window action a click takes, or null for none.
 * @param {string} options.label
 * @param {string} [options.id]
 * @param {boolean} [options.pressed]             For a toggle, whether it's on.
 * @param {string} body
 * @returns {string} A group that's a button when it has an action.
 */
function part(tag, { className, data, action, label, id, pressed }, body) {
	const attributes = [`class="${className}"`, ...Object.entries(data).map(([name, value]) => `data-${name}="${escapeHTML(value)}"`)];
	if (action) {
		attributes.push(`data-action="${action}"`, "role=\"button\"", "tabindex=\"0\"", `aria-label="${escapeHTML(label)}"`);
		if (id) attributes.push(`id="${escapeHTML(id)}"`);
		if (pressed !== undefined) attributes.push(`aria-pressed="${pressed}"`);
	}
	return `<${tag} ${attributes.join(" ")}>${body}</${tag}>`;
}

/**
 * @param {...(string|false|null|undefined)} names
 * @returns {string}
 */
const classes = (...names) => names.filter(Boolean).join(" ");

/**
 * Draw a Site's map.
 * @param {import("./sites.js").Site} site
 * @param {SiteMapOptions} options
 * @returns {string} SVG markup.
 */
export function siteMap(site, { title, labels, players = false, mode = null, selected = null, idPrefix = "" }) {
	const draw = !players && mode === "draw";
	const reveal = !players && mode === "reveal";
	// Only the players' map and Reveal mode ask what's been found; drawing never does.
	const view = players || reveal ? playerView(site) : { points: [], routes: [], entrances: [], glimpsed: [] };
	const seen = {
		points: new Set(view.points.map(({ key }) => key)),
		routes: new Set(view.routes.map(({ key }) => key)),
		entrances: new Set(view.entrances.map(({ key }) => key))
	};
	const numberOf = (key) => site.points[key].number;
	const erased = POSITION_KEYS.filter((key) => !site.points[key].kind);
	const isSelected = (type, key) => selected?.type === type && selected.key === key;
	const idFor = (type, key) => (idPrefix ? `${idPrefix}-${type}-${key}` : undefined);

	// Gaps between marked neighbours, where the Referee can draw a route.
	const slots = !draw ? [] : routeSlots(site).filter(({ key }) => !site.routes[key].kind).map(({ key, ends }) => {
		const [a, b] = ends.map(sitePoint);
		const [from, to] = ends.map(numberOf).sort((x, y) => x - y);
		return part("g", {
			className: classes("bastionland-site-map__slot", isSelected("route", key) && "is-selected"),
			data: { route: key },
			action: "route",
			label: labels.route({ from, to, kind: null }),
			id: idFor("route", key)
		}, `<line class="bastionland-site-map__guide" x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(b.x)}" y2="${round(b.y)}" stroke="${FAINT}" stroke-dasharray="2 7" stroke-opacity="0.6"/>${hitLine(a, b)}`);
	});

	const routes = SITE_EDGES
		.filter(({ key }) => (players ? seen.routes.has(key) : site.routes[key].kind))
		.map(({ key, ends }) => {
			const { kind, found } = site.routes[key];
			const [a, b] = ends.map(sitePoint);
			const [from, to] = ends.map(numberOf).sort((x, y) => x - y);
			// Revealing only reaches hidden routes: players see the rest from either end.
			const action = draw || (reveal && kind === "hidden") ? "route" : null;
			return part("g", {
				className: classes("bastionland-site-map__route", isSelected("route", key) && "is-selected", reveal && !seen.routes.has(key) && "is-secret"),
				data: { route: key, kind },
				action,
				label: labels.route({ from, to, kind }),
				id: idFor("route", key),
				pressed: reveal && action ? found : undefined
			}, `${routeLines(a, b, kind)}${action ? hitLine(a, b) : ""}`);
		});

	// The book leaves an erased point faintly visible. Clicking one while drawing marks it.
	const faint = players ? [] : erased.map((key) => {
		const { x, y } = sitePoint(key);
		return part("g", {
			className: classes("bastionland-site-map__erased", isSelected("point", key) && "is-selected"),
			data: { point: key },
			action: draw ? "point" : null,
			label: labels.erased(),
			id: idFor("point", key)
		}, `<circle class="bastionland-site-map__shape" cx="${round(x)}" cy="${round(y)}" r="${SHAPE}"/>${draw ? `<circle class="bastionland-site-map__hit" cx="${round(x)}" cy="${round(y)}" r="${HIT_RADIUS}" fill="transparent" stroke="none"/>` : ""}`);
	});

	const entrances = markedPoints(site)
		.filter((key) => (players ? seen.entrances.has(key) : site.points[key].entrance))
		.map((key) => {
			const { entrance: kind, entranceFound } = site.points[key];
			const corners = arrowCorners(sitePoint(key), outward(key, erased));
			const dashed = kind === "hidden" ? " stroke-dasharray=\"4 3\"" : "";
			const action = draw ? "point" : reveal ? "entrance" : null;
			return part("g", {
				className: classes("bastionland-site-map__entrance", reveal && !seen.entrances.has(key) && "is-secret"),
				data: { point: key, kind },
				action,
				label: labels.entrance({ number: numberOf(key), kind }),
				id: idFor("entrance", key),
				pressed: reveal ? entranceFound : undefined
			}, `<polygon class="bastionland-site-map__shape" points="${polygon(corners)}"${dashed}/>`);
		});

	const glimpsed = !players ? [] : view.glimpsed.map((key) => {
		const { x, y } = sitePoint(key);
		return part("g", { className: "bastionland-site-map__glimpse", data: { point: key }, action: null, label: "" },
			`<title>${escapeHTML(labels.glimpsed())}</title>`
			+ `<circle class="bastionland-site-map__shape" cx="${round(x)}" cy="${round(y)}" r="${SHAPE}" stroke="${FAINT}" stroke-dasharray="3 4"/>`
			+ `<text class="bastionland-site-map__number" x="${round(x)}" y="${round(y)}" dominant-baseline="central" fill="${FAINT}" stroke="none">?</text>`);
	});

	const points = markedPoints(site)
		.filter((key) => !players || seen.points.has(key))
		.map((key) => {
			const { kind, number, found } = site.points[key];
			const centre = sitePoint(key);
			// The triangle is drawn around its centroid, so its number only nudges down a hair.
			const drop = kind === "danger" ? 2 : 0;
			const action = draw || reveal ? "point" : null;
			const halo = isSelected("point", key) ? `<circle class="bastionland-site-map__halo" cx="${round(centre.x)}" cy="${round(centre.y)}" r="${HIT_RADIUS + 4}" fill="none" stroke="${BLOOD}" stroke-width="2.5" stroke-dasharray="5 4"/>` : "";
			return part("g", {
				className: classes("bastionland-site-map__point", isSelected("point", key) && "is-selected", reveal && !found && "is-secret"),
				data: { point: key, kind },
				action,
				label: labels.point({ number, kind }),
				id: idFor("point", key),
				pressed: reveal ? found : undefined
			}, `${halo}${shape(kind, centre)}`
				+ `<text class="bastionland-site-map__number" x="${round(centre.x)}" y="${round(centre.y + drop)}" dominant-baseline="central" fill="${INK}" stroke="none">${number}</text>`
				+ (action ? `<circle class="bastionland-site-map__hit" cx="${round(centre.x)}" cy="${round(centre.y)}" r="${HIT_RADIUS}" fill="transparent" stroke="none"/>` : ""));
		});

	const modeClass = players ? "players" : mode ?? "still";
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" class="bastionland-site-map bastionland-site-map--${modeClass}" viewBox="${-HALF_VIEW} ${-HALF_VIEW} ${HALF_VIEW * 2} ${HALF_VIEW * 2}" role="${draw || reveal ? "group" : "img"}" aria-label="${escapeHTML(title)}">`,
		`<title>${escapeHTML(title)}</title>`,
		`<g class="bastionland-site-map__slots" fill="none" stroke-linecap="round">${slots.join("")}</g>`,
		`<g class="bastionland-site-map__routes" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round">${routes.join("")}</g>`,
		`<g class="bastionland-site-map__faint" fill="none" stroke="${FAINT}" stroke-opacity="0.5" stroke-width="1.5">${faint.join("")}</g>`,
		`<g class="bastionland-site-map__entrances" fill="${PAPER}" stroke="${INK}" stroke-width="2" stroke-linejoin="round">${entrances.join("")}</g>`,
		`<g class="bastionland-site-map__points" fill="${PAPER}" stroke="${INK}" stroke-width="2" stroke-linejoin="round" font-family="Georgia, 'Times New Roman', serif" font-size="18" text-anchor="middle">`,
		glimpsed.join(""),
		points.join(""),
		"</g>",
		"</svg>"
	].join("");
}

/** A small drawing of each kind, for buttons and lists beside the map. */
const GLYPHS = Object.freeze({
	points: Object.freeze({
		feature: "<circle cx=\"0\" cy=\"0\" r=\"7.5\"/>",
		danger: "<polygon points=\"0,-9 8.7,6 -8.7,6\"/>",
		treasure: "<polygon points=\"0,-9.5 9.5,0 0,9.5 -9.5,0\"/>"
	}),
	routes: Object.freeze({
		open: "<line x1=\"-10\" y1=\"0\" x2=\"10\" y2=\"0\"/>",
		closed: "<line x1=\"-10\" y1=\"0\" x2=\"10\" y2=\"0\"/><line x1=\"0\" y1=\"-6.5\" x2=\"0\" y2=\"6.5\"/>",
		hidden: "<line x1=\"-10\" y1=\"0\" x2=\"10\" y2=\"0\" stroke-dasharray=\"0.1 4.5\"/>"
	}),
	entrances: Object.freeze({
		open: "<polygon points=\"-2.5,-10 2.5,-10 2.5,0 6.5,0 0,9 -6.5,0 -2.5,0\"/>",
		hidden: "<polygon points=\"-2.5,-10 2.5,-10 2.5,0 6.5,0 0,9 -6.5,0 -2.5,0\" stroke-dasharray=\"4 3\"/>"
	})
});

/**
 * @param {string} group
 * @param {string} body
 * @returns {string} One glyph's markup.
 */
const glyphSvg = (group, body) => `<svg class="bastionland-site-glyph bastionland-site-glyph--${group}" viewBox="-12 -12 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

/** Every glyph's markup, built once: a sheet asks for dozens on each draw. */
const GLYPH_MARKUP = Object.freeze(Object.fromEntries(Object.entries(GLYPHS).map(([group, kinds]) => [
	group,
	Object.freeze(Object.fromEntries(Object.entries(kinds).map(([kind, body]) => [kind, glyphSvg(group, body)])))
])));

/**
 * @param {"points"|"routes"|"entrances"} group
 * @param {string} kind
 * @returns {string} A small inline SVG of the kind, hidden from screen readers, since a label always goes with it.
 */
export function kindGlyph(group, kind) {
	return GLYPH_MARKUP[group]?.[kind] ?? glyphSvg(group, "");
}
