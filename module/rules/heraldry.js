/**
 * Heraldry a Knight paints inside the shield at the top of their sheet: the
 * shield's outline, the tinctures offered, and the pixel work the painter does
 * that needs no browser.
 */
import { channels, contrast, HEX_COLOR } from "./colour.js";

/** The shield's field on the sheet, in CSS pixels. */
export const SHIELD_WIDTH = 136;
export const SHIELD_HEIGHT = 162;

/** The field's outline. The painter keeps paint inside it, and the border's ring (SHIELD_CLIPS) starts at it. */
export const SHIELD_PATH = "M0 7 Q68 -5 136 7 V68 C136 112 104 142 68 162 C32 142 0 112 0 68 Z";

/** The ink border round the field, drawn as a shield this much larger all round, in CSS pixels. */
export const SHIELD_BORDER = 4;

/** The border's outer edge, a shield SHIELD_BORDER larger than the field on every side. */
export const SHIELD_OUTLINE_PATH = "M0 8 Q72 -6 144 8 V72 C144 118 110 150 72 170 C34 150 0 118 0 72 Z";

/** SHIELD_PATH moved SHIELD_BORDER in and down, where the field sits inside the outline. */
export const SHIELD_FIELD_IN_OUTLINE_PATH = "M4 11 Q72 -1 140 11 V72 C140 116 108 146 72 166 C36 146 4 116 4 72 Z";

/**
 * The shield's clip paths by element id, each drawn to fit whatever box it
 * clips, so the sheet's shield and the painter's larger one share them.
 * The stylesheet clips with `clip-path: url(#id)`, and each path fills even-odd.
 *
 * The border is a ring laid over the painting rather than ink showing round a
 * field clipped to shape. Two clips' soft edges side by side left a pale seam
 * between the paint and the ink; one ring on top has nothing pale beneath it.
 */
export const SHIELD_CLIPS = Object.freeze({
	"bastionland-shield-outline": { path: SHIELD_OUTLINE_PATH, width: SHIELD_WIDTH + SHIELD_BORDER * 2, height: SHIELD_HEIGHT + SHIELD_BORDER * 2 },
	"bastionland-shield-border": {
		path: `${SHIELD_OUTLINE_PATH} ${SHIELD_FIELD_IN_OUTLINE_PATH}`,
		width: SHIELD_WIDTH + SHIELD_BORDER * 2,
		height: SHIELD_HEIGHT + SHIELD_BORDER * 2
	}
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

/**
 * @param {string} color Such as "#b0261e".
 * @returns {string|null} The tincture of that colour, or null for a colour mixed by hand.
 */
export const tinctureOf = (color) => TINCTURES.find((tincture) => tincture.color === color)?.key ?? null;

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

/** The metals. Every other tincture counts as a colour, and heraldry sets metal against colour. */
export const METALS = Object.freeze(["or", "argent"]);

/** The tinctures random arms are drawn in: the metals and the five colours, leaving out the rarer stains. */
const RANDOM_TINCTURES = Object.freeze(["or", "argent", "gules", "azure", "vert", "purpure", "sable"]);

const isMetal = (key) => METALS.includes(key);

/**
 * How far apart two tinctures must be to read well against each other: as far
 * as the closest pair the rule of tincture allows, or on vert. Colours against
 * each other mostly fall well short, and the metals against each other too.
 */
export const READABLE_CONTRAST = Math.min(...METALS.flatMap((metal) => RANDOM_TINCTURES
	.filter((key) => !isMetal(key))
	.map((key) => contrast(tinctureColor(metal), tinctureColor(key)))));

/**
 * @param {string} a A colour, such as "#b0261e".
 * @param {string} b Another.
 * @returns {boolean} Whether each would show clearly on the other.
 */
export const colorsReadWell = (a, b) => contrast(a, b) >= READABLE_CONTRAST;

/**
 * @param {string} a A tincture's key.
 * @param {string} b Another.
 * @returns {boolean} Whether each would show clearly on the other.
 */
export const readsWell = (a, b) => colorsReadWell(tinctureColor(a), tinctureColor(b));

/** How often random arms are divided rather than plain, how often a plain field is a metal, and how often a divided field still bears a charge. */
export const RANDOM_ARMS = Object.freeze({ divided: 0.65, metalField: 0.5, chargeOnDivided: 0.6 });

/**
 * @template T
 * @param {T[]} list
 * @param {() => number} random
 * @returns {T}
 */
const pick = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

/**
 * @param {{parts: {group: number, points: number[][]}[]}} division
 * @returns {number[][]} Each pair of groups with parts that share a side. Parts meeting only at a corner don't count.
 */
export function touchingGroups(division) {
	const pairs = new Map();
	for (const [index, part] of division.parts.entries()) {
		for (const other of division.parts.slice(index + 1)) {
			if (other.group === part.group) continue;
			const shared = part.points.filter(([x, y]) => other.points.some(([ox, oy]) => ox === x && oy === y));
			if (shared.length < 2) continue;
			const pair = [part.group, other.group].sort((a, b) => a - b);
			pairs.set(pair.join(), pair);
		}
	}
	return [...pairs.values()];
}

/**
 * @param {{parts: {group: number}[]}} division
 * @returns {number} How many tinctures the division's field takes.
 */
const groupCount = (division) => new Set(division.parts.map(({ group }) => group)).size;

/**
 * @param {string|null} key
 * @returns {typeof DIVISIONS[number]|null} The division, or null for a plain field.
 */
export const divisionOf = (key) => DIVISIONS.find((division) => division.key === key) ?? null;

/**
 * @param {number} groups
 * @returns {string[][]} Every way to give that many groups a different tincture each.
 */
function fieldTinctures(groups) {
	if (!groups) return [[]];
	return fieldTinctures(groups - 1).flatMap((field) => RANDOM_TINCTURES.filter((key) => !field.includes(key)).map((key) => [...field, key]));
}

/**
 * Tinctures for a division's groups, drawn among those that keep the rule of
 * tincture wherever parts touch. Per Pall's three parts all touch each other,
 * so no two kinds can keep it there; it takes three tinctures that read well
 * against each other instead.
 * @param {{parts: {group: number, points: number[][]}[]}} division
 * @param {() => number} random
 * @returns {string[]} A tincture's key for each group, in group order.
 */
function divisionTinctures(division, random) {
	const touching = touchingGroups(division);
	const all = fieldTinctures(groupCount(division));
	const keeping = (test) => all.filter((field) => touching.every(([a, b]) => test(field[a], field[b])));
	const ruled = keeping((a, b) => isMetal(a) !== isMetal(b));
	return pick(ruled.length ? ruled : keeping(readsWell), random);
}

/**
 * A charge's tincture over each group of the field. A charge on a plain field
 * is of the other kind, metal on colour or colour on metal. Over a divided
 * field it takes one tincture that reads well against every part, when there
 * is one, or is counterchanged.
 * @param {string[]} field The field's tinctures, in group order.
 * @param {() => number} random
 * @returns {string[]} A tincture's key for each group.
 */
function chargeTinctures(field, random) {
	if (field.length === 1) return [pick(RANDOM_TINCTURES.filter((key) => isMetal(key) !== isMetal(field[0])), random)];
	const plain = RANDOM_TINCTURES.filter((key) => !field.includes(key) && field.every((ground) => readsWell(key, ground)));
	if (plain.length && random() < 0.5) {
		const tincture = pick(plain, random);
		return field.map(() => tincture);
	}
	return counterchange(field.map(tinctureColor)).map(tinctureOf);
}

/**
 * A charge counterchanged over a divided field: over each part it takes
 * whichever of the field's other colours shows most clearly there, as the
 * halves of the field swap.
 * @param {string[]} field Colours, in group order.
 * @returns {string[]} The charge's colour over each group.
 */
export function counterchange(field) {
	return field.map((ground) => field
		.filter((color) => color !== ground)
		.reduce((best, color) => (best === ground || contrast(color, ground) > contrast(best, ground) ? color : best), ground));
}

/**
 * @param {() => number} random
 * @returns {string} A plain field's tincture: a metal as often as a colour, though there are fewer metals.
 */
function plainField(random) {
	const metal = random() < RANDOM_ARMS.metalField;
	return pick(RANDOM_TINCTURES.filter((key) => isMetal(key) === metal), random);
}

/**
 * Arms drawn at random that read well: a field, plain or divided, and perhaps a charge.
 * @param {object} [options]
 * @param {string[]} [options.charges] Keys of the charges that may be drawn.
 * @param {() => number} [options.random] From 0 up to 1.
 * @returns {{division: string|null, field: string[], charge: {key: string, tinctures: string[]}|null}}
 *   The division's key, or null for a plain field; the tincture keys of the
 *   field's groups in group order; and the charge, with its tincture over each group.
 */
export function randomArms({ charges = [], random = Math.random } = {}) {
	const division = random() < RANDOM_ARMS.divided ? pick(DIVISIONS, random) : null;
	const field = division ? divisionTinctures(division, random) : [plainField(random)];
	const bearsCharge = charges.length && (!division || random() < RANDOM_ARMS.chargeOnDivided);
	const charge = bearsCharge ? { key: pick(charges, random), tinctures: chargeTinctures(field, random) } : null;
	return { division: division?.key ?? null, field, charge };
}

/**
 * Arms the painter keeps editable until something is painted over them, and
 * keeps on the Knight beside the heraldry they were saved as.
 * @typedef {object} Arms
 * @property {string|null} division A division's key, or null for a plain field.
 * @property {string[]} field A colour for each group of the field, in group order, such as "#b0261e".
 * @property {ArmsCharge|null} charge
 */

/**
 * @typedef {object} ArmsCharge
 * @property {string} key
 * @property {string} color Its colour while it isn't counterchanged.
 * @property {boolean} counterchanged Whether it takes the field's colours swapped about instead.
 * @property {Placement} placement
 * @property {boolean} flip
 */

/**
 * @param {string[]} tinctures A charge's tincture over each group, as random arms give them.
 * @returns {{color: string, counterchanged: boolean}}
 */
const bearing = (tinctures) => ({ color: tinctureColor(tinctures[0]), counterchanged: new Set(tinctures).size > 1 });

/**
 * Random arms as the painter edits them.
 * @param {ReturnType<typeof randomArms>} arms
 * @param {Placement} placement Where the charge goes.
 * @returns {Arms}
 */
export function editableArms({ division, field, charge }, placement) {
	return {
		division,
		field: field.map(tinctureColor),
		charge: charge ? { key: charge.key, ...bearing(charge.tinctures), placement, flip: false } : null
	};
}

/**
 * @param {Arms} arms Arms bearing a charge.
 * @returns {string[]} The charge's colour over each group of the field.
 */
export function chargeColors({ field, charge }) {
	return charge.counterchanged && field.length > 1 ? counterchange(field) : field.map(() => charge.color);
}

/**
 * A colour for a part of the field that hasn't one: a tincture not on the
 * field yet, keeping the rule of tincture against the parts beside it where
 * they're all tinctures, or else reading well against them. Beside a metal and
 * a colour at once, where none may do either, it takes the tincture that shows
 * most clearly beside the one it shows least against.
 * @param {string[]} beside The colours of the parts it touches.
 * @param {string[]} used The colours on the field already.
 * @param {() => number} random
 * @returns {string}
 */
function newPartColor(beside, used, random) {
	const unused = RANDOM_TINCTURES.filter((key) => !used.includes(tinctureColor(key)));
	const kinds = beside.map(tinctureOf);
	const ruled = kinds.every(Boolean) ? unused.filter((key) => kinds.every((other) => isMetal(other) !== isMetal(key))) : [];
	const readable = unused.filter((key) => beside.every((color) => colorsReadWell(tinctureColor(key), color)));
	const choices = [ruled, readable].find((keys) => keys.length);
	if (choices) return tinctureColor(pick(choices, random));
	const pool = unused.length ? unused : RANDOM_TINCTURES;
	const dimmest = (key) => Math.min(...beside.map((color) => contrast(tinctureColor(key), color)));
	return tinctureColor(pool.reduce((best, key) => (dimmest(key) > dimmest(best) ? key : best)));
}

/**
 * The arms on another division, or on a plain field. Each group keeps its
 * colour, and a group the field hadn't got draws one that reads well beside
 * the parts it touches. A counterchanged charge on a field made plain keeps
 * the colour it had over the first part.
 * @param {Arms} arms
 * @param {string|null} key The division's key, or null for a plain field.
 * @param {() => number} [random]
 * @returns {Arms}
 */
export function redivideArms(arms, key, random = Math.random) {
	const division = divisionOf(key);
	const count = division ? groupCount(division) : 1;
	const touching = division ? touchingGroups(division) : [];
	const field = arms.field.slice(0, count);
	while (field.length < count) {
		const group = field.length;
		const beside = touching
			.filter((pair) => pair.includes(group))
			.map(([a, b]) => field[a === group ? b : a])
			.filter(Boolean);
		field.push(newPartColor(beside, field, random));
	}
	let { charge } = arms;
	if (charge?.counterchanged && count === 1) charge = { ...charge, color: chargeColors(arms)[0], counterchanged: false };
	return { ...arms, division: division?.key ?? null, field, charge };
}

/**
 * A charge's colours drawn for a field, as random arms bear one. A field in
 * a colour mixed by hand, or a stain, takes a tincture that reads well on all
 * of it, or is counterchanged when none does.
 * @param {string[]} field Colours, in group order.
 * @param {() => number} random
 * @returns {{color: string, counterchanged: boolean}}
 */
function drawBearing(field, random) {
	const kinds = field.map(tinctureOf);
	if (kinds.every((key) => RANDOM_TINCTURES.includes(key))) return bearing(chargeTinctures(kinds, random));
	const readable = RANDOM_TINCTURES.filter((key) => field.every((color) => colorsReadWell(tinctureColor(key), color)));
	if (readable.length) return { color: tinctureColor(pick(readable, random)), counterchanged: false };
	if (field.length > 1) return { color: counterchange(field)[0], counterchanged: true };
	const clearest = RANDOM_TINCTURES.map(tinctureColor).reduce((best, color) => (contrast(color, field[0]) > contrast(best, field[0]) ? color : best));
	return { color: clearest, counterchanged: false };
}

/**
 * New tinctures for arms, keeping their division and charge: the field's
 * drawn as random arms' are, and the charge's to read well on it.
 * @param {Arms} arms
 * @param {() => number} [random]
 * @returns {Arms}
 */
export function retinctureArms(arms, random = Math.random) {
	const division = divisionOf(arms.division);
	const field = division ? divisionTinctures(division, random) : [plainField(random)];
	const charge = arms.charge && { ...arms.charge, ...bearing(chargeTinctures(field, random)) };
	return { ...arms, field: field.map(tinctureColor), charge };
}

/**
 * Another field for arms, plain or divided and in new tinctures, keeping the charge where it is.
 * @param {Arms} arms
 * @param {() => number} [random]
 * @returns {Arms}
 */
export function refieldArms(arms, random = Math.random) {
	const division = random() < RANDOM_ARMS.divided ? pick(DIVISIONS, random) : null;
	return retinctureArms({ ...arms, division: division?.key ?? null }, random);
}

/**
 * Arms bearing a given charge: in the colours, place and facing of the one
 * they bore, or, for a first charge, in colours that read well on the field.
 * @param {Arms} arms
 * @param {string} key The charge's key.
 * @param {Placement} placement Where a first charge goes.
 * @param {() => number} [random]
 * @returns {Arms}
 */
export function armsWithCharge(arms, key, placement, random = Math.random) {
	const charge = arms.charge ? { ...arms.charge, key } : { key, ...drawBearing(arms.field, random), placement, flip: false };
	return { ...arms, charge };
}

/**
 * Arms bearing another charge, drawn at random.
 * @param {Arms} arms
 * @param {string[]} charges Keys of the charges that may be drawn.
 * @param {Placement} placement Where a first charge goes.
 * @param {() => number} [random]
 * @returns {Arms}
 */
export function rechargeArms(arms, charges, placement, random = Math.random) {
	const others = charges.filter((key) => key !== arms.charge?.key);
	return others.length ? armsWithCharge(arms, pick(others, random), placement, random) : arms;
}

/**
 * A short fingerprint of a Knight's heraldry as saved, kept with their arms,
 * so arms kept from an older painting aren't offered for a newer one.
 * @param {string} heraldry The file's path, or a data URL.
 * @returns {string}
 */
export function heraldryStamp(heraldry) {
	// FNV-1a, which is quick over a long data URL.
	let hash = 0x811c9dc5;
	for (let index = 0; index < heraldry.length; index++) {
		hash ^= heraldry.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return `${heraldry.length.toString(36)}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

const isColor = (value) => typeof value === "string" && HEX_COLOR.test(value);

/**
 * Arms as kept on a Knight, checked.
 * @param {unknown} saved
 * @param {string} heraldry The Knight's heraldry as saved.
 * @param {string[]} charges Keys of the charges there are.
 * @returns {Arms|null} The arms, or null when they aren't arms or were saved with other heraldry.
 */
export function readArms(saved, heraldry, charges) {
	if (!saved || typeof saved !== "object" || !heraldry || saved.stamp !== heraldryStamp(heraldry)) return null;
	const { division = null, field, charge = null } = saved;
	if (division !== null && !divisionOf(division)) return null;
	const count = division ? groupCount(divisionOf(division)) : 1;
	if (!Array.isArray(field) || field.length !== count || !field.every(isColor)) return null;
	if (charge === null) return { division, field: [...field], charge: null };
	const { key, color, counterchanged, placement, flip } = charge;
	const { x, y, scale } = placement ?? {};
	if (!charges.includes(key) || !isColor(color) || ![x, y, scale].every(Number.isFinite) || !(scale > 0)) return null;
	return {
		division,
		field: [...field],
		charge: { key, color, counterchanged: Boolean(counterchanged) && count > 1, placement: { x, y, scale }, flip: Boolean(flip) }
	};
}
