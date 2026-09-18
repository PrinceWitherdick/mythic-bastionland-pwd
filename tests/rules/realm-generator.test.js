import { describe, expect, it } from "vitest";
import {
	HOLDING_COUNT,
	HOLDING_STYLES,
	LAKE,
	LANDMARKS_PER_TYPE,
	LANDMARK_TYPES,
	MYTH_COUNT,
	TERRAIN,
	barrierCount,
	validateRealm
} from "../../module/rules/realm.js";
import { edgeKey, hexDistance, hexIndex, hexKey, inRealm, parseEdgeKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { generateRealm, generateRiver, isConnected } from "../../module/rules/realm-generator.js";

const g = realmGeometry();
const seeds = Array.from({ length: 40 }, (_, index) => `seed-${index}`);
const realms = seeds.map((seed) => generateRealm({ seed, geometry: g }));

/** The sides of the map a hex touches. */
const sidesOf = ({ col, row }) => [
	row === 1 && "north",
	row === g.rows && "south",
	col === 1 && "west",
	col === g.cols && "east"
].filter(Boolean);

describe("generateRealm", () => {
	it("rolls the same Realm from the same seed, and another from another", () => {
		expect(generateRealm({ seed: "same", geometry: g })).toEqual(generateRealm({ seed: "same", geometry: g }));
		expect(generateRealm({ seed: "same", geometry: g })).not.toEqual(generateRealm({ seed: "other", geometry: g }));
		expect(realms[0].seed).toBe("seed-0");
	});

	it.each(seeds.map((seed, index) => [seed, realms[index]]))("rolls a Realm the rules allow from %s", (_seed, realm) => {
		expect(validateRealm(realm, g)).toEqual([]);
	});

	it("gives every hex a terrain", () => {
		for (const realm of realms) {
			expect(realm.terrain).toHaveLength(144);
			expect(realm.terrain.every((terrain) => terrain >= 1 && terrain <= TERRAIN.length)).toBe(true);
		}
	});

	it("runs a river from one side of the map to another", () => {
		for (const realm of realms) {
			const [river, ...more] = realm.rivers;
			expect(more).toEqual([]);
			expect(river.length).toBeGreaterThanOrEqual(8);
			expect(new Set(river.map(hexKey)).size).toBe(river.length);
			river.slice(1).forEach((hex, index) => expect(hexDistance(river[index], hex)).toBe(1));
			const start = sidesOf(river[0]);
			const end = sidesOf(river.at(-1));
			expect(start.length).toBeGreaterThan(0);
			expect(end.length).toBeGreaterThan(0);
			expect(end.some((side) => !start.includes(side))).toBe(true);
		}
	});

	it("places four Holdings apart from each other, out of the lakes, one the Seat of Power", () => {
		for (const realm of realms) {
			expect(realm.holdings).toHaveLength(HOLDING_COUNT);
			expect(realm.holdings.filter((holding) => holding.seat)).toHaveLength(1);
			for (const holding of realm.holdings) {
				expect(HOLDING_STYLES).toContain(holding.style);
				expect(realm.terrain[hexIndex(g, holding.hex)]).not.toBe(LAKE);
			}
			realm.holdings.forEach((a, index) => realm.holdings.slice(index + 1)
				.forEach((b) => expect(hexDistance(a.hex, b.hex)).toBeGreaterThanOrEqual(3)));
		}
	});

	it("numbers six hidden Myths, each a different roll, away from the Holdings", () => {
		for (const realm of realms) {
			expect(realm.myths.map((myth) => myth.number)).toEqual([1, 2, 3, 4, 5, 6].slice(0, MYTH_COUNT));
			expect(new Set(realm.myths.map((myth) => `${myth.d6}-${myth.d12}`)).size).toBe(MYTH_COUNT);
			const holdings = new Set(realm.holdings.map((holding) => hexKey(holding.hex)));
			for (const myth of realm.myths) {
				expect(holdings.has(hexKey(myth.hex))).toBe(false);
				expect(myth).toMatchObject({ omen: 0, revealed: false });
			}
		}
	});

	it("places 3 or 4 of each hidden Landmark, one to a hex, off Holdings and Myths", () => {
		for (const realm of realms) {
			for (const type of LANDMARK_TYPES) {
				const count = realm.landmarks.filter((landmark) => landmark.type === type).length;
				expect(count).toBeGreaterThanOrEqual(LANDMARKS_PER_TYPE.min);
				expect(count).toBeLessThanOrEqual(LANDMARKS_PER_TYPE.max);
			}
			const featureHexes = [...realm.holdings, ...realm.myths, ...realm.landmarks].map((feature) => hexKey(feature.hex));
			expect(new Set(featureHexes).size).toBe(featureHexes.length);
			expect(realm.landmarks.every((landmark) => landmark.revealed === false)).toBe(true);

			const sanctums = realm.landmarks.filter((landmark) => landmark.type === "sanctum");
			expect(sanctums.every((sanctum) => sanctum.seer)).toBe(true);
			expect(new Set(sanctums.map(({ seer }) => `${seer.d6}-${seer.d12}`)).size).toBe(sanctums.length);
			expect(realm.landmarks.filter((landmark) => landmark.type !== "sanctum").every((landmark) => landmark.seer === null)).toBe(true);
		}
	});

	it("puts Barriers on one sixth as many edges as hexes, off the river, without cutting off any hex", () => {
		for (const realm of realms) {
			const edges = realm.barriers.map((barrier) => barrier.edge);
			expect(edges).toHaveLength(barrierCount(g));
			expect(new Set(edges).size).toBe(edges.length);
			expect(edges.every((edge) => parseEdgeKey(edge)?.every((hex) => inRealm(g, hex)))).toBe(true);
			const riverEdges = new Set(realm.rivers.flatMap((river) => river.slice(1).map((hex, index) => edgeKey(river[index], hex))));
			expect(edges.some((edge) => riverEdges.has(edge))).toBe(false);
			expect(isConnected(g, new Set(edges))).toBe(true);
			expect(realm.barriers.every((barrier) => barrier.revealed === false)).toBe(true);
		}
	});
});

describe("generateRealm with a setup of the GM's own", () => {
	const custom = (setup, seed = "custom") => {
		const realm = generateRealm({ seed, setup });
		return { realm, g: realmGeometry({ cols: realm.cols, rows: realm.rows }) };
	};

	it("rolls the book's Realm, carrying no setup, when the setup is the book's", () => {
		expect(generateRealm({ seed: "same", setup: { ignoreRules: true, barriers: 24 } })).toEqual(generateRealm({ seed: "same", geometry: g }));
		expect(realms[0].setup).toBeUndefined();
	});

	it.each(["a", "b", "c", "d", "e"])("rolls a map of its own size and numbers from seed %s", (seed) => {
		const setup = { ignoreRules: true, cols: 20, rows: 9, cluster: 4, lakes: 0, holdings: 6, myths: 3, landmarks: { min: 1, max: 1 }, barriers: 10 };
		const { realm, g: own } = custom(setup, seed);
		expect(realm).toMatchObject({ cols: 20, rows: 9, setup: { ignoreRules: true, cols: 20, rows: 9 } });
		expect(realm.terrain).toHaveLength(180);
		expect(realm.terrain).not.toContain(LAKE);
		expect(realm.holdings).toHaveLength(6);
		expect(realm.holdings.filter((holding) => holding.seat)).toHaveLength(1);
		expect(realm.myths.map((myth) => myth.number)).toEqual([1, 2, 3]);
		expect(realm.landmarks).toHaveLength(LANDMARK_TYPES.length);
		expect(realm.barriers).toHaveLength(10);
		expect(isConnected(own, new Set(realm.barriers.map((barrier) => barrier.edge)))).toBe(true);
		expect(realm.rivers).toHaveLength(1);
		expect(validateRealm(realm, own)).toEqual([]);
	});

	it("leaves the parts it doesn't roll empty for the GM to draw", () => {
		const { realm, g: own } = custom({ roll: { terrain: false, rivers: false, holdings: false, barriers: false } });
		expect(realm.terrain.every((terrain) => terrain === 0)).toBe(true);
		expect(realm).toMatchObject({ rivers: [], holdings: [], barriers: [] });
		expect(realm.myths).toHaveLength(MYTH_COUNT);
		expect(realm.landmarks.length).toBeGreaterThanOrEqual(LANDMARK_TYPES.length * LANDMARKS_PER_TYPE.min);
		// Terrain still to be drawn isn't a problem.
		expect(validateRealm(realm, own)).toEqual([]);
	});

	it("spreads Myths over the whole map when there are no Holdings to be remote from", () => {
		const { realm } = custom({ roll: { holdings: false } }, "spread");
		expect(Math.max(...realm.myths.map((myth) => myth.hex.row))).toBeGreaterThan(6);
	});

	it("rolls nothing at all, for a Realm drawn entirely by hand", () => {
		const roll = Object.fromEntries(["terrain", "rivers", "holdings", "myths", "landmarks", "barriers"].map((part) => [part, false]));
		const { realm } = custom({ ignoreRules: true, cols: 5, rows: 4, roll });
		expect(realm).toMatchObject({ cols: 5, rows: 4, rivers: [], holdings: [], myths: [], landmarks: [], barriers: [] });
		expect(realm.terrain).toEqual(new Array(20).fill(0));
	});

	it("keeps what the base Realm has of the parts it doesn't roll, and places the rest around them", () => {
		const base = generateRealm({ seed: "base", geometry: g });
		const setup = { roll: { terrain: false, rivers: false, holdings: false } };
		for (const seed of ["k1", "k2", "k3"]) {
			const realm = generateRealm({ seed, setup, geometry: g, base });
			expect(realm.terrain).toEqual(base.terrain);
			expect(realm.rivers).toEqual(base.rivers);
			expect(realm.holdings).toEqual(base.holdings);
			expect(realm.myths).not.toEqual(base.myths);
			const hexes = [...realm.holdings, ...realm.myths, ...realm.landmarks].map((feature) => hexKey(feature.hex));
			expect(new Set(hexes).size).toBe(hexes.length);
			expect(validateRealm(realm, g)).toEqual([]);
		}
	});

	it("keeps every river drawn when the rivers aren't rolled, and rolls one river when they are", () => {
		const base = generateRealm({ seed: "base", geometry: g });
		base.rivers.push([{ col: 1, row: 1 }, { col: 1, row: 2 }]);
		expect(generateRealm({ seed: "k1", setup: { roll: { rivers: false } }, geometry: g, base }).rivers).toEqual(base.rivers);
		expect(generateRealm({ seed: "k1", setup: { roll: { terrain: false } }, geometry: g, base }).rivers).toHaveLength(1);
		// A setup saved before the rivers were named so.
		expect(generateRealm({ seed: "k1", setup: { roll: { river: false } }, geometry: g, base }).rivers).toEqual(base.rivers);
	});

	it("keeps Barriers off every river, since all of them are navigable", () => {
		const base = generateRealm({ seed: "base", geometry: g });
		// A second river down the west edge, where Barriers would otherwise often fall.
		const west = Array.from({ length: g.rows }, (_, index) => ({ col: 1, row: index + 1 }));
		base.rivers.push(west);
		const riverEdges = new Set(west.slice(1).map((hex, index) => edgeKey(west[index], hex)));
		for (const seed of ["b1", "b2", "b3", "b4", "b5"]) {
			const realm = generateRealm({ seed, setup: { roll: { rivers: false } }, geometry: g, base });
			expect(realm.barriers.filter((barrier) => riverEdges.has(barrier.edge))).toEqual([]);
		}
	});

	it("keeps rolled lakes off kept Holdings, which stand on dry land", () => {
		const base = generateRealm({ seed: "base", geometry: g });
		// As many lakes as the dice give, so one would often come down on a Holding.
		const setup = { ignoreRules: true, lakes: 99, roll: { holdings: false } };
		for (const seed of seeds) {
			const realm = generateRealm({ seed, setup, geometry: g, base });
			expect(realm.holdings).toEqual(base.holdings);
			expect(realm.holdings.filter((holding) => realm.terrain[hexIndex(g, holding.hex)] === LAKE)).toEqual([]);
		}
	});

	it("never runs a rolled river across a kept Barrier, so it stays navigable", () => {
		const base = generateRealm({ seed: "base", geometry: g });
		const barriers = new Set(base.barriers.map((barrier) => barrier.edge));
		for (const seed of seeds) {
			const [river] = generateRealm({ seed, setup: { roll: { barriers: false } }, geometry: g, base }).rivers;
			expect(river.slice(1).filter((hex, index) => barriers.has(edgeKey(river[index], hex)))).toEqual([]);
		}
	});

	it("keeps clear of kept Landmarks when rolling Holdings and Myths", () => {
		const base = generateRealm({ seed: "base", geometry: g });
		const realm = generateRealm({ seed: "clear", setup: { roll: { landmarks: false } }, geometry: g, base });
		expect(realm.landmarks).toEqual(base.landmarks);
		expect(validateRealm(realm, g).filter((problem) => problem.reason === "crowded")).toEqual([]);
	});

	it("repeats Seers only once every one on the Knights table has a Sanctum", () => {
		const { realm } = custom({ ignoreRules: true, cols: 30, rows: 30, landmarks: { min: 80, max: 80 }, barriers: 0 }, "crowd");
		const sanctums = realm.landmarks.filter((landmark) => landmark.type === "sanctum");
		expect(sanctums).toHaveLength(80);
		expect(new Set(sanctums.map(({ seer }) => `${seer.d6}-${seer.d12}`)).size).toBe(72);
	});

	it("rolls a small map", () => {
		const { realm, g: own } = custom({ ignoreRules: true, cols: 3, rows: 3, holdings: 2, myths: 2, landmarks: { min: 0, max: 0 }, barriers: 1 });
		expect(realm.terrain).toHaveLength(9);
		expect(realm.rivers).toHaveLength(1);
		expect(realm.holdings).toHaveLength(2);
		expect(realm.myths).toHaveLength(2);
		expect(validateRealm(realm, own)).toEqual([]);
	});
});

describe("generateRiver", () => {
	it("falls back to a river straight down the middle when no walk gets across", () => {
		const stuck = { float: () => 0.5, die: () => 1, pick: (list) => list[0], shuffle: (list) => [...list], weighted: () => undefined };
		const river = generateRiver(stuck, g, new Array(144).fill(1));
		expect(river).toEqual(Array.from({ length: 12 }, (_, index) => ({ col: 6, row: index + 1 })));
	});

	it("falls back to the nearest column to the middle that no Barrier crosses", () => {
		const stuck = { float: () => 0.5, die: () => 1, pick: (list) => list[0], shuffle: (list) => [...list], weighted: () => undefined };
		const blocked = new Set([edgeKey({ col: 6, row: 4 }, { col: 6, row: 5 })]);
		const river = generateRiver(stuck, g, new Array(144).fill(1), blocked);
		expect(river).toEqual(Array.from({ length: 12 }, (_, index) => ({ col: 5, row: index + 1 })));
	});
});

describe("isConnected", () => {
	it("notices a hex walled off from the rest", () => {
		expect(isConnected(g, new Set())).toBe(true);
		const corner = { col: 1, row: 1 };
		expect(isConnected(g, new Set([edgeKey(corner, { col: 2, row: 1 }), edgeKey(corner, { col: 1, row: 2 })]))).toBe(false);
	});
});
