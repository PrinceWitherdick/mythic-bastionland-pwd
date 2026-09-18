/**
 * Rolling a Realm the way Creating a Realm (p14) describes it: clusters of
 * terrain, a river crossing the land, four Holdings a good distance apart, six
 * Myths in remote places, three or four of each Landmark, and Barriers on one
 * sixth as many edges as there are hexes. A setup from realm-setup.js can
 * change the numbers or leave parts to draw by hand. Seeded, so the same seed
 * and setup roll the same Realm. Pure, so it can be tested without Foundry.
 */
import { createRandom } from "./random.js";
import { HOLDING_STYLES, LAKE, LANDMARK_TYPES, TERRAIN, emptyRealm } from "./realm.js";
import { BOOK_SETUP, SETUP_PARTS, isBookSetup, normaliseRealmSetup, setupBarriers } from "./realm-setup.js";
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
	turnBetween
} from "./realm-geometry.js";

const PEAKS = TERRAIN.indexOf("peaks") + 1;
const CRAG = TERRAIN.indexOf("crag") + 1;

const RIVER_ATTEMPTS = 50;
const RIVER_MIN_LENGTH = 8;
const RIVER_MAX_LENGTH = 40;
const SIDES = Object.freeze(["north", "east", "south", "west"]);
const OPPOSITE = Object.freeze({ north: "south", south: "north", east: "west", west: "east" });

/** How far apart Holdings and Myths are first placed, easing off, on the book's map with the book's numbers. */
const HOLDING_SPACINGS = Object.freeze([6, 5, 4, 3]);
const MYTH_SPACINGS = Object.freeze([4, 3, 2, 1]);
const PLACEMENT_ATTEMPTS = 100;

/** The hexes of the book's map, which the lengths and spacings here were tuned for. */
const BOOK_HEXES = BOOK_SETUP.cols * BOOK_SETUP.rows;

/** Share of hexes, furthest from any Holding, that Myths are first placed among. */
const REMOTE_SHARE = 0.4;

/** Hexes looked at for each Landmark; the one furthest from other Landmarks wins. */
const LANDMARK_SAMPLES = 8;

const BARRIER_TRIES = 2000;

/**
 * @param {object} options
 * @param {string} options.seed
 * @param {Partial<import("./realm-setup.js").RealmSetup>|null} [options.setup] Omit for the book's.
 * @param {object} [options.geometry] From realmGeometry. Omit for the setup's size.
 * @param {import("./realm.js").Realm|null} [options.base] A Realm on the same map whose parts the setup doesn't
 *   roll are kept, such as the one a reroll replaces. Rolled parts keep clear of them.
 * @returns {import("./realm.js").Realm} Carrying its `setup` unless that's the book's.
 */
export function generateRealm({ seed, setup = null, geometry = null, base = null }) {
	const rules = normaliseRealmSetup(setup);
	const g = geometry ?? realmGeometry({ cols: rules.cols, rows: rules.rows });
	const random = createRandom(seed);
	const realm = emptyRealm(g, seed);
	if (!isBookSetup(rules)) realm.setup = { ...rules, cols: g.cols, rows: g.rows };
	for (const part of SETUP_PARTS) {
		if (!rules.roll[part] && base?.[part]) realm[part] = structuredClone(base[part]);
	}

	// Kept Holdings stand on dry land, and a kept Barrier is never crossed by the river, which stays navigable.
	const dry = new Set(realm.holdings.map((holding) => hexKey(holding.hex)));
	const blocked = new Set(realm.barriers.map((barrier) => barrier.edge));
	if (rules.roll.terrain) realm.terrain = generateTerrain(random, g, rules, dry);
	if (rules.roll.rivers) realm.rivers = [generateRiver(random, g, realm.terrain, blocked)].filter((course) => course.length);
	if (rules.roll.holdings) realm.holdings = placeHoldings(random, g, realm, rules.holdings);
	if (rules.roll.myths) realm.myths = placeMyths(random, g, realm, rules.myths);
	if (rules.roll.landmarks) realm.landmarks = placeLandmarks(random, g, realm, rules.landmarks);
	if (rules.roll.barriers) realm.barriers = placeBarriers(random, g, realm, setupBarriers({ ...rules, cols: g.cols, rows: g.rows }));
	return realm;
}

/**
 * Spacings tuned for the book's map and numbers, stretched for a bigger map and
 * shrunk for more things on it. The book's own come back unchanged.
 * @param {readonly number[]} spacings
 * @param {object} g
 * @param {number} count How many are placed.
 * @param {number} bookCount How many the book places.
 * @returns {number[]}
 */
function scaledSpacings(spacings, g, count, bookCount) {
	const scale = Math.sqrt((g.cols * g.rows * bookCount) / (BOOK_HEXES * Math.max(1, count)));
	return [...new Set(spacings.map((spacing) => Math.max(1, Math.round(spacing * scale))))];
}

/**
 * "Create clusters of d12 hexes of the same terrain type": each cluster rolls a
 * d12 for its terrain and another for its size, then grows from a hex beside
 * the land already drawn, favouring compact shapes.
 * @param {{cluster: number, lakes: number}} rules The die for a cluster's size, and the most lake clusters.
 * @param {Set<string>} [dry] Hexes a lake mustn't cover, where kept Holdings stand.
 * @returns {number[]} Terrain for each hex in `hexIndex` order.
 */
function generateTerrain(random, g, { cluster: sizeDie, lakes: maxLakes }, dry = new Set()) {
	const terrain = new Array(g.cols * g.rows).fill(0);
	const isSet = (hex) => terrain[hexIndex(g, hex)] > 0;
	let lakes = 0;

	for (;;) {
		const open = allHexes(g).filter((hex) => !isSet(hex));
		if (!open.length) return terrain;
		const frontier = open.filter((hex) => neighbours(g, hex).some(({ hex: next }) => isSet(next)));
		const start = random.pick(frontier.length ? frontier : open);

		let type = random.die(TERRAIN.length);
		while (type === LAKE && (lakes >= maxLakes || dry.has(hexKey(start)))) type = random.die(TERRAIN.length);
		if (type === LAKE) lakes++;
		const size = random.die(sizeDie);

		const cluster = new Set([hexKey(start)]);
		terrain[hexIndex(g, start)] = type;
		while (cluster.size < size) {
			const candidates = new Map();
			for (const key of cluster) {
				for (const { hex } of neighbours(g, parseHexKey(key))) {
					if (!isSet(hex) && !(type === LAKE && dry.has(hexKey(hex)))) candidates.set(hexKey(hex), hex);
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
 * @param {Set<string>} [blocked] Edges with a Barrier, which the river doesn't cross.
 * @returns {{col: number, row: number}[]} Source to mouth.
 */
export function generateRiver(random, g, terrain, blocked = new Set()) {
	const onSide = (hex, side) => stepsToSide(g, hex, side) === 0;
	const sidesOf = (hex) => SIDES.filter((side) => onSide(hex, side));
	// Tuned for the book's 12 by 12: a smaller map takes a shorter river, a bigger one a longer.
	const shortest = Math.max(2, Math.round((RIVER_MIN_LENGTH * Math.min(g.cols, g.rows)) / BOOK_SETUP.cols));
	const longest = Math.max(RIVER_MAX_LENGTH, Math.round((RIVER_MAX_LENGTH * Math.max(g.cols, g.rows)) / BOOK_SETUP.cols));

	for (let attempt = 0; attempt < RIVER_ATTEMPTS; attempt++) {
		const startSide = random.pick(SIDES);
		const perpendicular = SIDES.filter((side) => side !== startSide && side !== OPPOSITE[startSide]);
		const endSide = random.float() < 0.7 ? OPPOSITE[startSide] : random.pick(perpendicular);
		const starts = allHexes(g).filter((hex) => onSide(hex, startSide) && sidesOf(hex).length === 1);
		if (!starts.length) break;
		const path = [random.pick(starts)];
		const visited = new Set([hexKey(path[0])]);

		while (path.length <= longest) {
			const current = path.at(-1);
			if (path.length >= shortest && onSide(current, endSide)) return path;

			const earlier = new Set(path.slice(0, -1).map(hexKey));
			const lastDirection = path.length > 1 ? edgeDirection(path.at(-2), current) : null;
			const candidates = neighbours(g, current).filter(({ hex }) => !visited.has(hexKey(hex))
				&& !blocked.has(edgeKey(current, hex))
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

	// Straight down the column nearest the middle that no Barrier crosses.
	const straight = (col) => Array.from({ length: g.rows }, (_, index) => ({ col, row: index + 1 }));
	const middle = Math.ceil(g.cols / 2);
	const columns = Array.from({ length: g.cols }, (_, index) => index + 1).sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b);
	const clear = columns.map(straight).find((course) => course.slice(1).every((hex, index) => !blocked.has(edgeKey(course[index], hex))));
	return clear ?? straight(middle);
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
 * @param {import("./realm.js").Realm} realm
 * @returns {Set<string>} The hexes already holding a Holding, Myth or Landmark.
 */
const featureHexes = (realm) => new Set([...realm.holdings, ...realm.myths, ...realm.landmarks].map((feature) => hexKey(feature.hex)));

/**
 * "Place 4 Holdings a good distance apart", none in a lake. Each rolls its
 * style, and one becomes the Seat of Power.
 * @param {number} count
 */
function placeHoldings(random, g, realm, count) {
	if (count <= 0) return [];
	const taken = featureHexes(realm);
	const pool = allHexes(g).filter((hex) => realm.terrain[hexIndex(g, hex)] !== LAKE && !taken.has(hexKey(hex)));
	const hexes = spreadOut(random, pool, count, scaledSpacings(HOLDING_SPACINGS, g, count, BOOK_SETUP.holdings));
	if (!hexes.length) return [];
	const seat = random.die(hexes.length) - 1;
	return hexes.map((hex, index) => ({ id: null, hex, style: random.pick(HOLDING_STYLES), seat: index === seat, name: "" }));
}

/** Entries on a d6-then-d12 table. */
const TABLE_SIZE = 6 * 12;

/**
 * Two rolls on a d6-then-d12 table that no earlier roll in `used` has had,
 * until every entry has come up.
 * @param {Set<string>} used
 * @returns {{d6: number, d12: number}}
 */
function uniqueRoll(random, used) {
	for (;;) {
		const roll = { d6: random.die(6), d12: random.die(12) };
		const key = `${roll.d6}-${roll.d12}`;
		if (used.has(key) && used.size < TABLE_SIZE) continue;
		used.add(key);
		return roll;
	}
}

/**
 * "Place 6 Myths in remote places. Number them 1-6." Remote means far from any
 * Holding. Each Myth rolls on the Myths table (p27), never twice the same.
 * @param {number} count
 */
function placeMyths(random, g, realm, count) {
	if (count <= 0) return [];
	const holdings = realm.holdings.map((holding) => holding.hex);
	const taken = featureHexes(realm);
	const remoteness = (hex) => Math.min(...holdings.map((other) => hexDistance(other, hex)));
	const candidates = allHexes(g).filter((hex) => !taken.has(hexKey(hex)));
	// Without Holdings, nowhere is more remote than anywhere else.
	const remote = holdings.length
		? candidates.sort((a, b) => remoteness(b) - remoteness(a)).slice(0, Math.max(count, Math.ceil(candidates.length * REMOTE_SHARE)))
		: candidates;

	const hexes = spreadOut(random, remote, count, scaledSpacings(MYTH_SPACINGS, g, count, BOOK_SETUP.myths));
	const used = new Set();
	return hexes.map((hex, index) => ({ id: null, hex, number: index + 1, ...uniqueRoll(random, used), omen: 0, revealed: false }));
}

/**
 * "A typical Realm has 3 or 4 of each type of Landmark", in Wilderness hexes
 * without a Holding or Myth, one to a hex, spread across the map. A Sanctum
 * rolls on the Knights table (p26) for its Seer.
 * @param {{min: number, max: number}} perType
 */
function placeLandmarks(random, g, realm, perType) {
	const taken = featureHexes(realm);
	const extra = perType.max - perType.min + 1;
	const instances = random.shuffle(LANDMARK_TYPES.flatMap((type) =>
		new Array(perType.min - 1 + random.die(extra)).fill(type)));

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
 * terrain changes, keep off the rivers so they stay navigable, and never cut off
 * part of the map.
 * @param {number} target How many: by the book, one sixth as many as there are hexes.
 */
function placeBarriers(random, g, realm, target) {
	const riverEdges = new Set(realm.rivers.flatMap((river) => river.slice(1).map((hex, index) => edgeKey(river[index], hex))));
	const holdings = new Set(realm.holdings.map((holding) => hexKey(holding.hex)));
	const weightOf = (key) => {
		const [a, b] = parseEdgeKey(key);
		let weight = realm.terrain[hexIndex(g, a)] === realm.terrain[hexIndex(g, b)] ? 1 : 3;
		if (holdings.has(hexKey(a)) || holdings.has(hexKey(b))) weight *= 0.3;
		return weight;
	};

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
