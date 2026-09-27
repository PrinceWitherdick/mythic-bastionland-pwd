import { describe, expect, it } from "vitest";
import { CRUISE_HEXES, cruiseReach, reachBy, waterways } from "../../module/rules/cruise.js";
import { LAKE, emptyRealm } from "../../module/rules/realm.js";
import { edgeKey, hexDistance, hexIndex, hexKey, realmGeometry } from "../../module/rules/realm-geometry.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });
const keys = (reached) => reached.map((entry) => hexKey(entry.hex));

/** A river straight down column 3, from row 1 to row 8. */
function riverRealm() {
	const realm = emptyRealm(g, "cruise");
	realm.rivers = [Array.from({ length: 8 }, (_, index) => hex(3, index + 1))];
	return realm;
}

describe("waterways", () => {
	it("takes in every river hex and every lake", () => {
		const realm = riverRealm();
		realm.terrain[hexIndex(g, hex(9, 9))] = LAKE;
		const ways = waterways(realm, g);
		expect(ways.has("3,1")).toBe(true);
		expect(ways.has("3,8")).toBe(true);
		expect(ways.has("9,9")).toBe(true);
		expect(ways.has("4,4")).toBe(false);
	});
});

describe("reachBy", () => {
	it("goes 3 Hexes along the way, and no further", () => {
		const realm = riverRealm();
		const reached = reachBy(realm, g, hex(3, 4), waterways(realm, g));
		expect(keys(reached).sort()).toEqual(["3,1", "3,2", "3,3", "3,5", "3,6", "3,7"].sort());
		expect(Math.max(...reached.map((entry) => entry.steps))).toBe(CRUISE_HEXES);
		for (const entry of reached) expect(hexDistance(g, hex(3, 4), entry.hex)).toBe(entry.steps);
	});

	it("can't start off the way, or pass a Barrier", () => {
		const realm = riverRealm();
		expect(reachBy(realm, g, hex(5, 5), waterways(realm, g))).toEqual([]);
		realm.barriers = [{ id: null, edge: edgeKey(hex(3, 4), hex(3, 5)), revealed: true }];
		expect(keys(reachBy(realm, g, hex(3, 4), waterways(realm, g)))).not.toContain("3,5");
	});
});

describe("cruiseReach", () => {
	it("keeps boat and road apart", () => {
		const realm = riverRealm();
		const reach = cruiseReach(realm, g, hex(3, 4), ["3,4", "4,4"]);
		expect(keys(reach.boat)).toContain("3,5");
		expect(keys(reach.road)).toEqual(["4,4"]);
	});
});
