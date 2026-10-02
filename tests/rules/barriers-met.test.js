import { describe, expect, it } from "vitest";
import { emptyShared, normaliseShared, recordBarrierMet, sharedAt } from "../../module/rules/hex-shared.js";
import { emptyJourney } from "../../module/rules/journey.js";
import { barriersAround, edgeSide, emptyRealm } from "../../module/rules/realm.js";
import { edgeKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { playerHexView, viewWords } from "../../module/rules/travels.js";

const g = realmGeometry({ cols: 12, rows: 12 });
const here = { col: 3, row: 3 };
const north = { col: 3, row: 2 };
const south = { col: 3, row: 4 };
const far = { col: 8, row: 8 };
const when = { age: 1, season: "spring", day: 2, phase: "morning" };

function realmWith() {
	const realm = emptyRealm(g);
	realm.barriers = [
		{ id: "b0", edge: edgeKey(here, south), revealed: false },
		{ id: "b1", edge: edgeKey(here, north), revealed: true },
		{ id: "b2", edge: edgeKey(far, { col: 8, row: 9 }), revealed: true }
	];
	return realm;
}

describe("edgeSide and barriersAround", () => {
	it("names the side of a hex an edge lies on, from either hex", () => {
		expect(edgeSide(g, here, edgeKey(here, north))).toBe("north");
		expect(edgeSide(g, north, edgeKey(here, north))).toBe("south");
		expect(edgeSide(g, far, edgeKey(here, north))).toBeNull();
	});

	it("shows players only the revealed Barriers on a hex's sides, and GMs every one, clockwise", () => {
		expect(barriersAround(realmWith(), g, here).map((barrier) => barrier.direction)).toEqual(["north"]);
		expect(barriersAround(realmWith(), g, here, { showHidden: true })).toEqual([
			{ edge: edgeKey(here, south), direction: "south", revealed: false },
			{ edge: edgeKey(here, north), direction: "north", revealed: true }
		]);
	});
});

describe("recordBarrierMet", () => {
	it("keeps each Barrier met once, the latest meeting last", () => {
		let shared = recordBarrierMet(emptyShared(), here, { edge: edgeKey(here, north), byName: "Alys", when, at: 1 });
		shared = recordBarrierMet(shared, here, { edge: edgeKey(here, south), byName: "Bren", when, at: 2 });
		shared = recordBarrierMet(shared, here, { edge: edgeKey(here, north), byName: "Cass", when, at: 3 });
		expect(sharedAt(shared, here).met.map((met) => met.byName)).toEqual(["Bren", "Cass"]);
		expect(sharedAt(shared, here).told).toEqual([]);
	});

	it("refuses an edge that isn't one, and survives being read back", () => {
		const shared = recordBarrierMet(emptyShared(), here, { edge: "nonsense", byName: "Alys" });
		expect(shared.hexes).toEqual({});
		const kept = recordBarrierMet(emptyShared(), here, { edge: edgeKey(here, north), byName: "Alys", when, at: 1 });
		expect(normaliseShared(JSON.parse(JSON.stringify(kept)))).toEqual(kept);
	});
});

describe("the players' view of a Barrier", () => {
	it("shows the revealed Barriers and those the Company met from the hex, the latest first", () => {
		let shared = recordBarrierMet(emptyShared(), here, { edge: edgeKey(here, north), byName: "Alys", when, at: 1 });
		shared = recordBarrierMet(shared, here, { edge: edgeKey(here, south), byName: "Bren", when: null, at: 2 });
		const view = playerHexView({ realm: realmWith(), g, journey: emptyJourney(), shared, marks: [], handHidden: () => ({}) }, here);
		expect(view.barriers).toEqual(["north"]);
		expect(view.met).toEqual([{ direction: "south", byName: "Bren", when: null }, { direction: "north", byName: "Alys", when }]);
		// A Barrier met counts as something the players hold about the hex.
		expect(view.openable).toBe(true);
		expect(viewWords(view, (key, data) => `${key} ${JSON.stringify(data ?? {})}`).features)
			.toEqual(['realm.readout.barrier {"direction":"realm.directions.north {}"}']);
	});
});
