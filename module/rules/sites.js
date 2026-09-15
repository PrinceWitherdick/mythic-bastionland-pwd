/**
 * Sites (p15): a place worth exploring in more detail than a Hex, drawn as
 * points on the corners and centre of a hexagon, joined by routes between
 * neighbours. Pure, so a Site can be rolled and tested without Foundry.
 */
import { createRandom } from "./random.js";

/** Features give information or set the mood, dangers are navigated carefully, and treasure is a useful or valuable find. */
export const POINT_KINDS = Object.freeze(["feature", "danger", "treasure"]);

/** Open routes are straightforward, closed ones are blocked, and hidden ones have to be found. */
export const ROUTE_KINDS = Object.freeze(["open", "closed", "hidden"]);

const HALF_WIDTH = Math.sqrt(3) / 2;

/**
 * The corners of a pointy-topped hexagon of radius 1, and its centre, with y
 * running down the page. Listed in reading order, top to bottom and then left
 * to right, which is the order points are numbered in.
 */
export const SITE_POSITIONS = Object.freeze([
	Object.freeze({ key: "top", x: 0, y: -1 }),
	Object.freeze({ key: "upperLeft", x: -HALF_WIDTH, y: -0.5 }),
	Object.freeze({ key: "upperRight", x: HALF_WIDTH, y: -0.5 }),
	Object.freeze({ key: "centre", x: 0, y: 0 }),
	Object.freeze({ key: "lowerLeft", x: -HALF_WIDTH, y: 0.5 }),
	Object.freeze({ key: "lowerRight", x: HALF_WIDTH, y: 0.5 }),
	Object.freeze({ key: "bottom", x: 0, y: 1 })
]);

/** The corners, clockwise from the top. */
const RING = Object.freeze(["top", "upperRight", "lowerRight", "bottom", "lowerLeft", "upperLeft"]);

/** Neighbouring points: each corner to the next around the ring, and each corner to the centre. */
export const SITE_EDGES = Object.freeze([
	...RING.map((key, index) => Object.freeze([key, RING[(index + 1) % RING.length]])),
	...RING.map((key) => Object.freeze(["centre", key]))
]);

/** The most of any one kind a form can ask for. Anything past the hexagon's room is cut down anyway. */
export const SITE_MAX_COUNT = 99;

/** The book's distribution: 3 features, 2 dangers and 1 treasure, joined by 3 open, 2 closed and 1 hidden route. */
export const DEFAULT_SITE = Object.freeze({
	points: Object.freeze({ feature: 3, danger: 2, treasure: 1 }),
	routes: Object.freeze({ open: 3, closed: 2, hidden: 1 }),
	entrance: true,
	hiddenEntrance: true
});

/** Distributions to start from. The burial complex is the book's example of breaking the rules. */
export const SITE_PRESETS = Object.freeze([
	Object.freeze({ key: "book", ...DEFAULT_SITE }),
	Object.freeze({
		key: "burial",
		points: Object.freeze({ feature: 1, danger: 2, treasure: 3 }),
		routes: Object.freeze({ open: 1, closed: 3, hidden: 2 }),
		entrance: true,
		hiddenEntrance: false
	})
]);

/** Why a Site couldn't be drawn quite as asked. */
export const SITE_PROBLEMS = Object.freeze(["noPoints", "tooManyPoints", "tooFewRoutes", "tooManyRoutes", "hiddenEntrance"]);

/**
 * @typedef {object} SitePoint
 * @property {number} number   1 to the number of points, in reading order.
 * @property {string} position One of SITE_POSITIONS' keys.
 * @property {string} kind     One of POINT_KINDS.
 */

/**
 * @typedef {object} SiteRoute
 * @property {number} from The lower point number.
 * @property {number} to   The higher point number.
 * @property {string} kind One of ROUTE_KINDS.
 */

/**
 * @typedef {object} SiteProblem
 * @property {string} reason One of SITE_PROBLEMS.
 * @property {number} asked  How many were asked for.
 * @property {number} used   How many the Site has instead.
 */

/**
 * @typedef {object} Site
 * @property {string} seed
 * @property {SitePoint[]} points
 * @property {SiteRoute[]} routes Sorted by `from`, then `to`.
 * @property {{point: number, hidden: boolean}[]} entrances
 * @property {string[]} erased    Positions without a point, drawn faintly.
 * @property {SiteProblem[]} problems
 */

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number} A whole number from 0 to SITE_MAX_COUNT, or the fallback when the value isn't a number.
 */
function normaliseCount(value, fallback) {
	if (value === undefined || value === null || typeof value === "boolean") return fallback;
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.min(SITE_MAX_COUNT, Math.max(0, Math.trunc(number)));
}

/**
 * Read how many of each kind a form asked for. A blank field counts as none.
 * @param {object|undefined} counts Such as `{feature: "3", danger: 2}`.
 * @param {readonly string[]} kinds POINT_KINDS or ROUTE_KINDS.
 * @param {object} [fallback]       Counts for kinds missing or unreadable.
 * @returns {Record<string, number>}
 */
export function normaliseDistribution(counts, kinds, fallback = {}) {
	return Object.fromEntries(kinds.map((kind) => [kind, normaliseCount(counts?.[kind], normaliseCount(fallback?.[kind], 0))]));
}

/**
 * Read a whole Site request, filling gaps from the fallback.
 * @param {object} [options]
 * @param {object} [fallback] Such as DEFAULT_SITE, or the options last used.
 * @returns {{seed: string, points: Record<string, number>, routes: Record<string, number>, entrance: boolean, hiddenEntrance: boolean}}
 */
export function normaliseSiteOptions(options = {}, fallback = DEFAULT_SITE) {
	const flag = (value, otherwise) => (typeof value === "boolean" ? value : Boolean(otherwise));
	return {
		seed: String(options?.seed ?? "").trim() || String(fallback?.seed ?? ""),
		points: normaliseDistribution(options?.points, POINT_KINDS, fallback?.points),
		routes: normaliseDistribution(options?.routes, ROUTE_KINDS, fallback?.routes),
		entrance: flag(options?.entrance, fallback?.entrance),
		hiddenEntrance: flag(options?.hiddenEntrance, fallback?.hiddenEntrance)
	};
}

/**
 * @param {Record<string, number>} counts
 * @param {readonly string[]} kinds
 * @returns {string[]} Each kind repeated as many times as it's counted.
 */
const spread = (counts, kinds) => kinds.flatMap((kind) => Array(counts[kind]).fill(kind));

/**
 * @template T
 * @param {T[]} nodes
 * @param {[T, T][]} edges
 * @returns {boolean} Whether the edges join every node into one piece.
 */
function joined(nodes, edges) {
	if (nodes.length <= 1) return true;
	const seen = new Set([nodes[0]]);
	const queue = [nodes[0]];
	while (queue.length) {
		const node = queue.shift();
		for (const [a, b] of edges) {
			const next = a === node ? b : b === node ? a : undefined;
			if (next === undefined || seen.has(next) || !nodes.includes(next)) continue;
			seen.add(next);
			queue.push(next);
		}
	}
	return seen.size === nodes.length;
}

/**
 * @param {string[]} keys Positions.
 * @returns {string[][]} The neighbouring pairs among them.
 */
const edgesAmong = (keys) => SITE_EDGES.filter(([a, b]) => keys.includes(a) && keys.includes(b));

/**
 * Every way to keep a number of the seven positions with each kept point still
 * reachable from the others, indexed by how many are kept. Corners alone can
 * be cut off, such as the top and bottom without the centre, so those are left out.
 */
const LAYOUTS = (() => {
	const layouts = Array.from({ length: SITE_POSITIONS.length + 1 }, () => []);
	for (let mask = 0; mask < 2 ** SITE_POSITIONS.length; mask++) {
		const keys = SITE_POSITIONS.filter((_position, index) => mask & (1 << index)).map(({ key }) => key);
		if (joined(keys, edgesAmong(keys))) layouts[keys.length].push(keys);
	}
	return Object.freeze(layouts);
})();

/**
 * Split edges, in the order given, into a spanning tree and the rest.
 * @param {string[][]} edges
 * @param {string[]} keys
 * @returns {{tree: string[][], rest: string[][]}}
 */
function spanningTree(edges, keys) {
	const parent = new Map(keys.map((key) => [key, key]));
	const root = (key) => {
		let current = key;
		while (parent.get(current) !== current) current = parent.get(current);
		return current;
	};
	const tree = [];
	const rest = [];
	for (const edge of edges) {
		const [a, b] = edge.map(root);
		if (a === b) rest.push(edge);
		else {
			parent.set(a, b);
			tree.push(edge);
		}
	}
	return { tree, rest };
}

/**
 * Roll a Site. The same seed and distribution always give the same Site. A
 * distribution the hexagon can't hold is cut down or filled out, and says so
 * in `problems`, rather than failing.
 * @param {object} [options]
 * @param {string} [options.seed]
 * @param {Record<string, number>} [options.points] How many of each of POINT_KINDS.
 * @param {Record<string, number>} [options.routes] How many of each of ROUTE_KINDS.
 * @param {boolean} [options.entrance]
 * @param {boolean} [options.hiddenEntrance]
 * @returns {Site}
 */
export function generateSite(options = {}) {
	const { seed, points: pointCounts, routes: routeCounts, entrance, hiddenEntrance } = normaliseSiteOptions(options);
	const random = createRandom(seed);
	const problems = [];

	let pointKinds = spread(pointCounts, POINT_KINDS);
	if (!pointKinds.length) problems.push({ reason: "noPoints", asked: 0, used: 0 });
	if (pointKinds.length > SITE_POSITIONS.length) {
		problems.push({ reason: "tooManyPoints", asked: pointKinds.length, used: SITE_POSITIONS.length });
		pointKinds = random.shuffle(pointKinds).slice(0, SITE_POSITIONS.length);
	}

	// "Erase the final point": any of the seven may go, as long as the rest stay joined.
	const kept = random.pick(LAYOUTS[pointKinds.length]);
	const numberOf = new Map(kept.map((key, index) => [key, index + 1]));
	const points = random.shuffle(pointKinds).map((kind, index) => ({ number: index + 1, position: kept[index], kind }));

	const neighbours = edgesAmong(kept);
	const needed = Math.max(0, kept.length - 1);
	let routeKinds = spread(routeCounts, ROUTE_KINDS);
	const asked = routeKinds.length;
	if (asked > neighbours.length) {
		problems.push({ reason: "tooManyRoutes", asked, used: neighbours.length });
		routeKinds = random.shuffle(routeKinds).slice(0, neighbours.length);
	} else if (asked < needed) {
		// Every point must be reachable, and an open route is the least surprising one to add.
		problems.push({ reason: "tooFewRoutes", asked, used: needed });
		routeKinds = [...routeKinds, ...Array(needed - asked).fill("open")];
	}

	// A random spanning tree reaches every point whatever kinds its routes turn
	// out to be, and any further routes come from the neighbours left over.
	const { tree, rest } = spanningTree(random.shuffle(neighbours), kept);
	const kinds = random.shuffle(routeKinds);
	const routes = [...tree, ...rest].slice(0, kinds.length).map(([a, b], index) => {
		const [from, to] = [numberOf.get(a), numberOf.get(b)].sort((x, y) => x - y);
		return { from, to, kind: kinds[index] };
	}).sort((a, b) => a.from - b.from || a.to - b.to);

	const entrances = [];
	if (entrance && points.length) entrances.push({ point: random.pick(points).number, hidden: false });
	if (hiddenEntrance && points.length) {
		const elsewhere = points.filter(({ number }) => number !== entrances[0]?.point);
		if (elsewhere.length) entrances.push({ point: random.pick(elsewhere).number, hidden: true });
		else problems.push({ reason: "hiddenEntrance", asked: 1, used: 0 });
	}

	return {
		seed,
		points,
		routes,
		entrances,
		erased: SITE_POSITIONS.map(({ key }) => key).filter((key) => !numberOf.has(key)),
		problems
	};
}

/**
 * @param {Pick<Site, "points"|"routes">} site
 * @returns {boolean} Whether every point can be reached from every other, whatever kind the routes are.
 */
export function isSiteConnected({ points, routes }) {
	return joined(points.map(({ number }) => number), routes.map(({ from, to }) => [from, to]));
}

/**
 * @param {Pick<Site, "routes">} site
 * @param {number} number A point's number.
 * @returns {{to: number, kind: string}[]} The routes leading from that point, nearest number first.
 */
export function pointRoutes({ routes }, number) {
	return routes
		.filter(({ from, to }) => from === number || to === number)
		.map(({ from, to, kind }) => ({ to: from === number ? to : from, kind }))
		.sort((a, b) => a.to - b.to);
}
