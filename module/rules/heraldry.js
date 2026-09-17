/**
 * Heraldry a Knight paints inside the shield at the top of their sheet: the
 * shield's outline, the tinctures offered, and the pixel work the painter does
 * that needs no browser.
 */
import { channels, HEX_COLOR } from "./colour.js";

/** The shield's field on the sheet, in CSS pixels. */
export const SHIELD_WIDTH = 136;
export const SHIELD_HEIGHT = 162;

/** The field's outline. The sheet and painter clip the field to it, through SHIELD_CLIPS. */
export const SHIELD_PATH = "M0 7 Q68 -5 136 7 V68 C136 112 104 142 68 162 C32 142 0 112 0 68 Z";

/** The ink border round the field, drawn as a shield this much larger all round, in CSS pixels. */
export const SHIELD_BORDER = 4;

/** The border's outer edge, a shield SHIELD_BORDER larger than the field on every side. */
export const SHIELD_OUTLINE_PATH = "M0 8 Q72 -6 144 8 V72 C144 118 110 150 72 170 C34 150 0 118 0 72 Z";

/**
 * The shield's clip paths by element id, each drawn to fit whatever box it
 * clips, so the sheet's shield and the painter's larger one share them.
 * The stylesheet clips with `clip-path: url(#id)`.
 */
export const SHIELD_CLIPS = Object.freeze({
	"bastionland-shield-outline": { path: SHIELD_OUTLINE_PATH, width: SHIELD_WIDTH + SHIELD_BORDER * 2, height: SHIELD_HEIGHT + SHIELD_BORDER * 2 },
	"bastionland-shield-field": { path: SHIELD_PATH, width: SHIELD_WIDTH, height: SHIELD_HEIGHT }
});

/**
 * A path drawn in a box, scaled to run from 0 to 1 across and down it, as an
 * SVG clip path in `objectBoundingBox` units wants. Arcs aren't supported.
 * @param {string} path
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
export function boundingBoxPath(path, width, height) {
	const round = (value) => Math.round(value * 1e5) / 1e5;
	return path.replace(/([MLHVCSQTZ])([^MLHVCSQTZ]*)/gi, (_match, command, args) => {
		const upright = command.toUpperCase() === "V";
		const level = command.toUpperCase() === "H";
		const numbers = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
		// Coordinates run in x, y pairs, except for a vertical or horizontal line's one.
		const scaled = numbers.map((value, index) => round(value / (upright || (!level && index % 2 === 1) ? height : width)));
		return `${[command, ...scaled].join(" ")} `;
	}).trim();
}

/** Heraldry is painted and saved at this multiple of the sheet's size, so it stays sharp on high-density screens. */
export const PAINT_SCALE = 3;

/**
 * How far the painting runs past the shield's outline on every side, in the
 * sheet's pixels. The sheet and painter place the painting with this margin
 * behind the shield's border, so colour carries on under the line instead of
 * stopping at it. Paint that stopped at the line left a pale seam where its
 * soft edge met the border's. The stylesheet offsets the heraldry to match.
 */
export const PAINT_MARGIN = 2;

/** The painting's size in the sheet's pixels: the shield, with the margin all round. */
export const PAINTING_WIDTH = SHIELD_WIDTH + PAINT_MARGIN * 2;
export const PAINTING_HEIGHT = SHIELD_HEIGHT + PAINT_MARGIN * 2;

/** The tinctures of heraldry: two metals, five colours, then the three rarer stains. */
export const TINCTURES = Object.freeze([
	{ key: "or", color: "#d9a92e" },
	{ key: "argent", color: "#f4f0e6" },
	{ key: "gules", color: "#b0261e" },
	{ key: "azure", color: "#1f4f9a" },
	{ key: "vert", color: "#2d7433" },
	{ key: "purpure", color: "#6b3a8c" },
	{ key: "sable", color: "#1d1a17" },
	{ key: "tenne", color: "#a8571f" },
	{ key: "sanguine", color: "#7a1d20" },
	{ key: "murrey", color: "#6d2748" }
]);

/**
 * @param {string} key One of TINCTURES' keys.
 * @returns {string} Its colour.
 */
export const tinctureColor = (key) => TINCTURES.find((tincture) => tincture.key === key).color;

/** How many colours a user mixed, or took from a painting, are kept to use again. */
export const RECENT_COLORS_LIMIT = 10;

/**
 * @param {ArrayLike<number>} pixels RGBA
 * @param {number} [offset] Where the colour starts in `pixels`.
 * @returns {string} Such as "#b0261e". How opaque the pixel is doesn't count.
 */
export function rgbaToHex(pixels, offset = 0) {
	return `#${[0, 1, 2].map((channel) => pixels[offset + channel].toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Put a colour first among the recent ones. The tinctures are always on offer, so they aren't kept.
 * @param {string[]} recent Most recent first.
 * @param {string} color Such as "#b0261e".
 * @returns {string[]} The new list, or `recent` itself when nothing changes.
 */
export function rememberColor(recent, color) {
	const hex = color.toLowerCase();
	if (!HEX_COLOR.test(hex) || recent[0] === hex || TINCTURES.some((tincture) => tincture.color === hex)) return recent;
	return [hex, ...recent.filter((each) => each !== hex)].slice(0, RECENT_COLORS_LIMIT);
}

/**
 * The recent colours as saved, less anything that isn't a colour, a repeat, or past the limit.
 * @param {unknown} saved
 * @returns {string[]}
 */
export function readRecentColors(saved) {
	if (!Array.isArray(saved)) return [];
	const colors = saved
		.filter((color) => typeof color === "string")
		.map((color) => color.toLowerCase())
		.filter((color) => HEX_COLOR.test(color));
	return [...new Set(colors)].slice(0, RECENT_COLORS_LIMIT);
}

export const PAINT_TOOLS = Object.freeze(["brush", "line", "fill", "eraser", "eyedropper"]);

/** Holding Shift keeps a line to angles this far apart: level, upright or diagonal. */
const LINE_SNAP = Math.PI / 4;

/** Brush widths, in the sheet's pixels. */
export const BRUSH = Object.freeze({ min: 1, max: 30, initial: 6 });

/** Undo steps kept. Each is a full copy of the painting. */
export const UNDO_LIMIT = 20;

/**
 * The longest a painting kept on the Knight itself may be, as a data URL.
 * Only used when the user may not upload files; every client receives it with the actor.
 */
export const MAX_INLINE_LENGTH = 300_000;

/** A fill spreads through colours this close to the one clicked, on every channel. */
const FILL_TOLERANCE = 64;

/** A fill paints over, without spreading through, colours this close: the soft edge of a brush stroke. */
const EDGE_TOLERANCE = 128;

/**
 * @param {string} hex Such as "#b0261e".
 * @returns {number[]} [r, g, b, a], fully opaque.
 */
export function hexToRgba(hex) {
	return [...channels(hex), 255];
}

/**
 * Fill the area around a pixel that shares its colour, the way a paint bucket
 * does. Colours close to the one clicked count as the same, and a soft brush
 * edge bordering the area is painted over too, so no pale ring is left inside
 * a line.
 * @param {Uint8ClampedArray} pixels RGBA, changed in place.
 * @param {number} width
 * @param {number} height
 * @param {number} x
 * @param {number} y
 * @param {number[]} color [r, g, b, a]
 * @param {object} [options]
 * @param {Uint8Array} [options.inside] 1 for each pixel the fill may reach. Omit to allow every pixel.
 * @param {number} [options.tolerance]
 * @param {number} [options.edgeTolerance]
 * @returns {boolean} Whether anything was painted.
 */
export function floodFill(pixels, width, height, x, y, color, { inside, tolerance = FILL_TOLERANCE, edgeTolerance = EDGE_TOLERANCE } = {}) {
	const column = Math.floor(x);
	const row = Math.floor(y);
	if (column < 0 || row < 0 || column >= width || row >= height) return false;
	const start = row * width + column;
	if (inside && !inside[start]) return false;

	const target = pixels.slice(start * 4, start * 4 + 4);
	if (difference(color, target, 0) === 0) return false;

	// 0 untouched, 1 filled and spread from, 2 a soft edge filled but not spread from.
	const reached = new Uint8Array(width * height);
	reached[start] = 1;
	const queue = [start];
	const visit = (index) => {
		if (reached[index] || (inside && !inside[index])) return;
		const distance = difference(target, pixels, index * 4);
		if (distance <= tolerance) {
			reached[index] = 1;
			queue.push(index);
		} else if (distance <= edgeTolerance) {
			reached[index] = 2;
		}
	};

	while (queue.length) {
		const index = queue.pop();
		const across = index % width;
		if (across > 0) visit(index - 1);
		if (across < width - 1) visit(index + 1);
		if (index >= width) visit(index - width);
		if (index < width * (height - 1)) visit(index + width);
	}

	for (let index = 0; index < reached.length; index++) {
		if (reached[index]) pixels.set(color, index * 4);
	}
	return true;
}

/**
 * The largest difference between two colours on any channel.
 * @param {ArrayLike<number>} color [r, g, b, a]
 * @param {ArrayLike<number>} pixels
 * @param {number} offset Where the other colour starts in `pixels`.
 */
function difference(color, pixels, offset) {
	let largest = 0;
	for (let channel = 0; channel < 4; channel++) {
		largest = Math.max(largest, Math.abs(color[channel] - pixels[offset + channel]));
	}
	return largest;
}

/**
 * @param {Uint8ClampedArray} pixels RGBA
 * @returns {boolean} Whether nothing has been painted.
 */
export function isBlank(pixels) {
	for (let alpha = 3; alpha < pixels.length; alpha += 4) {
		if (pixels[alpha]) return false;
	}
	return true;
}

/**
 * @param {{width: number, height: number}} natural The picture's own size.
 * @param {{width: number, height: number}} box
 * @param {(across: number, down: number) => number} pick Math.max to cover the box, Math.min to fit inside it.
 * @returns {{x: number, y: number, width: number, height: number}} The picture in its own shape, centred on the box.
 */
function fit(natural, box, pick) {
	if (!(natural.width > 0 && natural.height > 0)) return { x: 0, y: 0, ...box };
	const scale = pick(box.width / natural.width, box.height / natural.height);
	const width = natural.width * scale;
	const height = natural.height * scale;
	return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

/** Where to draw a picture so it covers a box in its own shape, cropping the overhang equally on both sides. */
export const coverFit = (natural, box) => fit(natural, box, Math.max);

/** Where to draw a picture so all of it fits inside a box in its own shape, centred. */
export const containFit = (natural, box) => fit(natural, box, Math.min);

/**
 * How large a picture being placed may be, as a multiple of the size that fits
 * all of it inside the painting. It starts at that size.
 */
export const IMAGE_SCALE = Object.freeze({ min: 0.1, max: 4, initial: 1 });

/** How much one notch of the mouse wheel, or the + and − keys, grows or shrinks a picture being placed. */
export const IMAGE_ZOOM_STEP = 1.1;

/**
 * A picture being placed on the shield: where its middle is on the painting,
 * and its size as a multiple of the size that fits all of it inside.
 * @typedef {{x: number, y: number, scale: number}} Placement
 */

/**
 * @param {{width: number, height: number}} box The painting.
 * @param {number} [scale]
 * @returns {Placement} The picture in the middle of the painting, fitted inside it unless another size is given.
 */
export function centredPlacement(box, scale = IMAGE_SCALE.initial) {
	return { x: box.width / 2, y: box.height / 2, scale };
}

/**
 * @param {{width: number, height: number}} natural
 * @param {{width: number, height: number}} box
 * @returns {number} The scale at which the picture covers the whole painting.
 */
export function fillScale(natural, box) {
	return coverFit(natural, box).width / containFit(natural, box).width;
}

/**
 * The sizes a picture may be placed at. A long, thin picture may always grow enough to cover the painting.
 * @param {{width: number, height: number}} natural
 * @param {{width: number, height: number}} box
 * @returns {{min: number, max: number}}
 */
export function placementLimits(natural, box) {
	return { min: IMAGE_SCALE.min, max: Math.max(IMAGE_SCALE.max, fillScale(natural, box)) };
}

/**
 * @param {{width: number, height: number}} natural
 * @param {{width: number, height: number}} box
 * @param {Placement} placement
 * @returns {{x: number, y: number, width: number, height: number}} Where to draw the picture on the painting.
 */
export function placementBox(natural, box, placement) {
	const fit = containFit(natural, box);
	const width = fit.width * placement.scale;
	const height = fit.height * placement.scale;
	return { x: placement.x - width / 2, y: placement.y - height / 2, width, height };
}

/**
 * Resize a picture being placed, keeping one point of it where it is: the
 * pointer when scrolling, or its middle otherwise.
 * @param {Placement} placement
 * @param {number} scale The size wanted, kept within `limits`.
 * @param {{min: number, max: number}} limits
 * @param {{x: number, y: number}} [anchor] On the painting.
 * @returns {Placement}
 */
export function zoomPlacement(placement, scale, limits, anchor = placement) {
	const next = Math.min(limits.max, Math.max(limits.min, scale));
	const ratio = next / placement.scale;
	return {
		x: anchor.x + (placement.x - anchor.x) * ratio,
		y: anchor.y + (placement.y - anchor.y) * ratio,
		scale: next
	};
}

/**
 * Keep a picture's middle on the painting, so it can't be dragged out of reach.
 * @param {Placement} placement
 * @param {{width: number, height: number}} box
 * @returns {Placement}
 */
export function keepOnPainting(placement, box) {
	return {
		...placement,
		x: Math.min(box.width, Math.max(0, placement.x)),
		y: Math.min(box.height, Math.max(0, placement.y))
	};
}

/**
 * Where a line ends when kept to the nearest of a set of angles: the pointer's
 * position carried onto that direction, so a level line ends right under it.
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @param {number} [step] Radians between allowed angles.
 * @returns {{x: number, y: number}}
 */
export function snapLine(from, to, step = LINE_SNAP) {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const angle = Math.round(Math.atan2(dy, dx) / step) * step;
	const along = dx * Math.cos(angle) + dy * Math.sin(angle);
	return { x: from.x + along * Math.cos(angle), y: from.y + along * Math.sin(angle) };
}

/**
 * Where the shield's lines cross, down its height. The point takes up the
 * bottom of the shield, so its middle to the eye is above half way.
 */
export const FESS_POINT = 0.45;

/**
 * @param {number} count
 * @param {(index: number) => number[][]} shape The corners of each stripe.
 * @returns {{group: number, points: number[][]}[]} Stripes that alternate, starting with the second tincture.
 */
function stripes(count, shape) {
	return Array.from({ length: count }, (_, index) => ({ group: (index + 1) % 2, points: shape(index) }));
}

/** @returns {{group: number, points: number[][]}[]} Eight wedges about the fess point, alternating. */
function gyrons() {
	const rim = [[0, 0], [0.5, 0], [1, 0], [1, FESS_POINT], [1, 1], [0.5, 1], [0, 1], [0, FESS_POINT]];
	return rim.map((corner, index) => ({ group: index % 2, points: [[0.5, FESS_POINT], corner, rim[(index + 1) % rim.length]] }));
}

/**
 * The ways to divide a shield. Each part is a polygon on the painting, with
 * corners from 0 to 1 across and down, and a group: parts in one group share a
 * tincture, so painting one paints them all. Group 0 is the field, 1 the
 * second tincture and 2 a third.
 */
export const DIVISIONS = Object.freeze([
	{ key: "perPale", parts: [
		{ group: 1, points: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]] },
		{ group: 0, points: [[0.5, 0], [1, 0], [1, 1], [0.5, 1]] }
	] },
	{ key: "perBend", parts: [
		{ group: 0, points: [[0, 0], [1, 0], [1, 1]] },
		{ group: 1, points: [[0, 0], [1, 1], [0, 1]] }
	] },
	{ key: "quarterly", parts: [
		{ group: 1, points: [[0, 0], [0.5, 0], [0.5, FESS_POINT], [0, FESS_POINT]] },
		{ group: 0, points: [[0.5, 0], [1, 0], [1, FESS_POINT], [0.5, FESS_POINT]] },
		{ group: 0, points: [[0, FESS_POINT], [0.5, FESS_POINT], [0.5, 1], [0, 1]] },
		{ group: 1, points: [[0.5, FESS_POINT], [1, FESS_POINT], [1, 1], [0.5, 1]] }
	] },
	{ key: "tiercedInPale", parts: [
		{ group: 1, points: [[0, 0], [1 / 3, 0], [1 / 3, 1], [0, 1]] },
		{ group: 2, points: [[1 / 3, 0], [2 / 3, 0], [2 / 3, 1], [1 / 3, 1]] },
		{ group: 0, points: [[2 / 3, 0], [1, 0], [1, 1], [2 / 3, 1]] }
	] },
	{ key: "perPall", parts: [
		{ group: 1, points: [[0, 0], [1, 0], [0.5, FESS_POINT]] },
		{ group: 0, points: [[0, 0], [0.5, FESS_POINT], [0.5, 1], [0, 1]] },
		{ group: 2, points: [[1, 0], [1, 1], [0.5, 1], [0.5, FESS_POINT]] }
	] },
	{ key: "perChevron", parts: [
		{ group: 0, points: [[0, 0], [1, 0], [1, 0.85], [0.5, 0.4], [0, 0.85]] },
		{ group: 1, points: [[0, 0.85], [0.5, 0.4], [1, 0.85], [1, 1], [0, 1]] }
	] },
	{ key: "barry", parts: stripes(8, (index) => [[0, index / 8], [1, index / 8], [1, (index + 1) / 8], [0, (index + 1) / 8]]) },
	{ key: "perFess", parts: [
		{ group: 1, points: [[0, 0], [1, 0], [1, FESS_POINT], [0, FESS_POINT]] },
		{ group: 0, points: [[0, FESS_POINT], [1, FESS_POINT], [1, 1], [0, 1]] }
	] },
	{ key: "paly", parts: stripes(8, (index) => [[index / 8, 0], [(index + 1) / 8, 0], [(index + 1) / 8, 1], [index / 8, 1]]) },
	{ key: "perPile", parts: [
		{ group: 0, points: [[0, 0], [0.1, 0], [0.5, 1], [0, 1]] },
		{ group: 1, points: [[0.1, 0], [0.9, 0], [0.5, 1]] },
		{ group: 0, points: [[0.9, 0], [1, 0], [1, 1], [0.5, 1]] }
	] },
	{ key: "perBendSinister", parts: [
		{ group: 0, points: [[0, 0], [1, 0], [0, 1]] },
		{ group: 1, points: [[1, 0], [1, 1], [0, 1]] }
	] },
	{ key: "gyronny", parts: gyrons() }
]);

/**
 * @param {number[][]} points
 * @param {number} x
 * @param {number} y
 * @returns {boolean} Whether the point lies inside the polygon.
 */
function insidePolygon(points, x, y) {
	let inside = false;
	for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
		const [xi, yi] = points[index];
		const [xj, yj] = points[previous];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

/**
 * @param {{parts: {group: number, points: number[][]}[]}} division
 * @param {number} x From 0 to 1 across the painting.
 * @param {number} y From 0 to 1 down it.
 * @returns {number|null} The group of the part under the point, or null off the painting.
 */
export function divisionGroupAt(division, x, y) {
	if (x < 0 || y < 0 || x > 1 || y > 1) return null;
	// A point on a line between parts belongs to the nearest part along it, so nudge it off the line.
	const part = division.parts.find(({ points }) => insidePolygon(points, x, y))
		?? division.parts.find(({ points }) => insidePolygon(points, Math.min(x + 1e-6, 1 - 1e-6), Math.min(y + 1e-6, 1 - 1e-6)))
		?? division.parts.find(({ points }) => insidePolygon(points, Math.max(x - 1e-6, 1e-6), Math.max(y - 1e-6, 1e-6)));
	return part ? part.group : null;
}
