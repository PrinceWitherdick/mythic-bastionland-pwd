/**
 * Drawing in ink for the Blank Realm skin: smooth paths through points, the
 * Myth numerals and the Seat of Power's crown, drawn for this system in the
 * manner of the Blank Realm sheet, which draws neither. Used by
 * scripts/realm-placeholders.js.
 *
 * A drawing sits in a 100 by 100 box and is a list of parts, painted in order:
 *   ["line", width, points]  a stroke of ink
 *   ["shape", width, points] a closed outline of ink, filled with paper
 *   ["solid", points]        a closed shape filled with ink
 * Points are "x,y" pairs separated by spaces. Lines bend smoothly through them,
 * except at a point marked "!", where they turn sharply. Every point is nudged
 * a little and every long straight line bowed, as a hand would, but the same
 * way each time, so the drawings come out the same whenever they're drawn.
 */

const f = (value) => Math.round(value * 10) / 10;

const pair = (x, y) => `${f(x)},${f(y)}`;

/** How far a point may be nudged, and how much a straight line may bow for each unit of its length. */
const NUDGE = 0.7;
const BOW = 0.03;

/**
 * A number from -1 to 1 that depends only on where a point is, from integer
 * hashing, so it's the same on every machine.
 * @returns {number}
 */
function shake(x, y, salt) {
	let hash = Math.imul(Math.round(x * 10) + 7919, 0x9e3779b1) ^ Math.imul(Math.round(y * 10) + 104729, 0x85ebca6b) ^ Math.imul(salt, 0xc2b2ae35);
	hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
	hash = Math.imul(hash ^ (hash >>> 12), 0x297a2d39);
	return (((hash ^ (hash >>> 15)) >>> 0) / 2 ** 32) * 2 - 1;
}

/**
 * @param {string} text Points, as described above.
 * @returns {{x: number, y: number, sharp: boolean}[]} Nudged.
 */
function parsePoints(text) {
	return text.trim().split(/\s+/).map((point) => {
		const [x, y] = point.replace("!", "").split(",").map(Number);
		return { x: x + shake(x, y, 1) * NUDGE, y: y + shake(x, y, 2) * NUDGE, sharp: point.endsWith("!") };
	});
}

const xy = ({ x, y }) => `${f(x)} ${f(y)}`;

/**
 * An SVG path bending smoothly through points, as a Catmull-Rom spline, and
 * turning sharply at a point that's `sharp`.
 * @param {{x: number, y: number, sharp?: boolean}[]} points
 * @param {boolean} [closed]
 * @param {object} [options]
 * @param {number} [options.bow] How much a straight line between two sharp points bows, for each unit of its length.
 * @returns {string}
 */
export function curvePath(points, closed = false, { bow = 0 } = {}) {
	const count = points.length;
	const at = (index) => points[closed ? (index + count) % count : Math.min(count - 1, Math.max(0, index))];
	let d = `M${xy(points[0])}`;
	for (let index = 0; index < (closed ? count : count - 1); index++) {
		const [before, from, to, after] = [at(index - 1), at(index), at(index + 1), at(index + 2)];
		if (from.sharp && to.sharp) {
			const length = Math.hypot(to.x - from.x, to.y - from.y);
			const bend = bow * length * shake(from.x + to.x, from.y + to.y, 3);
			if (!bow || length < 8) {
				d += `L${xy(to)}`;
				continue;
			}
			d += `Q${xy({ x: (from.x + to.x) / 2 - ((to.y - from.y) / length) * bend, y: (from.y + to.y) / 2 + ((to.x - from.x) / length) * bend })} ${xy(to)}`;
			continue;
		}
		const out = from.sharp ? from : { x: from.x + (to.x - before.x) / 6, y: from.y + (to.y - before.y) / 6 };
		const into = to.sharp ? to : { x: to.x - (after.x - from.x) / 6, y: to.y - (after.y - from.y) / 6 };
		d += `C${xy(out)} ${xy(into)} ${xy(to)}`;
	}
	return closed ? `${d}Z` : d;
}

/**
 * A path through hand-placed points, nudged and bowed as a hand would draw it.
 * @param {string} text Points, as described above.
 * @param {boolean} [closed]
 * @returns {string}
 */
export const inkPath = (text, closed = false) => curvePath(parsePoints(text), closed, { bow: BOW });

/**
 * A drawing as SVG, in its 100 by 100 box. Neighbouring parts painted alike
 * share one element.
 * @param {Array} parts
 * @param {{ink: string, paper: string}} colours
 * @returns {string}
 */
export function drawInk(parts, { ink, paper }) {
	const elements = [];
	const add = (attributes, d, mergeable) => {
		const last = elements.at(-1);
		if (mergeable && last?.attributes === attributes) last.d += d;
		else elements.push({ attributes, d });
	};

	for (const [kind, ...args] of parts) {
		switch (kind) {
			case "line": add(`fill="none" stroke="${ink}" stroke-width="${args[0]}" stroke-linecap="round" stroke-linejoin="round"`, inkPath(args[1]), true); break;
			case "shape": add(`fill="${paper}" stroke="${ink}" stroke-width="${args[0]}" stroke-linejoin="round"`, inkPath(args[1], true), false); break;
			case "solid": add(`fill="${ink}"`, inkPath(args[0], true), true); break;
			default: throw new Error(`Unknown ink part: ${kind}`);
		}
	}
	return elements.map(({ attributes, d }) => `<path d="${d}" ${attributes}/>`).join("");
}

/** @returns {string} Points around a circle. */
const ring = (cx, cy, radius, { steps = 10, turn = 0 } = {}) => Array.from({ length: steps }, (_, index) => {
	const angle = turn + (2 * Math.PI * index) / steps;
	return pair(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
}).join(" ");

/** Each numeral's strokes, about 40 tall about the box's middle. */
const NUMERALS = Object.freeze({
	1: ["41,38 52,29 52,70", "40,70 64,70"],
	2: ["37,40 43,31 54,29 62,35 62,45 52,55 37,70! 64,70"],
	3: ["37,34 48,29 60,33 61,43 50,49! 62,55 63,66 51,71 36,67"],
	4: ["57,71 57,29! 35,58! 67,58"],
	5: ["62,30! 42,30! 40,49! 52,45 62,51 63,63 53,71 37,67"],
	6: ["60,32 48,29 40,41 38,58 44,70 56,71 63,62 60,51 50,47 39,53"]
});

/**
 * A Myth's number, written in a ring with a shadow, as a GM numbers them on the sheet.
 * @param {number} number 1 to 6.
 * @returns {Array} Parts.
 */
export const inkNumeral = (number) => [
	["solid", ring(53, 54, 42, { steps: 12, turn: 0.4 })],
	["shape", 7, ring(49, 50, 42, { steps: 12, turn: 0.2 })],
	...(NUMERALS[number] ?? NUMERALS[1]).map((points) => ["line", 8.5, points])
];

/** A crown for the Seat of Power, casting a shadow to its right as the sheet's Holdings do. */
export const INK_CROWN = Object.freeze([
	["solid", "80,40 96,48 96,92 84,97 20,97 16,90 88,86"],
	["shape", 4.6, "12,72! 6,34! 28,52! 46,22! 64,52! 86,34! 80,72!"],
	["shape", 4.6, "12,72! 80,72! 78,88! 14,88!"],
	["shape", 3.2, ring(6, 29, 5.4)],
	["shape", 3.2, ring(46, 16, 5.4)],
	["shape", 3.2, ring(86, 29, 5.4)],
	["solid", ring(30, 80, 3.6, { steps: 8 })],
	["solid", ring(46, 80, 3.6, { steps: 8 })],
	["solid", ring(62, 80, 3.6, { steps: 8 })]
]);
