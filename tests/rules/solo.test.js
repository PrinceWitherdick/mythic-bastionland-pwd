import { describe, expect, it } from "vitest";
import { realmPlaces } from "../../module/rules/gm-toolkit.js";
import { emptyRealm, featureAt, hexSummary } from "../../module/rules/realm.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";
import { hidesKind, mythKnown, soloRealm } from "../../module/rules/solo.js";

const g = realmGeometry({ cols: 12, rows: 12 });
const hex = (col, row) => ({ col, row });

function realmWith() {
	const realm = emptyRealm(g);
	realm.terrain = realm.terrain.map((_, index) => (index % 12) + 1);
	realm.rivers = [[hex(1, 1), hex(1, 2)]];
	realm.holdings = [{ id: "h1", hex: hex(2, 2), style: "town", seat: true, name: "Crowndon" }];
	realm.myths = [
		{ id: "m1", hex: hex(5, 5), number: 1, d6: 2, d12: 3, omen: 0, revealed: false },
		{ id: "m2", hex: hex(6, 6), number: 2, d6: 4, d12: 5, omen: 2, revealed: false },
		{ id: "m3", hex: hex(7, 7), number: 3, d6: 6, d12: 1, omen: 0, revealed: true }
	];
	realm.landmarks = [
		{ id: "l1", hex: hex(3, 3), type: "ruin", name: "", seer: null, revealed: false },
		{ id: "l2", hex: hex(4, 4), type: "hazard", name: "The Maw", seer: null, revealed: true }
	];
	realm.barriers = [
		{ id: "b1", edge: "a", revealed: false },
		{ id: "b2", edge: "b", revealed: true }
	];
	return realm;
}

describe("hidesKind", () => {
	it("keeps Myths, Landmarks and Barriers, and nothing else", () => {
		expect(["myth", "landmark", "barrier"].every(hidesKind)).toBe(true);
		expect(["terrain", "river", "holding", "seat", "map", undefined].some(hidesKind)).toBe(false);
	});
});

describe("mythKnown", () => {
	it("names a Myth once its hex is found or an Omen met", () => {
		expect(mythKnown({ omen: 0, revealed: false })).toBe(false);
		expect(mythKnown({ omen: 1, revealed: false })).toBe(true);
		expect(mythKnown({ omen: 0, revealed: true })).toBe(true);
		expect(mythKnown(null)).toBe(false);
	});
});

describe("soloRealm", () => {
	const realm = realmWith();
	const solo = soloRealm(realm);

	it("leaves terrain, rivers and Holdings as they are", () => {
		expect(solo.terrain).toEqual(realm.terrain);
		expect(solo.rivers).toEqual(realm.rivers);
		expect(solo.holdings).toEqual(realm.holdings);
	});

	it("keeps every Myth's place in the list, and nothing of one not yet met", () => {
		expect(solo.myths.map((myth) => myth.number)).toEqual([1, 2, 3]);
		expect(solo.myths[0]).toEqual({ id: "m1", hex: null, number: 1, d6: null, d12: null, omen: 0, revealed: false, unknown: true });
	});

	it("names a Myth whose Omen was met, but keeps its hex until it's found", () => {
		expect(solo.myths[1]).toMatchObject({ number: 2, d6: 4, d12: 5, omen: 2, hex: null });
		expect(solo.myths[1].unknown).toBeUndefined();
		expect(solo.myths[2]).toEqual(realm.myths[2]);
	});

	it("leaves out hidden Landmarks and Barriers", () => {
		expect(solo.landmarks.map((landmark) => landmark.id)).toEqual(["l2"]);
		expect(solo.barriers.map((barrier) => barrier.id)).toEqual(["b2"]);
	});

	it("changes nothing of the Realm given", () => {
		expect(realm.myths[0].d6).toBe(2);
		expect(realm.landmarks).toHaveLength(2);
	});

	it("shows nothing in a hex still keeping a secret", () => {
		expect(featureAt(solo, hex(5, 5)).myth).toBeNull();
		expect(featureAt(solo, hex(6, 6)).myth).toBeNull();
		expect(featureAt(solo, hex(3, 3)).landmark).toBeNull();
		expect(hexSummary(solo, g, hex(5, 5), { showHidden: true }).myth).toBeNull();
		expect(hexSummary(solo, g, hex(7, 7), { showHidden: true }).myth).toEqual({ number: 3, revealed: true });
	});

	it("leaves hidden Landmarks off the Toolkit's Places", () => {
		const places = realmPlaces(solo, { hexes: {} });
		expect(places.landmarks.map((landmark) => landmark.id)).toEqual(["l2"]);
		expect(places.holdings.map((holding) => holding.id)).toEqual(["h1"]);
	});
});
