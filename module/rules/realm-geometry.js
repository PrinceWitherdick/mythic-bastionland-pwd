/**
 * Hex geometry for a Realm (Creating a Realm p14). The Realm Sheet draws flat-top
 * hexes numbered by column across the top and by row down the side, with even
 * columns set half a hex lower. That is Foundry's "Hexagonal Columns - Even"
 * grid at no padding, so a Scene built from these numbers lines up with
 * Foundry's own hexes. Pure, so it can be tested without Foundry.
 *
 * Hexes are `{col, row}`, counted from 1 as the sheet does. Points are Scene
 * pixels, x to the right and y down.
 */

const REALM_COLS = 12;

const REALM_ROWS = 12;

/** A hex's height, flat side to flat side, in Scene pixels. This is Foundry's `grid.size`. */
const HEX_SIZE = 160;

/** `CONST.GRID_TYPES.HEXEVENQ`. */
export const GRID_HEXEVENQ = 5;

/**
 * The six ways out of a hex, clockwise from south-east. Direction k is also the
 * edge between the hex's corners k and k+1, where corner k sits at 60k degrees
 * from the centre.
 */
export const DIRECTIONS = Object.freeze(["southeast", "south", "southwest", "northwest", "north", "northeast"]);

/** Axial steps for each of DIRECTIONS. */
const STEPS = Object.freeze([[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]);

/**
 * The measurements a Realm's Scene is built from.
 * @param {object} [options]
 * @param {number} [options.size] Hex height in pixels.
 * @param {number} [options.cols]
 * @param {number} [options.rows]
 * @returns {Readonly<{size: number, cols: number, rows: number, radius: number, hexWidth: number,
 *   hexHeight: number, width: number, height: number}>} `radius` is centre to corner; `width` and
 *   `height` are the Scene's, in whole pixels.
 */
export function realmGeometry({ size = HEX_SIZE, cols = REALM_COLS, rows = REALM_ROWS } = {}) {
	const radius = size / Math.sqrt(3);
	return Object.freeze({
		size,
		cols,
		rows,
		radius,
		hexWidth: 2 * radius,
		hexHeight: size,
		width: Math.round(radius * (1.5 * cols + 0.5)),
		height: Math.round(size * (cols > 1 ? rows + 0.5 : rows))
	});
}

/**
 * @param {{col: number, row: number}} hex
 * @returns {string} e.g. "5,7".
 */
export const hexKey = ({ col, row }) => `${col},${row}`;

/**
 * @param {string} key From hexKey.
 * @returns {{col: number, row: number}|null}
 */
export function parseHexKey(key) {
	const match = /^(\d+),(\d+)$/.exec(String(key ?? ""));
	return match ? { col: Number(match[1]), row: Number(match[2]) } : null;
}

/**
 * @param {{col: number, row: number}|null} a
 * @param {{col: number, row: number}|null} b
 */
export const sameHex = (a, b) => Boolean(a && b && a.col === b.col && a.row === b.row);

/**
 * @param {object} g From realmGeometry.
 * @param {{col: number, row: number}|null} hex
 */
export const inRealm = (g, hex) => Boolean(hex)
	&& Number.isInteger(hex.col) && Number.isInteger(hex.row)
	&& hex.col >= 1 && hex.col <= g.cols && hex.row >= 1 && hex.row <= g.rows;

/**
 * @param {object} g
 * @returns {{col: number, row: number}[]} Every hex, row by row.
 */
export function allHexes(g) {
	const hexes = [];
	for (let row = 1; row <= g.rows; row++) {
		for (let col = 1; col <= g.cols; col++) hexes.push({ col, row });
	}
	return hexes;
}

/**
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {number} The hex's place in allHexes.
 */
export const hexIndex = (g, { col, row }) => (row - 1) * g.cols + (col - 1);

/** Axial coordinates, where each step to a neighbour is one of STEPS. */
const toAxial = ({ col, row }) => {
	const q = col - 1;
	return { q, r: row - 1 - (q - (q & 1)) / 2 };
};

const fromAxial = ({ q, r }) => ({ col: q + 1, row: r + (q - (q & 1)) / 2 + 1 });

/**
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {{x: number, y: number}}
 */
export function hexCentre(g, { col, row }) {
	return {
		x: g.radius * (1.5 * (col - 1) + 1),
		y: g.size * (row - 0.5 + (col % 2 === 0 ? 0.5 : 0))
	};
}

/**
 * The top-left of the box around a hex, which is where Foundry's grid highlight
 * and a 1x1 Token each expect a position. On a columnar hex grid that box is as
 * wide as the hex (twice the radius), not as wide as the grid size.
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {{x: number, y: number}}
 */
export function hexTopLeft(g, hex) {
	const { x, y } = hexCentre(g, hex);
	return { x: x - g.radius, y: y - g.size / 2 };
}

/**
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {{x: number, y: number}[]} The six corners, corner k at 60k degrees.
 */
export function hexVertices(g, hex) {
	const { x, y } = hexCentre(g, hex);
	return Array.from({ length: 6 }, (_, k) => {
		const angle = (Math.PI / 3) * k;
		return { x: x + g.radius * Math.cos(angle), y: y + g.radius * Math.sin(angle) };
	});
}

/**
 * The hex a point falls in.
 * @param {object} g
 * @param {{x: number, y: number}} point
 * @returns {{col: number, row: number}|null} Null off the Realm, including the half hexes at the top
 *   of even columns and the foot of odd ones.
 */
export function hexAt(g, { x, y }) {
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
	const px = x - g.radius;
	const py = y - g.size / 2;
	const q = (2 / 3) * px / g.radius;
	const r = (-px / 3 + (Math.sqrt(3) / 3) * py) / g.radius;
	const s = -q - r;

	let rq = Math.round(q);
	let rr = Math.round(r);
	const rs = Math.round(s);
	const dq = Math.abs(rq - q);
	const dr = Math.abs(rr - r);
	const ds = Math.abs(rs - s);
	if (dq > dr && dq > ds) rq = -rr - rs;
	else if (dr > ds) rr = -rq - rs;

	const hex = fromAxial({ q: rq, r: rr });
	return inRealm(g, hex) ? hex : null;
}

/**
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @param {number} direction Index into DIRECTIONS.
 * @returns {{col: number, row: number}|null} Null past the edge of the Realm.
 */
export function neighbour(g, hex, direction) {
	const step = STEPS[direction];
	if (!step) return null;
	const { q, r } = toAxial(hex);
	const next = fromAxial({ q: q + step[0], r: r + step[1] });
	return inRealm(g, next) ? next : null;
}

/**
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {{direction: number, hex: {col: number, row: number}}[]} The neighbours inside the Realm.
 */
export function neighbours(g, hex) {
	return DIRECTIONS.flatMap((_, direction) => {
		const next = neighbour(g, hex, direction);
		return next ? [{ direction, hex: next }] : [];
	});
}

/**
 * Steps between two hexes, ignoring anything in the way.
 * @param {{col: number, row: number}} a
 * @param {{col: number, row: number}} b
 * @returns {number}
 */
export function hexDistance(a, b) {
	const from = toAxial(a);
	const to = toAxial(b);
	const dq = to.q - from.q;
	const dr = to.r - from.r;
	return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/**
 * @param {{col: number, row: number}} a
 * @param {{col: number, row: number}} b
 * @returns {number|null} The direction from a to b, or null when they aren't neighbours.
 */
export function edgeDirection(a, b) {
	const from = toAxial(a);
	const to = toAxial(b);
	const index = STEPS.findIndex(([dq, dr]) => from.q + dq === to.q && from.r + dr === to.r);
	return index < 0 ? null : index;
}

/**
 * @param {number} a A direction.
 * @param {number} b Another.
 * @returns {number} Steps from one to the other the shorter way round, 0-3.
 */
export const turnBetween = (a, b) => Math.min((a - b + 6) % 6, (b - a + 6) % 6);

const byPosition = (a, b) => a.col - b.col || a.row - b.row;

/**
 * The edge two neighbouring hexes share, named the same whichever side it is
 * seen from.
 * @param {{col: number, row: number}} a
 * @param {{col: number, row: number}} b
 * @returns {string} e.g. "3,4|4,4".
 */
export function edgeKey(a, b) {
	return [a, b].sort(byPosition).map(hexKey).join("|");
}

/**
 * @param {string} key From edgeKey.
 * @returns {[{col: number, row: number}, {col: number, row: number}]|null} Null unless it names two neighbours.
 */
export function parseEdgeKey(key) {
	const parts = String(key ?? "").split("|").map(parseHexKey);
	if (parts.length !== 2 || parts.some((hex) => !hex) || edgeDirection(parts[0], parts[1]) === null) return null;
	return parts;
}

/**
 * @param {object} g
 * @param {string} key From edgeKey.
 * @returns {{from: {x: number, y: number}, to: {x: number, y: number}}|null} The edge's two corners.
 */
export function edgeSegment(g, key) {
	const hexes = parseEdgeKey(key);
	if (!hexes) return null;
	const [a, b] = hexes;
	const direction = edgeDirection(a, b);
	const corners = hexVertices(g, a);
	return { from: corners[direction], to: corners[(direction + 1) % 6] };
}

/**
 * @param {object} g
 * @returns {string[]} Every edge between two hexes of the Realm, once each.
 */
export function interiorEdges(g) {
	return allHexes(g).flatMap((hex) => [0, 1, 2].flatMap((direction) => {
		const next = neighbour(g, hex, direction);
		return next ? [edgeKey(hex, next)] : [];
	}));
}

/**
 * The edge nearest a point, for picking a Barrier with the pointer.
 * @param {object} g
 * @param {{x: number, y: number}} point
 * @param {object} [options]
 * @param {number} [options.deadZone] Share of a hex's height around its centre that picks nothing.
 * @returns {{key: string, hex: {col: number, row: number}, other: {col: number, row: number}, direction: number}|null}
 *   Null near a hex's centre, off the Realm, or on its outer edge.
 */
export function edgeAt(g, point, { deadZone = 0.3 } = {}) {
	const hex = hexAt(g, point);
	if (!hex) return null;
	const centre = hexCentre(g, hex);
	const dx = point.x - centre.x;
	const dy = point.y - centre.y;
	if (Math.hypot(dx, dy) < deadZone * g.size) return null;

	const degrees = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
	const direction = Math.floor(degrees / 60) % 6;
	const other = neighbour(g, hex, direction);
	return other ? { key: edgeKey(hex, other), hex, other, direction } : null;
}
