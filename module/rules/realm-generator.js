/**
 * Rolling a Realm the way Creating a Realm (p14) describes it: clusters of
 * terrain, a river crossing the land, four Holdings a good distance apart, six
 * Myths in remote places, three or four of each Landmark, and Barriers on one
 * sixth as many edges as there are hexes. Seeded, so the same seed rolls the
 * same Realm. Pure, so it can be tested without Foundry.
 */
import { createRandom } from "./random.js";
import {
	HOLDING_COUNT,
	HOLDING_STYLES,
	LAKE,
	LANDMARKS_PER_TYPE,
	LANDMARK_TYPES,
	MYTH_COUNT,
	TERRAIN,
	barrierCount,
	emptyRealm
} from "./realm.js";
import {
	allHexes,
	edgeDirection,
	edgeKey,
	hexDistance,
	hexIndex,
	hexKey,
	interiorEdges,
	neighbours,
	parseEdgeKey,
	parseHexKey,
	realmGeometry,
	sameHex,
	turnBetween
} from "./realm-geometry.js";

const PEAKS = TERRAIN.indexOf("peaks") + 1;
const CRAG = TERRAIN.indexOf("crag") + 1;

/** "A few large lakes." */
const MAX_LAKE_CLUSTERS = 3;

const RIVER_ATTEMPTS = 50;
const RIVER_MIN_LENGTH = 8;
const RIVER_MAX_LENGTH = 40;
const SIDES = Object.freeze(["north", "east", "south", "west"]);
const OPPOSITE = Object.freeze({ north: "south", south: "north", east: "west", west: "east" });

const HOLDING_SPACINGS = Object.freeze([6, 5, 4, 3]);
const MYTH_SPACINGS = Object.freeze([4, 3, 2, 1]);
const PLACEMENT_ATTEMPTS = 100;

/** Share of hexes, furthest from any Holding, that Myths are first placed among. */
const REMOTE_SHARE = 0.4;

/** Hexes looked at for each Landmark; the one furthest from other Landmarks wins. */
const LANDMARK_SAMPLES = 8;

const BARRIER_TRIES = 2000;

/**
 * @param {object} options
 * @param {string} options.seed
 * @param {object} [options.geometry] From realmGeometry.
 * @returns {import("./realm.js").Realm}
 */
export function generateRealm({ seed, geometry = realmGeometry() }) {
	const random = createRandom(seed);
	const realm = emptyRealm(geometry, seed);
	realm.terrain = generateTerrain(random, geometry);
	realm.river = generateRiver(random, geometry, realm.terrain);
	realm.holdings = placeHoldings(random, geometry, realm);
	realm.myths = placeMyths(random, geometry, realm);
	realm.landmarks = placeLandmarks(random, geometry, realm);
	realm.barriers = placeBarriers(random, geometry, realm);
	return realm;
}

/**
 * "Create clusters of d12 hexes of the same terrain type": each cluster rolls a
 * d12 for its terrain and another for its size, then grows from a hex beside
 * the land already drawn, favouring compact shapes.
 * @returns {number[]} Terrain for each hex in `hexIndex` order.
 */
function generateTerrain(random, g) {
	const terrain = new Array(g.cols * g.rows).fill(0);
	const isSet = (hex) => terrain[hexIndex(g, hex)] > 0;
	let lakes = 0;

	for (;;) {
		const open = allHexes(g).filter((hex) => !isSet(hex));
		if (!open.length) return terrain;
		const frontier = open.filter((hex) => neighbours(g, hex).some(({ hex: next }) => isSet(next)));
		const start = random.pick(frontier.length ? frontier : open);

		let type = random.die(TERRAIN.length);
		while (type === LAKE && lakes >= MAX_LAKE_CLUSTERS) type = random.die(TERRAIN.length);
		if (type === LAKE) lakes++;
		const size = random.die(12);

		const cluster = new Set([hexKey(start)]);
		terrain[hexIndex(g, start)] = type;
		while (cluster.size < size) {
			const candidates = new Map();
			for (const key of cluster) {
				for (const { hex } of neighbours(g, parseHexKey(key))) {
					if (!isSet(hex)) candidates.set(hexKey(hex), hex);
				}
			}
			if (!candidates.size) break;
			const next = random.weighted([...candidates.values()], (hex) =>
				1 + 2 * neighbours(g, hex).filter(({ hex: beside }) => cluster.has(hexKey(beside))).length);
			cluster.add(hexKey(next));
			terrain[hexIndex(g, next)] = type;
		}
	}
}

/** Steps from a hex to a side of the map. */
function stepsToSide(g, { col, row }, side) {
	switch (side) {
		case "north": return row - 1;
		case "south": return g.rows - row;
		case "west": return col - 1;
		default: return g.cols - col;
	}
}

/**
 * "Most Realms have a navigable river passing through": a winding walk from one
 * side of the map to another, preferring to keep going the way it flows and to
 * go around high ground.
 * @param {number[]} terrain
 * @returns {{col: number, row: number}[]} Source to mouth.
 */
export function generateRiver(random, g, terrain) {
	const onSide = (hex, side) => stepsToSide(g, hex, side) === 0;
	const sidesOf = (hex) => SIDES.filter((side) => onSide(hex, side));

	for (let attempt = 0; attempt < RIVER_ATTEMPTS; attempt++) {
		const startSide = random.pick(SIDES);
		const perpendicular = SIDES.filter((side) => side !== startSide && side !== OPPOSITE[startSide]);
		const endSide = random.float() < 0.7 ? OPPOSITE[startSide] : random.pick(perpendicular);
		const starts = allHexes(g).filter((hex) => onSide(hex, startSide) && sidesOf(hex).length === 1);
		const path = [random.pick(starts)];
		const visited = new Set([hexKey(path[0])]);

		while (path.length <= RIVER_MAX_LENGTH) {
			const current = path.at(-1);
			if (path.length >= RIVER_MIN_LENGTH && onSide(current, endSide)) return path;

			const earlier = new Set(path.slice(0, -1).map(hexKey));
			const lastDirection = path.length > 1 ? edgeDirection(path.at(-2), current) : null;
			const candidates = neighbours(g, current).filter(({ hex }) => !visited.has(hexKey(hex))
				&& !neighbours(g, hex).some(({ hex: beside }) => earlier.has(hexKey(beside))));
			const choice = random.weighted(candidates, ({ hex, direction }) => {
				const before = stepsToSide(g, current, endSide);
				const after = stepsToSide(g, hex, endSide);
				let weight = after < before ? 6 : after === before ? 2 : 0.3;
				if (lastDirection !== null) {
					weight *= [1.5, 1, 0.15][turnBetween(direction, lastDirection)] ?? 0;
				}
				const land = terrain[hexIndex(g, hex)];
				if (land === PEAKS || land === CRAG) weight *= 0.3;
				if (land === LAKE) weight *= 1.5;
				return weight;
			});
			if (!choice) break;
			path.push(choice.hex);
			visited.add(hexKey(choice.hex));
		}
	}

	const col = Math.ceil(g.cols / 2);
	return Array.from({ length: g.rows }, (_, index) => ({ col, row: index + 1 }));
}

/**
 * Take hexes from a shuffled pool while each keeps its distance from those
 * already taken, easing the distance until enough fit.
 * @returns {{col: number, row: number}[]} Fewer than `count` only when the pool is too small.
 */
function spreadOut(random, pool, count, spacings) {
	for (const spacing of spacings) {
		for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
			const chosen = [];
			for (const hex of random.shuffle(pool)) {
				if (chosen.every((other) => hexDistance(other, hex) >= spacing)) chosen.push(hex);
				if (chosen.length === count) return chosen;
			}
		}
	}
	return random.shuffle(pool).slice(0, count);
}

/**
 * "Place 4 Holdings a good distance apart", none in a lake. Each rolls its
 * style, and one becomes the Seat of Power.
 */
function placeHoldings(random, g, realm) {
	const pool = allHexes(g).filter((hex) => realm.terrain[hexIndex(g, hex)] !== LAKE);
	const hexes = spreadOut(random, pool, HOLDING_COUNT, HOLDING_SPACINGS);
	const seat = random.die(hexes.length) - 1;
	return hexes.map((hex, index) => ({ id: null, hex, style: random.pick(HOLDING_STYLES), seat: index === seat, name: "" }));
}

/**
 * Two rolls on a d6-then-d12 table that no earlier roll in `used` has had.
 * @param {Set<string>} used
 * @returns {{d6: number, d12: number}}
 */
function uniqueRoll(random, used) {
	for (;;) {
		const roll = { d6: random.die(6), d12: random.die(12) };
		const key = `${roll.d6}-${roll.d12}`;
		if (used.has(key)) continue;
		used.add(key);
		return roll;
	}
}

/**
 * "Place 6 Myths in remote places. Number them 1-6." Remote means far from any
 * Holding. Each Myth rolls on the Myths table (p27), never twice the same.
 */
function placeMyths(random, g, realm) {
	const holdings = realm.holdings.map((holding) => holding.hex);
	const remoteness = (hex) => (holdings.length ? Math.min(...holdings.map((other) => hexDistance(other, hex))) : 0);
	const candidates = allHexes(g)
		.filter((hex) => !holdings.some((other) => sameHex(other, hex)))
		.sort((a, b) => remoteness(b) - remoteness(a));
	const remote = candidates.slice(0, Math.max(MYTH_COUNT, Math.ceil(candidates.length * REMOTE_SHARE)));

	const hexes = spreadOut(random, remote, MYTH_COUNT, MYTH_SPACINGS);
	const used = new Set();
	return hexes.map((hex, index) => ({ id: null, hex, number: index + 1, ...uniqueRoll(random, used), omen: 0, revealed: false }));
}

/**
 * "A typical Realm has 3 or 4 of each type of Landmark", in Wilderness hexes
 * without a Holding or Myth, one to a hex, spread across the map. A Sanctum
 * rolls on the Knights table (p26) for its Seer.
 */
function placeLandmarks(random, g, realm) {
	const taken = new Set([...realm.holdings, ...realm.myths].map((feature) => hexKey(feature.hex)));
	const extra = LANDMARKS_PER_TYPE.max - LANDMARKS_PER_TYPE.min + 1;
	const instances = random.shuffle(LANDMARK_TYPES.flatMap((type) =>
		new Array(LANDMARKS_PER_TYPE.min - 1 + random.die(extra)).fill(type)));

	const landmarks = [];
	const seers = new Set();
	for (const type of instances) {
		const open = allHexes(g).filter((hex) => !taken.has(hexKey(hex)));
		if (!open.length) break;
		const distanceToOthers = (hex) => (landmarks.length ? Math.min(...landmarks.map((other) => hexDistance(other.hex, hex))) : 0);
		const sample = Array.from({ length: Math.min(LANDMARK_SAMPLES, open.length) }, () => random.pick(open));
		const hex = sample.reduce((best, candidate) => (distanceToOthers(candidate) > distanceToOthers(best) ? candidate : best));
		taken.add(hexKey(hex));
		landmarks.push({ id: null, hex, type, name: "", seer: type === "sanctum" ? uniqueRoll(random, seers) : null, revealed: false });
	}
	return landmarks;
}

/**
 * Whether every hex can still be reached from every other without crossing a
 * blocked edge.
 * @param {object} g
 * @param {Set<string>} blocked Edge keys.
 * @returns {boolean}
 */
export function isConnected(g, blocked) {
	const start = { col: 1, row: 1 };
	const reached = new Set([hexKey(start)]);
	const queue = [start];
	while (queue.length) {
		const hex = queue.pop();
		for (const { hex: next } of neighbours(g, hex)) {
			const key = hexKey(next);
			if (reached.has(key) || blocked.has(edgeKey(hex, next))) continue;
			reached.add(key);
			queue.push(next);
		}
	}
	return reached.size === g.cols * g.rows;
}

/**
 * "Some Hexes have a Barrier on one or more of their edges, typically a sudden
 * altitude change or impassable feature." Barriers favour edges where the
 * terrain changes, keep off the river so it stays navigable, and never cut off
 * part of the map.
 */
function placeBarriers(random, g, realm) {
	const riverEdges = new Set(realm.river.slice(1).map((hex, index) => edgeKey(realm.river[index], hex)));
	const holdings = new Set(realm.holdings.map((holding) => hexKey(holding.hex)));
	const weightOf = (key) => {
		const [a, b] = parseEdgeKey(key);
		let weight = realm.terrain[hexIndex(g, a)] === realm.terrain[hexIndex(g, b)] ? 1 : 3;
		if (holdings.has(hexKey(a)) || holdings.has(hexKey(b))) weight *= 0.3;
		return weight;
	};

	const target = barrierCount(g);
	let candidates = interiorEdges(g).filter((key) => !riverEdges.has(key));
	const chosen = new Set();
	for (let tries = 0; chosen.size < target && tries < BARRIER_TRIES && candidates.length; tries++) {
		const key = random.weighted(candidates, weightOf);
		candidates = candidates.filter((candidate) => candidate !== key);
		chosen.add(key);
		if (!isConnected(g, chosen)) chosen.delete(key);
	}
	return [...chosen].map((edge) => ({ id: null, edge, revealed: false }));
}
