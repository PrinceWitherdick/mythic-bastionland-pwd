import { describe, expect, it } from "vitest";
import { createRandom } from "../../module/rules/random.js";
import { emptyRealm, featureAt, validateRealm } from "../../module/rules/realm.js";
import { editFeature, placeFeature } from "../../module/rules/realm-edits.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";
import { keepMythPicks, generateRealm } from "../../module/rules/realm-generator.js";
import { mythRolls, rollFreeSeer } from "../../module/rules/realm-myths.js";
import { BOOK_SETUP, normaliseRealmSetup, sizedCounts } from "../../module/rules/realm-setup.js";
import { drawingShortfalls, drawingTally, walledOffHexes } from "../../module/rules/realm-drawing.js";
import { keepBarriersMet } from "../../module/rules/hex-shared.js";
import { edgeKey, neighbours } from "../../module/rules/realm-geometry.js";

/**
 * Making a Realm by hand (p14, p202): what's placed is rolled as a rolled
 * Realm's is, the sheet's numbers fit the map's size, and the Referee hears
 * of hexes walled off.
 */

const g = realmGeometry();
const hex = (col, row) => ({ col, row });
const blank = () => ({ ...emptyRealm(g, "test"), terrain: new Array(g.cols * g.rows).fill(1) });
const rollKey = ({ d6, d12 }) => `${d6}-${d12}`;

describe("a Myth placed by hand", () => {
	it("rolls on the Myths table for one the Realm hasn't got, not the table's first every time (p14, p27)", () => {
		let realm = blank();
		for (let col = 1; col <= 6; col++) realm = placeFeature(realm, g, hex(col, 1), { kind: "myth" }, { random: createRandom(`m${col}`) });
		const rolls = realm.myths.map(rollKey);
		expect(realm.myths.map((myth) => myth.number)).toEqual([1, 2, 3, 4, 5, 6]);
		expect(new Set(rolls).size).toBe(6);
		expect(validateRealm(realm, g)).toEqual([]);
	});

	it("keeps the roll it had when it moves, or when one is given", () => {
		const first = placeFeature(blank(), g, hex(1, 1), { kind: "myth", d6: 3, d12: 7 }, { random: createRandom("a") });
		expect(rollKey(first.myths[0])).toBe("3-7");
		const moved = placeFeature(first, g, hex(4, 4), { kind: "myth", number: 1 }, { random: createRandom("b") });
		expect(featureAt(moved, hex(4, 4)).myth).toMatchObject({ number: 1, d6: 3, d12: 7 });
	});

	it("is said to repeat a Myth the Realm already holds, in its own hex", () => {
		let realm = placeFeature(blank(), g, hex(1, 1), { kind: "myth", d6: 2, d12: 5 });
		realm = placeFeature(realm, g, hex(5, 5), { kind: "myth", d6: 2, d12: 5 });
		expect(validateRealm(realm, g)).toEqual([{ kind: "myth", reason: "repeated", key: "5,5" }]);
	});
});

describe("a Sanctum placed by hand", () => {
	it("rolls for its Seer on the Knights table, never one another Sanctum has (p14, p26)", () => {
		let realm = blank();
		for (let col = 1; col <= 8; col++) realm = placeFeature(realm, g, hex(col, 2), { kind: "landmark", type: "sanctum" }, { random: createRandom(`s${col}`) });
		const seers = realm.landmarks.map((landmark) => landmark.seer);
		expect(seers.every(Boolean)).toBe(true);
		expect(new Set(seers.map(rollKey)).size).toBe(8);
	});

	it("rolls one when another Landmark becomes a Sanctum, and keeps the Seer it has", () => {
		const dwelling = placeFeature(blank(), g, hex(3, 3), { kind: "landmark", type: "dwelling" }, { random: createRandom("d") });
		expect(featureAt(dwelling, hex(3, 3)).landmark.seer).toBeNull();
		const sanctum = editFeature(dwelling, g, hex(3, 3), { type: "sanctum" }, { random: createRandom("e") });
		const { seer } = featureAt(sanctum, hex(3, 3)).landmark;
		expect(seer).toEqual({ d6: expect.any(Number), d12: expect.any(Number) });
		const renamed = editFeature(sanctum, g, hex(3, 3), { name: "Still Pool" }, { random: createRandom("f") });
		expect(featureAt(renamed, hex(3, 3)).landmark.seer).toEqual(seer);
	});

	it("is left without a Seer where nothing rolls, as before", () => {
		const realm = placeFeature(blank(), g, hex(3, 3), { kind: "landmark", type: "sanctum" });
		expect(featureAt(realm, hex(3, 3)).landmark.seer).toBeNull();
	});

	it("finds no Seer once every one has a Sanctum", () => {
		const landmarks = mythRolls().map(({ d6, d12 }) => ({ seer: { d6, d12 } }));
		expect(rollFreeSeer(createRandom("x"), landmarks)).toBeNull();
		expect(rollFreeSeer(createRandom("x"), landmarks.slice(1))).toEqual({ d6: landmarks[0].seer.d6, d12: landmarks[0].seer.d12 });
	});
});

describe("a typical Realm's numbers on a map of another size (p202)", () => {
	it("are the book's own on 12 by 12", () => {
		expect(sizedCounts(BOOK_SETUP)).toEqual({ holdings: 4, myths: 6, landmarks: { min: 3, max: 4 } });
	});

	it("are a quarter on a quarter of the hexes, with at least one of each", () => {
		expect(sizedCounts({ cols: 6, rows: 6 })).toEqual({ holdings: 1, myths: 2, landmarks: { min: 1, max: 1 } });
		expect(sizedCounts({ cols: 3, rows: 3 })).toEqual({ holdings: 1, myths: 1, landmarks: { min: 1, max: 1 } });
	});

	it("never ask for more than six Myths", () => {
		expect(sizedCounts({ cols: 30, rows: 30 })).toMatchObject({ holdings: 25, myths: 6 });
	});

	it("are what a setup sized to the map asks for, and the book's on the book's map", () => {
		expect(normaliseRealmSetup({ sizedTo: { cols: 6, rows: 6 }, cols: 6, rows: 6 })).toMatchObject({ cols: 6, rows: 6, holdings: 1, myths: 2, landmarks: { min: 1, max: 1 } });
		expect(normaliseRealmSetup({ sizedTo: BOOK_SETUP })).toEqual(normaliseRealmSetup());
	});

	it("set the drawing's targets", () => {
		const small = realmGeometry({ cols: 6, rows: 6 });
		const realm = { ...emptyRealm(small, "small"), terrain: new Array(36).fill(1) };
		const tally = drawingTally(realm);
		expect(tally.holdings[0]).toMatchObject({ target: 1 });
		expect(tally.myths[0]).toMatchObject({ target: 2 });
		expect(tally.landmarks[0]).toMatchObject({ target: 1, max: 1 });
		expect(tally.barriers[0]).toMatchObject({ target: 6 });
		expect(drawingTally(blank()).landmarks[0]).toMatchObject({ target: 3, max: 4 });
	});
});

describe("hexes walled off by Barriers", () => {
	it("are none on a rolled Realm", () => {
		expect(walledOffHexes(generateRealm({ seed: "walls" }), g)).toBe(0);
	});

	it("are counted where Barriers drawn by hand ring part of the map", () => {
		const ring = (middle) => neighbours(g, middle).map(({ hex: next }) => ({ id: null, edge: edgeKey(middle, next), revealed: false }));
		const barriers = ring(hex(6, 6));
		expect(walledOffHexes({ ...blank(), barriers }, g)).toBe(1);
		// One way out is enough.
		expect(walledOffHexes({ ...blank(), barriers: barriers.slice(1) }, g)).toBe(0);
		// Two hexes walled off apart count as two.
		expect(walledOffHexes({ ...blank(), barriers: [...barriers, ...ring(hex(2, 9))] }, g)).toBe(2);
	});
});

describe("Myths settled before the map is rolled again", () => {
	it("keep their numbers and which Myths they are, in the new Realm's places for them", () => {
		const before = generateRealm({ seed: "before" });
		const picks = before.myths.map((myth, index) => (index === 1 ? { ...myth, d6: null, d12: null, own: "Journal1" } : myth));
		const after = generateRealm({ seed: "after" });
		const kept = keepMythPicks(createRandom("k"), g, after, picks);
		expect(kept.map((myth) => myth.number)).toEqual([1, 2, 3, 4, 5, 6]);
		expect(kept.map((myth) => myth.own ?? rollKey(myth))).toEqual(picks.map((myth) => myth.own ?? rollKey(myth)));
		expect(kept.map((myth) => myth.hex)).toEqual(after.myths.map((myth) => myth.hex));
		expect(kept.every((myth) => myth.omen === 0 && !myth.revealed)).toBe(true);
	});

	it("find a remote hex for a number the new roll has none for", () => {
		const after = generateRealm({ seed: "few", setup: { ignoreRules: true, myths: 2 } });
		const picks = generateRealm({ seed: "many" }).myths;
		const kept = keepMythPicks(createRandom("k"), g, after, picks);
		expect(kept).toHaveLength(6);
		expect(new Set(kept.map((myth) => `${myth.hex.col},${myth.hex.row}`)).size).toBe(6);
		expect(validateRealm({ ...after, myths: kept }, g)).toEqual([]);
	});
});

describe("Barriers met, after the Realm is rolled again", () => {
	const shared = {
		version: 1,
		hexes: {
			"1,1": { told: [], met: [{ edge: "a" }, { edge: "b" }] },
			"2,2": { told: [], met: [{ edge: "c" }] },
			"3,3": { told: [{ id: "t", note: "Kept" }], met: [{ edge: "d" }] }
		}
	};

	it("keep only those still standing found on the map, and the rest of what's told", () => {
		const kept = keepBarriersMet(shared, new Set(["b"]));
		expect(kept.hexes).toEqual({ "1,1": { told: [], met: [{ edge: "b" }] }, "3,3": { told: [{ id: "t", note: "Kept" }] } });
	});

	it("are left alone where every one still stands", () => {
		expect(keepBarriersMet(shared, new Set(["a", "b", "c", "d"]))).toBe(shared);
	});
});

describe("the shortfalls of a Realm drawn to the book", () => {
	it("are none for a rolled one", () => {
		expect(drawingShortfalls(generateRealm({ seed: "full" }))).toEqual([]);
	});
});
