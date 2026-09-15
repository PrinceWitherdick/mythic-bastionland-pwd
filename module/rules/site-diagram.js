/**
 * Draw a Site the way the book does (p15): circles for features, triangles for
 * dangers, a diamond for treasure, solid, crossed and dotted lines for open,
 * closed and hidden routes, and a hollow arrow into each entrance. Pure, so the
 * drawing can be tested without Foundry.
 *
 * The drawing paints its own parchment and uses no outside CSS, because
 * Foundry keeps only the tags in CONST.ALLOWED_HTML_TAGS when it saves chat
 * messages and Journal pages. <svg> isn't one, so those get the drawing as an
 * image's data URI instead.
 */
import { SITE_POSITIONS } from "./sites.js";
import { escapeHTML } from "./text.js";

/** Distance from the centre to each corner. */
const RADIUS = 90;

/** Half the width of the drawing, with room for arrows outside the corners. */
const HALF_VIEW = 160;

/** Side of the drawing in pixels when nothing else sizes it. */
export const SITE_DIAGRAM_SIZE = HALF_VIEW * 2;

const PAPER = "#efe8d8";
const INK = "#231f1a";
const FAINT = "#8a7d6a";

/** How far an entrance arrow's tip stops short of its point, clear of the largest shape. */
const ARROW_GAP = 28;
const ARROW_LENGTH = 34;
const ARROW_HEAD = 12;
const ARROW_SHAFT = 3.5;
const ARROW_BARB = 9;

/** Half the length of the tick across a closed route. */
const TICK = 10;

const POSITIONS = new Map(SITE_POSITIONS.map((position) => [position.key, position]));

/**
 * @param {number} value
 * @returns {number} Rounded to a tenth, to keep the markup short.
 */
const round = (value) => Math.round(value * 10) / 10 || 0;

/**
 * @param {string} key One of SITE_POSITIONS' keys.
 * @returns {{x: number, y: number}} Where it's drawn.
 */
function at(key) {
	const { x, y } = POSITIONS.get(key);
	return { x: x * RADIUS, y: y * RADIUS };
}

/**
 * @param {{x: number, y: number}[]} corners
 * @returns {string} The `points` attribute of a polygon.
 */
const polygon = (corners) => corners.map(({ x, y }) => `${round(x)},${round(y)}`).join(" ");

/**
 * @param {string} kind One of POINT_KINDS.
 * @param {{x: number, y: number}} centre
 * @returns {string} The shape's markup, and how far down its number sits so it looks centred.
 */
function shape(kind, { x, y }) {
	if (kind === "danger") {
		const across = 24 * Math.sqrt(3) / 2;
		return `<polygon points="${polygon([{ x, y: y - 24 }, { x: x + across, y: y + 12 }, { x: x - across, y: y + 12 }])}"/>`;
	}
	if (kind === "treasure") {
		return `<polygon points="${polygon([{ x, y: y - 21 }, { x: x + 21, y }, { x, y: y + 21 }, { x: x - 21, y }])}"/>`;
	}
	return `<circle cx="${round(x)}" cy="${round(y)}" r="16"/>`;
}

/**
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @param {string} kind One of ROUTE_KINDS.
 * @returns {string}
 */
function route(a, b, kind) {
	const dotted = kind === "hidden" ? " stroke-dasharray=\"0.1 7\"" : "";
	let markup = `<line x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(b.x)}" y2="${round(b.y)}"${dotted}/>`;
	if (kind === "closed") {
		const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
		const across = { x: (-(b.y - a.y) / length) * TICK, y: ((b.x - a.x) / length) * TICK };
		const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
		markup += `<line x1="${round(middle.x - across.x)}" y1="${round(middle.y - across.y)}" x2="${round(middle.x + across.x)}" y2="${round(middle.y + across.y)}"/>`;
	}
	return `<g data-route="${kind}">${markup}</g>`;
}

/**
 * The way an arrow comes into a point. Corners are entered from outside the
 * hexagon. The centre can't be reached from outside without crossing a route,
 * so its arrow comes in through an erased corner if there is one, or between
 * the top and upper left corners if not.
 * @param {string} key The entrance's position.
 * @param {string[]} erased
 * @returns {{x: number, y: number}} A unit vector pointing out from the point.
 */
function outward(key, erased) {
	if (key !== "centre") return POSITIONS.get(key);
	const corner = erased.find((position) => position !== "centre");
	if (corner) return POSITIONS.get(corner);
	return { x: -0.5, y: -Math.sqrt(3) / 2 };
}

/**
 * A hollow block arrow like the book's, dashed for a hidden entrance.
 * @param {{x: number, y: number}} point
 * @param {{x: number, y: number}} out Unit vector pointing away from the point.
 * @param {boolean} hidden
 * @returns {string}
 */
function arrow(point, out, hidden) {
	const along = (distance, side = 0) => ({
		x: point.x + out.x * distance - out.y * side,
		y: point.y + out.y * distance + out.x * side
	});
	const tail = ARROW_GAP + ARROW_LENGTH;
	const neck = ARROW_GAP + ARROW_HEAD;
	const corners = [
		along(tail, ARROW_SHAFT), along(neck, ARROW_SHAFT), along(neck, ARROW_BARB), along(ARROW_GAP),
		along(neck, -ARROW_BARB), along(neck, -ARROW_SHAFT), along(tail, -ARROW_SHAFT)
	];
	const dashed = hidden ? " stroke-dasharray=\"4 3\"" : "";
	return `<polygon data-entrance="${hidden ? "hidden" : "open"}" points="${polygon(corners)}"${dashed}/>`;
}

/**
 * @param {import("./sites.js").Site} site
 * @param {string} label Names the drawing for screen readers, such as "Map of Blackmoss Isle".
 * @returns {string} SVG markup.
 */
export function siteDiagram(site, label) {
	const positionOf = new Map(site.points.map(({ number, position }) => [number, position]));
	const erased = site.erased.map((key) => {
		const { x, y } = at(key);
		return `<circle data-erased="${key}" cx="${round(x)}" cy="${round(y)}" r="16"/>`;
	});
	const routes = site.routes
		.filter(({ from, to }) => positionOf.has(from) && positionOf.has(to))
		.map(({ from, to, kind }) => route(at(positionOf.get(from)), at(positionOf.get(to)), kind));
	const entrances = site.entrances
		.filter(({ point }) => positionOf.has(point))
		.map(({ point, hidden }) => arrow(at(positionOf.get(point)), outward(positionOf.get(point), site.erased), hidden));
	const points = site.points.map(({ number, position, kind }) => {
		const centre = at(position);
		// A triangle's middle sits low, so its number does too.
		const drop = kind === "danger" ? 5 : 0;
		return `<g data-point="${kind}">${shape(kind, centre)}`
			+ `<text x="${round(centre.x)}" y="${round(centre.y + drop)}" dy="0.35em">${number}</text></g>`;
	});

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-HALF_VIEW} ${-HALF_VIEW} ${SITE_DIAGRAM_SIZE} ${SITE_DIAGRAM_SIZE}" width="${SITE_DIAGRAM_SIZE}" height="${SITE_DIAGRAM_SIZE}" role="img">`,
		`<title>${escapeHTML(label)}</title>`,
		`<rect x="${-HALF_VIEW}" y="${-HALF_VIEW}" width="${SITE_DIAGRAM_SIZE}" height="${SITE_DIAGRAM_SIZE}" rx="10" fill="${PAPER}"/>`,
		`<g fill="none" stroke="${FAINT}" stroke-opacity="0.45" stroke-width="1.5">${erased.join("")}</g>`,
		`<g fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round">${routes.join("")}</g>`,
		`<g fill="${PAPER}" stroke="${INK}" stroke-width="2" stroke-linejoin="round">${entrances.join("")}</g>`,
		`<g fill="${PAPER}" stroke="${INK}" stroke-width="2" stroke-linejoin="round" font-family="Georgia, 'Times New Roman', serif" font-size="15" text-anchor="middle">`,
		points.join("").replaceAll("<text ", `<text fill="${INK}" stroke="none" `),
		"</g>",
		"</svg>"
	].join("");
}

/**
 * @param {string} svg Markup from siteDiagram.
 * @returns {string} A data URI for an <img>, which survives Foundry's HTML cleaning where inline SVG doesn't.
 */
export const svgDataURI = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
