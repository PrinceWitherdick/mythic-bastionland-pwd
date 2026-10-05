/**
 * Hex geometry for a Realm (Creating a Realm p14). The Realm Sheet draws flat-top
 * hexes numbered by column across the top and by row down the side, with even
 * columns set half a hex lower. That is Foundry's "Hexagonal Columns - Even"
 * grid at no padding, so a Scene built from these numbers lines up with
 * Foundry's own hexes. Pure, so it can be tested without Foundry.
 *
 * A map the GM drew themselves may be laid out another way: flat tops with the
 * first column lower, or pointed tops in rows, either row set in. Each is one of
 * Foundry's other hex grids, and REALM_LAYOUTS names them all. Everything below
 * takes the Realm's geometry, so a Realm laid out any of those ways is walked,
 * measured and drawn the same way the book's is.
 *
 * Hexes are `{col, row}`, counted from 1 as the sheet does. Points are Scene
 * pixels, x to the right and y down.
 */

const REALM_COLS = 12;

const REALM_ROWS = 12;

/** A hex's width across its flat sides, in Scene pixels: its height on the book's sheet. This is Foundry's `grid.size`. */
const HEX_SIZE = 160;

/**
 * The ways a Realm's hexes can be laid out. `evenColumns` is the book's Realm
 * Sheet: flat tops, the second column set half a hex lower. `oddColumns` sets
 * the first column lower instead. `evenRows` has pointed tops in rows with the
 * second row set half a hex in from the left; `oddRows` sets the first row in.
 */
export const REALM_LAYOUTS = Object.freeze(["evenColumns", "oddColumns", "evenRows", "oddRows"]);

/** The Realm Sheet's layout, which every Realm has unless the GM's own map says otherwise. */
export const BOOK_LAYOUT = "evenColumns";

/** `CONST.GRID_TYPES` for each layout: the Foundry grid whose lines fall on its hexes. */
const GRID_TYPES = Object.freeze({ evenColumns: 5, oddColumns: 4, evenRows: 3, oddRows: 2 });

/**
 * @param {*} layout
 * @returns {string} One of REALM_LAYOUTS, the book's for anything else.
 */
export const normaliseLayout = (layout) => (REALM_LAYOUTS.includes(layout) ? layout : BOOK_LAYOUT);

/**
 * @param {object} g
 * @returns {boolean} Whether the hexes have flat tops and stand in columns, as on the book's sheet.
 */
const inColumns = (g) => !String(g.layout ?? BOOK_LAYOUT).endsWith("Rows");

/**
 * @param {object} g
 * @returns {boolean} Whether it's the even columns or rows that are set lower or in, rather than the odd ones.
 */
const evenSetOff = (g) => !String(g.layout ?? BOOK_LAYOUT).startsWith("odd");

/**
 * The six ways out of a hex on the book's sheet, clockwise from south-east.
 * Direction k is also the edge between the hex's corners k and k+1. Pointed
 * tops turn every corner back a twelfth of a turn, so the same six ways start
 * from east there instead: see directionNames.
 */
export const DIRECTIONS = Object.freeze(["southeast", "south", "southwest", "northwest", "north", "northeast"]);

/** The six ways out of a hex with a pointed top, in the same order. */
const ROW_DIRECTIONS = Object.freeze(["east", "southeast", "southwest", "west", "northwest", "northeast"]);

/**
 * @param {object} g
 * @returns {readonly string[]} What each of the six ways out of a hex is called on this Realm, by direction.
 *   Wording lives under `bastionland.realm.directions`.
 */
export const directionNames = (g) => (inColumns(g) ? DIRECTIONS : ROW_DIRECTIONS);

/** Axial steps for each direction. */
const STEPS = Object.freeze([[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]);

/**
 * @param {object} g
 * @returns {number} How far round, in radians, corner 0 sits from due east: on the axis with flat tops, a twelfth
 *   of a turn back with pointed ones, so direction k still runs out through the edge between corners k and k+1.
 */
const cornerTurn = (g) => (inColumns(g) ? 0 : -Math.PI / 6);

/**
 * The measurements a Realm's Scene is built from.
 * @param {object} [options]
 * @param {number} [options.size] Hex width across the flat sides, in pixels.
 * @param {number} [options.cols]
 * @param {number} [options.rows]
 * @param {string} [options.layout] One of REALM_LAYOUTS.
 * @returns {Readonly<{size: number, cols: number, rows: number, layout: string, columns: boolean, gridType: number,
 *   radius: number, hexWidth: number, hexHeight: number, width: number, height: number}>} `radius` is centre to
 *   corner; `hexWidth` and `hexHeight` are the box around one hex; `width` and `height` are the Scene's, in whole
 *   pixels.
 */
export function realmGeometry({ size = HEX_SIZE, cols = REALM_COLS, rows = REALM_ROWS, layout = BOOK_LAYOUT } = {}) {
	const radius = size / Math.sqrt(3);
	const laid = normaliseLayout(layout);
	const columns = inColumns({ layout: laid });
	return Object.freeze({
		size,
		cols,
		rows,
		layout: laid,
		columns,
		gridType: GRID_TYPES[laid],
		radius,
		hexWidth: columns ? 2 * radius : size,
		hexHeight: columns ? size : 2 * radius,
		width: columns ? Math.round(radius * (1.5 * cols + 0.5)) : Math.round(size * (rows > 1 ? cols + 0.5 : cols)),
		height: columns ? Math.round(size * (cols > 1 ? rows + 0.5 : rows)) : Math.round(radius * (1.5 * rows + 0.5))
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
 * The records of a store kept a hex at a time in a Scene flag, `{hexes: {[key]: record}}`,
 * from whatever the flag holds, however old or bad: each under a hex's key that comes
 * through `clean`.
 * @template T
 * @param {unknown} raw
 * @param {(value: unknown) => T|null|undefined} clean A record as it's kept, or nothing to drop it.
 * @returns {Record<string, T>}
 */
export function hexRecords(raw, clean) {
	const hexes = raw && typeof raw === "object" ? raw.hexes : null;
	const kept = {};
	if (!hexes || typeof hexes !== "object") return kept;
	for (const [key, value] of Object.entries(hexes)) {
		if (!parseHexKey(key)) continue;
		const record = clean(value);
		if (record) kept[key] = record;
	}
	return kept;
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

/**
 * How far along the other way a column or row's hexes are moved by its place,
 * counted from 0: half a hex for every other one, in whole axial steps.
 * @param {object} g
 * @param {number} line A column (flat tops) or row (pointed tops), counted from 0.
 */
const setOff = (g, line) => (evenSetOff(g) ? (line - (line & 1)) / 2 : (line + (line & 1)) / 2);

/** Axial coordinates, where each step to a neighbour is one of STEPS, and hex (1,1) is at the origin. */
function toAxial(g, { col, row }) {
	if (inColumns(g)) return { q: col - 1, r: row - 1 - setOff(g, col - 1) };
	return { q: col - 1 - setOff(g, row - 1), r: row - 1 };
}

function fromAxial(g, { q, r }) {
	if (inColumns(g)) return { col: q + 1, row: r + setOff(g, q) + 1 };
	return { col: q + setOff(g, r) + 1, row: r + 1 };
}

/**
 * @param {number} q
 * @param {number} r
 * @returns {{q: number, r: number}} The axial hex a fractional point falls in.
 */
function cubeRound(q, r) {
	const s = -q - r;
	let rq = Math.round(q);
	let rr = Math.round(r);
	const rs = Math.round(s);
	const dq = Math.abs(rq - q);
	const dr = Math.abs(rr - r);
	const ds = Math.abs(rs - s);
	if (dq > dr && dq > ds) rq = -rr - rs;
	else if (dr > ds) rr = -rq - rs;
	return { q: rq, r: rr };
}

/**
 * @param {object} g
 * @param {number} line A column or row, counted from 1.
 * @returns {number} How far it is moved along: half a hex for the columns set lower or the rows set in.
 */
const shift = (g, line) => ((line % 2 === 0) === evenSetOff(g) ? 0.5 : 0);

/**
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {{x: number, y: number}}
 */
export function hexCentre(g, { col, row }) {
	if (inColumns(g)) {
		return {
			x: g.radius * (1.5 * (col - 1) + 1),
			y: g.size * (row - 0.5 + shift(g, col))
		};
	}
	return {
		x: g.size * (col - 0.5 + shift(g, row)),
		y: g.radius * (1.5 * (row - 1) + 1)
	};
}

/**
 * The top-left of the box around a hex, which is where Foundry's grid highlight
 * and a 1x1 Token each expect a position. With flat tops that box is as wide as
 * the hex (twice the radius), not as wide as the grid size; with pointed tops
 * it is as tall as the hex instead.
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {{x: number, y: number}}
 */
export function hexTopLeft(g, hex) {
	const { x, y } = hexCentre(g, hex);
	return { x: x - g.hexWidth / 2, y: y - g.hexHeight / 2 };
}

/**
 * @param {object} g
 * @param {{col: number, row: number}} hex
 * @returns {{x: number, y: number}[]} The six corners, corner k at 60k degrees, less a twelfth of a turn with pointed tops.
 */
export function hexVertices(g, hex) {
	const { x, y } = hexCentre(g, hex);
	const turn = cornerTurn(g);
	return Array.from({ length: 6 }, (_, k) => {
		const angle = (Math.PI / 3) * k + turn;
		return { x: x + g.radius * Math.cos(angle), y: y + g.radius * Math.sin(angle) };
	});
}

/**
 * The hex a point falls in.
 * @param {object} g
 * @param {{x: number, y: number}} point
 * @returns {{col: number, row: number}|null} Null off the Realm, including the half hexes Foundry draws where
 *   every other column starts lower or every other row starts further in.
 */
export function hexAt(g, { x, y }) {
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
	const origin = hexCentre(g, { col: 1, row: 1 });
	const px = x - origin.x;
	const py = y - origin.y;
	const fractional = inColumns(g)
		? { q: (2 / 3) * px / g.radius, r: (-px / 3 + (Math.sqrt(3) / 3) * py) / g.radius }
		: { q: ((Math.sqrt(3) / 3) * px - py / 3) / g.radius, r: (2 / 3) * py / g.radius };
	const hex = fromAxial(g, cubeRound(fractional.q, fractional.r));
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
	const { q, r } = toAxial(g, hex);
	const next = fromAxial(g, { q: q + step[0], r: r + step[1] });
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
 * @param {object} g
 * @param {{col: number, row: number}} a
 * @param {{col: number, row: number}} b
 * @returns {number}
 */
export function hexDistance(g, a, b) {
	const from = toAxial(g, a);
	const to = toAxial(g, b);
	const dq = to.q - from.q;
	const dr = to.r - from.r;
	return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/**
 * The hexes a straight line from one hex's centre to another's passes through.
 * A line running exactly along an edge is nudged to one side of it, so each step
 * is to a neighbour, and to the side inside the Realm where there is one.
 * @param {object} g
 * @param {{col: number, row: number}} a
 * @param {{col: number, row: number}} b
 * @returns {{col: number, row: number}[]} From the hex after a up to and including b; empty when they're the same.
 */
export function hexLine(g, a, b) {
	const line = nudgedLine(g, a, b, 1);
	return line.every((hex) => inRealm(g, hex)) ? line : nudgedLine(g, a, b, -1);
}

/**
 * @param {object} g
 * @param {{col: number, row: number}} a
 * @param {{col: number, row: number}} b
 * @param {number} side 1 or -1, which side of an edge the line is nudged to.
 * @returns {{col: number, row: number}[]}
 */
function nudgedLine(g, a, b, side) {
	const from = toAxial(g, a);
	const to = toAxial(g, b);
	const distance = hexDistance(g, a, b);
	const line = [];
	for (let step = 1; step <= distance; step++) {
		const share = step / distance;
		const q = from.q + (to.q - from.q) * share + side * 1e-6;
		const r = from.r + (to.r - from.r) * share + side * 2e-6;
		line.push(fromAxial(g, cubeRound(q, r)));
	}
	return line;
}

/**
 * @param {object} g
 * @param {{col: number, row: number}} a
 * @param {{col: number, row: number}} b
 * @returns {number|null} The direction from a to b, or null when they aren't neighbours.
 */
export function edgeDirection(g, a, b) {
	const from = toAxial(g, a);
	const to = toAxial(g, b);
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
 * @param {object} g
 * @param {string} key From edgeKey.
 * @returns {[{col: number, row: number}, {col: number, row: number}]|null} Null unless it names two neighbours.
 */
export function parseEdgeKey(g, key) {
	const parts = String(key ?? "").split("|").map(parseHexKey);
	if (parts.length !== 2 || parts.some((hex) => !hex) || edgeDirection(g, parts[0], parts[1]) === null) return null;
	return parts;
}

/**
 * @param {object} g
 * @param {string} key From edgeKey.
 * @returns {{from: {x: number, y: number}, to: {x: number, y: number}}|null} The edge's two corners.
 */
export function edgeSegment(g, key) {
	const hexes = parseEdgeKey(g, key);
	if (!hexes) return null;
	const [a, b] = hexes;
	const direction = edgeDirection(g, a, b);
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
 * @param {number} [options.deadZone] Share of a hex's width across its flat sides around its centre that picks nothing.
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

	// Direction k runs out through the middle of its edge, half a sixth past corner k.
	const degrees = ((Math.atan2(dy, dx) - cornerTurn(g)) * 180) / Math.PI;
	const direction = Math.floor((((degrees % 360) + 360) % 360) / 60) % 6;
	const other = neighbour(g, hex, direction);
	return other ? { key: edgeKey(hex, other), hex, other, direction } : null;
}
