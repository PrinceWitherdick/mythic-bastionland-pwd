/**
 * A Realm's rivers, as the pieces laid on its hexes. Each is a run of
 * neighbouring hexes. One that starts or ends on a hex of another joins it
 * there, so the piece in that hex forks; one that doesn't stands on its own.
 * Lakes carry the water themselves.
 *
 * Skins that draw a lake inside its hex join lakes up: a lake beside another,
 * or with a river running into it, is drawn as open water, with a shore on each
 * edge it shares with land and a mouth where a river comes in. Pure, so it can
 * be tested without Foundry.
 */
import { LAKE, RIVER_SHAPES } from "./realm.js";
import { DIRECTIONS, allHexes, edgeDirection, hexIndex, hexKey, inRealm, neighbour, turnBetween } from "./realm-geometry.js";

/**
 * The edges each river piece reaches, as it's drawn: from the south edge
 * (direction 1), by DIRECTIONS. A piece is turned a sixth at a time to lie as
 * its hex needs it.
 */
export const RIVER_PIECE_EDGES = Object.freeze({
	straight: Object.freeze([1, 4]),
	bend: Object.freeze([1, 3]),
	sharp: Object.freeze([1, 2]),
	end: Object.freeze([1]),
	// The river runs on to the north and splits off to the north-west, or to the north-east.
	"fork-left": Object.freeze([1, 3, 4]),
	"fork-right": Object.freeze([1, 4, 5]),
	// Splits both ways, a third of a turn apart.
	"fork-wide": Object.freeze([1, 3, 5]),
	// Three edges side by side.
	fan: Object.freeze([1, 2, 3])
});

/** A shore piece, drawn along the south edge, by which of the edges beside it are water too: the one before it (counter-clockwise), the one after, or both. */
export const SHORE_SHAPES = Object.freeze(["closed", "ccw", "cw", "both"]);

/** Degrees, clockwise, that turn a piece drawn from the south edge to start from `direction`. */
const rotationFrom = (direction) => (60 * (direction - 1) + 360) % 360;

/**
 * @returns {{col: number, row: number}[][]} Each of the Realm's rivers, inside the Realm only.
 */
export function riverCourses(realm, g) {
	return realm.rivers.map((course) => course.filter((hex) => inRealm(g, hex)));
}

/**
 * Which way a river leaves a hex at the edge of the map, as near as possible to
 * straight on from where it came in.
 * @returns {number|null} A direction, or null when the hex isn't at the edge.
 */
function outwardDirection(g, hex, from) {
	const outward = DIRECTIONS.map((_, direction) => direction).filter((direction) => !neighbour(g, hex, direction));
	if (!outward.length) return null;
	const straightness = (direction) => (from === null ? 0 : turnBetween(direction, from));
	return outward.reduce((best, direction) => (straightness(direction) > straightness(best) ? direction : best));
}

/**
 * The piece one course lays as it passes through a hex, in by `a` and out by `b`.
 * @returns {{shape: string, rotation: number}}
 */
function passPiece(a, b) {
	if (a === null || b === null) return { shape: "end", rotation: rotationFrom(a ?? b ?? 1) };
	// Pieces are drawn turning one way, so a turn the other way is the same piece laid from its far end.
	const turn = (b - a + 6) % 6;
	const [from, sweep] = turn > 3 ? [b, 6 - turn] : [a, turn];
	return { shape: { 1: "sharp", 2: "bend", 3: "straight" }[sweep] ?? "straight", rotation: rotationFrom(from) };
}

/**
 * The one piece that reaches just these edges, turned to lie so.
 * @param {number[]} edges Directions.
 * @returns {{shape: string, rotation: number}|null} Null when no one piece does.
 */
export function pieceFor(edges) {
	const wanted = [...new Set(edges)].sort((a, b) => a - b).join();
	for (const shape of RIVER_SHAPES) {
		const drawn = RIVER_PIECE_EDGES[shape];
		for (let turn = 0; turn < 6; turn++) {
			if (drawn.map((edge) => (edge + turn) % 6).sort((a, b) => a - b).join() === wanted) return { shape, rotation: 60 * turn };
		}
	}
	return null;
}

/**
 * The pieces laid on each hex the courses pass through, except lakes. The
 * first course's hexes are numbered by their place along it, and every other hex after.
 * Where courses meet, the hex has one piece reaching all their edges; where
 * more than three edges meet, which no piece is drawn for, each course lays its
 * own piece there.
 * @param {object} g
 * @param {{col: number, row: number}[][]} courses Each river from one end to the other.
 * @param {number[]} terrain
 * @returns {{index: number, hex: object, shape: string, rotation: number}[]} Rotation in degrees, clockwise,
 *   of a piece drawn from the hex's south edge.
 */
export function riverNetworkPieces(g, courses, terrain) {
	const runs = courses.map((course) => (course ?? []).filter((hex) => inRealm(g, hex)));
	const reachedBy = new Map();
	runs.forEach((run, course) => run.forEach((hex) => {
		const key = hexKey(hex);
		reachedBy.set(key, (reachedBy.get(key) ?? new Set()).add(course));
	}));
	// A course ending on a hex another course reaches joins it there, rather than running off the map or rising.
	const joins = (hex, course) => [...reachedBy.get(hexKey(hex))].some((other) => other !== course);

	const hexes = new Map();
	let next = 0;
	runs.forEach((run, course) => run.forEach((hex, position) => {
		const key = hexKey(hex);
		if (!hexes.has(key)) hexes.set(key, { hex, index: next++, edges: new Set(), passes: [] });
		const entry = hexes.get(key);
		const last = run.length - 1;
		const previous = position > 0 ? edgeDirection(hex, run[position - 1]) : null;
		const following = position < last ? edgeDirection(hex, run[position + 1]) : null;
		const loose = (position === 0 || position === last) && !joins(hex, course);
		const a = previous ?? (loose ? outwardDirection(g, hex, following) : null);
		const b = following ?? (loose ? outwardDirection(g, hex, previous) : null);
		entry.passes.push({ a, b });
		for (const edge of [a, b]) if (edge !== null) entry.edges.add(edge);
	}));

	const pieces = [];
	for (const { hex, index, edges, passes } of hexes.values()) {
		if (terrain[hexIndex(g, hex)] === LAKE) continue;
		const one = passes.length === 1 && edges.size <= 2 ? passPiece(passes[0].a, passes[0].b) : pieceFor([...edges]);
		if (one) {
			pieces.push({ index, hex, ...one });
			continue;
		}
		passes.forEach(({ a, b }, pass) => pieces.push({ index: pass ? next++ : index, hex, ...passPiece(a, b) }));
	}
	return pieces;
}

/**
 * @param {boolean} before Whether the edge counter-clockwise of the shore's is water.
 * @param {boolean} after Whether the edge clockwise of it is.
 * @returns {string} One of SHORE_SHAPES.
 */
const shoreShape = (before, after) => (before && after ? "both" : before ? "ccw" : after ? "cw" : "closed");

/**
 * Where lakes are joined up, for a skin that draws a lake inside its hex. A
 * lake alone, with no river running into it, keeps its own drawing.
 * @param {object} g
 * @param {{col: number, row: number}[][]} courses
 * @param {number[]} terrain
 * @returns {{water: object[], shores: {hex: object, edge: number, shape: string, rotation: number}[],
 *   mouths: {hex: object, edge: number, rotation: number}[]}} Lakes drawn as open water, and each shore
 *   and mouth, drawn from the hex's south edge and turned as `rotation` says.
 */
export function lakeWorks(g, courses, terrain) {
	const isLake = (hex) => Boolean(hex) && terrain[hexIndex(g, hex)] === LAKE;
	const inflows = new Map();
	for (const run of courses) {
		const valid = (run ?? []).filter((hex) => inRealm(g, hex));
		valid.forEach((hex, position) => {
			if (!isLake(hex)) return;
			for (const other of [valid[position - 1], valid[position + 1]]) {
				const edge = other && !isLake(other) ? edgeDirection(hex, other) : null;
				if (edge === null) continue;
				const key = hexKey(hex);
				inflows.set(key, (inflows.get(key) ?? new Set()).add(edge));
			}
		});
	}

	const water = [];
	const shores = [];
	const mouths = [];
	for (const hex of allHexes(g)) {
		if (!isLake(hex)) continue;
		const lakeward = DIRECTIONS.map((_, direction) => isLake(neighbour(g, hex, direction)));
		const rivers = [...(inflows.get(hexKey(hex)) ?? [])].sort((a, b) => a - b);
		if (!lakeward.some(Boolean) && !rivers.length) continue;
		water.push(hex);
		lakeward.forEach((open, edge) => {
			if (!open) shores.push({ hex, edge, shape: shoreShape(lakeward[(edge + 5) % 6], lakeward[(edge + 1) % 6]), rotation: rotationFrom(edge) });
		});
		for (const edge of rivers) mouths.push({ hex, edge, rotation: rotationFrom(edge) });
	}
	return { water, shores, mouths };
}
