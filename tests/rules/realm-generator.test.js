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
			const { river } = realm;
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
			const riverEdges = new Set(realm.river.slice(1).map((hex, index) => edgeKey(realm.river[index], hex)));
			expect(edges.some((edge) => riverEdges.has(edge))).toBe(false);
			expect(isConnected(g, new Set(edges))).toBe(true);
			expect(realm.barriers.every((barrier) => barrier.revealed === false)).toBe(true);
		}
	});
});

describe("generateRiver", () => {
	it("falls back to a river straight down the middle when no walk gets across", () => {
		const stuck = { float: () => 0.5, die: () => 1, pick: (list) => list[0], shuffle: (list) => [...list], weighted: () => undefined };
		const river = generateRiver(stuck, g, new Array(144).fill(1));
		expect(river).toEqual(Array.from({ length: 12 }, (_, index) => ({ col: 6, row: index + 1 })));
	});
});

describe("isConnected", () => {
	it("notices a hex walled off from the rest", () => {
		expect(isConnected(g, new Set())).toBe(true);
		const corner = { col: 1, row: 1 };
		expect(isConnected(g, new Set([edgeKey(corner, { col: 2, row: 1 }), edgeKey(corner, { col: 1, row: 2 })]))).toBe(false);
	});
});
