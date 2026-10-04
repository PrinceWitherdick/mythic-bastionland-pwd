import { HEX_COLOR, INK } from "./colour.js";
import { hexCentre, hexVertices } from "./realm-geometry.js";

/**
 * How a hex the Company has been to is marked on the map, each person
 * choosing for themselves: the pencilled ring, a tick, a cross or the hex's
 * own edge drawn over, each in a colour of their choosing. Pure, so the map and
 * the window's samples draw the same strokes.
 */

/** The marks, in the order the window offers them. */
export const VISITED_MARK_STYLES = Object.freeze(["pencil", "tick", "cross", "edge"]);

export const DEFAULT_VISITED_MARK_STYLE = "tick";

/** Each mark's colour until it's changed: the pencil keeps the system's ink, the rest stand out from the map. */
export const DEFAULT_VISITED_MARK_COLOURS = Object.freeze({
	pencil: INK,
	tick: "#2f7d32",
	cross: "#b3261e",
	edge: "#2364aa"
});

/**
 * Each mark's line, in parts of a hex: its weight and how much of the map
 * shows through it. The tick and the cross have a paper halo under them, so
 * they read on a dark forest as on open plain.
 */
const PENS = Object.freeze({
	pencil: { line: 0.018, alpha: 0.45, halo: false },
	tick: { line: 0.055, alpha: 0.9, halo: true },
	cross: { line: 0.055, alpha: 0.9, halo: true },
	edge: { line: 0.04, alpha: 0.9, halo: false }
});

/** The pencilled ring: how far in from the edge it runs, and its dashes. */
const PENCIL = Object.freeze({ inset: 0.12, dash: 0.11, gap: 0.07 });

/** The edge drawn over runs just inside, so two marked hexes side by side each show their own line. */
const EDGE_INSET = 0.04;

/** The tick's three points and the cross's ends, from the hex's middle, in parts of a hex. */
const TICK = Object.freeze([[-0.2, 0.01], [-0.06, 0.16], [0.22, -0.17]]);
const CROSS = 0.17;

/**
 * @param {unknown} value
 * @returns {string} One of VISITED_MARK_STYLES.
 */
export const visitedMarkStyle = (value) => (VISITED_MARK_STYLES.includes(value) ? value : DEFAULT_VISITED_MARK_STYLE);

/**
 * Each mark's colour, a stored one where it's a colour and the default where not.
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
export function visitedMarkColours(value) {
	const stored = value && typeof value === "object" ? value : {};
	return Object.fromEntries(VISITED_MARK_STYLES.map((style) => {
		const colour = typeof stored[style] === "string" ? stored[style].toLowerCase() : "";
		return [style, HEX_COLOR.test(colour) ? colour : DEFAULT_VISITED_MARK_COLOURS[style]];
	}));
}

/** @returns {{x: number, y: number}[]} The hex's corners, drawn in toward its middle by a part of the way. */
function insetCorners(g, hex, inset) {
	const centre = hexCentre(g, hex);
	return hexVertices(g, hex).map(({ x, y }) => ({ x: x + (centre.x - x) * inset, y: y + (centre.y - y) * inset }));
}

/**
 * The dashes of the pencilled ring: the hex's outline drawn in toward the
 * middle, broken into short strokes the way a pencil goes round a place on a
 * paper map. It leaves the middle to the Token and the Realm's pictures.
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {{from: {x: number, y: number}, to: {x: number, y: number}}[]}
 */
export function visitedMarkDashes(g, hex) {
	const corners = insetCorners(g, hex, PENCIL.inset);
	const dash = g.size * PENCIL.dash;
	const gap = g.size * PENCIL.gap;
	const dashes = [];
	corners.forEach((from, index) => {
		const to = corners[(index + 1) % corners.length];
		const length = Math.hypot(to.x - from.x, to.y - from.y);
		// Each side starts and ends on a stroke, so the corners read as corners.
		const count = Math.max(1, Math.round((length + gap) / (dash + gap)));
		const step = (length + gap) / count;
		const along = (distance) => ({ x: from.x + ((to.x - from.x) * distance) / length, y: from.y + ((to.y - from.y) * distance) / length });
		for (let k = 0; k < count; k++) dashes.push({ from: along(k * step), to: along(Math.min(length, k * step + step - gap)) });
	});
	return dashes;
}

/**
 * The strokes of one hex's mark, each a run of points, closed where it goes
 * all the way round.
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @param {string} style One of VISITED_MARK_STYLES.
 * @returns {{points: {x: number, y: number}[], closed: boolean}[]}
 */
export function visitedMarkStrokes(g, hex, style) {
	const centre = hexCentre(g, hex);
	const at = ([x, y]) => ({ x: centre.x + x * g.size, y: centre.y + y * g.size });
	switch (visitedMarkStyle(style)) {
		case "tick":
			return [{ points: TICK.map(at), closed: false }];
		case "cross":
			return [
				{ points: [at([-CROSS, -CROSS]), at([CROSS, CROSS])], closed: false },
				{ points: [at([CROSS, -CROSS]), at([-CROSS, CROSS])], closed: false }
			];
		case "edge":
			return [{ points: insetCorners(g, hex, EDGE_INSET), closed: true }];
		default:
			return visitedMarkDashes(g, hex).map(({ from, to }) => ({ points: [from, to], closed: false }));
	}
}

/**
 * The line a mark is drawn with, in Scene pixels for a hex of the given size.
 * @param {object} g
 * @param {string} style
 * @returns {{width: number, alpha: number, halo: number|null}} `halo` is the paper line's width under it, if it has one.
 */
export function visitedMarkPen(g, style) {
	const pen = PENS[visitedMarkStyle(style)];
	const width = Math.max(2, g.size * pen.line);
	return { width, alpha: pen.alpha, halo: pen.halo ? width * 2 : null };
}

/**
 * A mark as an SVG path, for the window's samples.
 * @param {{points: {x: number, y: number}[], closed: boolean}[]} strokes
 * @returns {string}
 */
export function strokesPath(strokes) {
	const round = (n) => Math.round(n * 10) / 10;
	return strokes.map(({ points, closed }) => points
		.map(({ x, y }, index) => `${index ? "L" : "M"}${round(x)} ${round(y)}`)
		.join(" ") + (closed ? " Z" : "")).join(" ");
}
