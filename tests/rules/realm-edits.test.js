import { describe, expect, it } from "vitest";
import { emptyRealm, featureAt, terrainAt } from "../../module/rules/realm.js";
import { edgeKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import {
	barrierState,
	editFeature,
	nextBarrierState,
	paintTerrain,
	placeFeature,
	setBarrier,
	setOmen,
	setRevealed,
	unusedMythNumbers
} from "../../module/rules/realm-edits.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });

function sampleRealm() {
	const realm = emptyRealm(g, "edits");
	realm.terrain.fill(8);
	realm.holdings = [{ id: "h1", hex: hex(2, 2), style: "castle", seat: true, name: "Greyhold" }];
	realm.myths = [{ id: "m1", hex: hex(6, 6), number: 1, d6: 2, d12: 3, omen: 2, revealed: false }];
	realm.landmarks = [{ id: "l1", hex: hex(9, 9), type: "sanctum", name: "", seer: { d6: 4, d12: 5 }, revealed: false }];
	return realm;
}

describe("paintTerrain", () => {
	it("paints hexes on the map and leaves the original alone", () => {
		const realm = sampleRealm();
		const painted = paintTerrain(realm, g, [hex(1, 1), hex(3, 3), hex(40, 1)], 10);
		expect(terrainAt(painted, g, hex(1, 1))).toBe(10);
		expect(terrainAt(painted, g, hex(3, 3))).toBe(10);
		expect(terrainAt(realm, g, hex(1, 1))).toBe(8);
		expect(paintTerrain(realm, g, [hex(1, 1)], 13)).toBe(realm);
	});
});

describe("placeFeature", () => {
	it("replaces what's in a hex, keeping an id while it stays the same kind", () => {
		const realm = sampleRealm();
		const renamed = placeFeature(realm, g, hex(2, 2), { kind: "holding", style: "tower", name: "Stillwatch", seat: true });
		expect(renamed.holdings).toEqual([{ id: "h1", hex: hex(2, 2), style: "tower", seat: true, name: "Stillwatch" }]);

		const swapped = placeFeature(realm, g, hex(2, 2), { kind: "landmark", type: "ruin" });
		expect(swapped.holdings).toEqual([]);
		expect(featureAt(swapped, hex(2, 2)).landmark).toMatchObject({ id: null, type: "ruin", seer: null, revealed: false });

		expect(featureAt(placeFeature(realm, g, hex(6, 6), null), hex(6, 6))).toEqual({ holding: null, myth: null, landmark: null });
	});

	it("moves the Seat of Power to a new Seat", () => {
		const realm = placeFeature(sampleRealm(), g, hex(10, 3), { kind: "holding", style: "town", seat: true });
		expect(realm.holdings.filter((holding) => holding.seat).map((holding) => holding.hex)).toEqual([hex(10, 3)]);
	});

	it("gives a new Myth the first free number, and moves a Myth that takes its number", () => {
		const realm = sampleRealm();
		const added = placeFeature(realm, g, hex(4, 10), { kind: "myth" });
		expect(featureAt(added, hex(4, 10)).myth).toMatchObject({ id: null, number: 2, d6: 1, d12: 1, omen: 0, revealed: false });
		expect(unusedMythNumbers(added)).toEqual([3, 4, 5, 6]);

		const moved = placeFeature(realm, g, hex(11, 11), { kind: "myth", number: 1 });
		expect(moved.myths).toEqual([{ id: "m1", hex: hex(11, 11), number: 1, d6: 2, d12: 3, omen: 2, revealed: false }]);
	});

	it("keeps a Sanctum's Seer and drops it for other Landmarks", () => {
		const realm = sampleRealm();
		expect(featureAt(placeFeature(realm, g, hex(9, 9), { kind: "landmark", type: "sanctum", name: "Stone Circle" }), hex(9, 9)).landmark)
			.toMatchObject({ id: "l1", name: "Stone Circle", seer: { d6: 4, d12: 5 } });
		expect(featureAt(placeFeature(realm, g, hex(9, 9), { kind: "landmark", type: "sanctum", seer: { d6: 6, d12: 12 } }), hex(9, 9)).landmark.seer)
			.toEqual({ d6: 6, d12: 12 });
		expect(featureAt(placeFeature(realm, g, hex(9, 9), { kind: "landmark", type: "hazard" }), hex(9, 9)).landmark.seer).toBeNull();
	});

	it("ignores hexes off the map and kinds it doesn't know", () => {
		const realm = sampleRealm();
		expect(placeFeature(realm, g, hex(0, 3), { kind: "holding" })).toBe(realm);
		expect(placeFeature(realm, g, hex(3, 3), { kind: "dragon" })).toBe(realm);
	});
});

describe("editFeature", () => {
	it("changes one thing about a Holding and keeps the rest", () => {
		const realm = sampleRealm();
		expect(featureAt(editFeature(realm, g, hex(2, 2), { name: "Stillwatch" }), hex(2, 2)).holding)
			.toEqual({ id: "h1", hex: hex(2, 2), style: "castle", seat: true, name: "Stillwatch" });
		expect(featureAt(editFeature(realm, g, hex(2, 2), { style: "tower" }), hex(2, 2)).holding)
			.toMatchObject({ style: "tower", seat: true, name: "Greyhold" });
	});

	it("keeps a Myth's Omens and the rest of its roll", () => {
		expect(featureAt(editFeature(sampleRealm(), g, hex(6, 6), { d12: 11 }), hex(6, 6)).myth)
			.toEqual({ id: "m1", hex: hex(6, 6), number: 1, d6: 2, d12: 11, omen: 2, revealed: false });
	});

	it("changes half of a Sanctum's Seer roll", () => {
		expect(featureAt(editFeature(sampleRealm(), g, hex(9, 9), { seer: { d6: 6 } }), hex(9, 9)).landmark.seer).toEqual({ d6: 6, d12: 5 });
	});

	it("leaves an empty hex alone", () => {
		const realm = sampleRealm();
		expect(editFeature(realm, g, hex(4, 4), { name: "Nowhere" })).toBe(realm);
	});
});

describe("Barriers", () => {
	const edge = edgeKey(hex(4, 4), hex(4, 5));

	it("cycles an edge from none to hidden to revealed and back", () => {
		const realm = sampleRealm();
		expect(barrierState(realm, edge)).toBe("none");
		const hidden = setBarrier(realm, g, edge, nextBarrierState("none"));
		expect(barrierState(hidden, edge)).toBe("hidden");
		const revealed = setBarrier(hidden, g, edge, nextBarrierState("hidden"));
		expect(revealed.barriers).toEqual([{ id: null, edge, revealed: true }]);
		expect(setBarrier(revealed, g, edge, nextBarrierState("revealed")).barriers).toEqual([]);
	});

	it("refuses edges that aren't between two hexes of the map", () => {
		const realm = sampleRealm();
		expect(setBarrier(realm, g, "1,1|4,4", "hidden")).toBe(realm);
		expect(setBarrier(realm, g, edgeKey(hex(12, 1), hex(13, 1)), "hidden")).toBe(realm);
	});
});

describe("setRevealed and setOmen", () => {
	it("shows a hex's hidden things and counts Omens within 0 to 6", () => {
		const realm = sampleRealm();
		expect(featureAt(setRevealed(realm, hex(6, 6), true), hex(6, 6)).myth.revealed).toBe(true);
		expect(setOmen(realm, 1, 9).myths[0].omen).toBe(6);
		expect(setOmen(realm, 1, -2).myths[0].omen).toBe(0);
		expect(setOmen(realm, 5, 3)).toEqual(realm);
	});
});
