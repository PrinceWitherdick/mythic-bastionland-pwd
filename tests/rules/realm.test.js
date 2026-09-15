import { describe, expect, it } from "vitest";
import {
	LAKE,
	REALM_PROBLEMS,
	TERRAIN,
	barrierCount,
	emptyRealm,
	featureAt,
	hexSummary,
	mythReference,
	seerReference,
	terrainAt,
	validateRealm
} from "../../module/rules/realm.js";
import { edgeKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { generateRealm } from "../../module/rules/realm-generator.js";

const g = realmGeometry();

describe("Realm tables", () => {
	it("numbers terrain the way the Realm Sheet does", () => {
		expect(TERRAIN).toHaveLength(12);
		expect(TERRAIN[0]).toBe("marsh");
		expect(LAKE).toBe(10);
		expect(barrierCount(g)).toBe(24);
	});

	it("points Myths and Seers at their pages", () => {
		expect(mythReference({ d6: 1, d12: 1 })).toEqual({ roll: "1-01", page: 29 });
		expect(seerReference({ d6: 2, d12: 3 })).toEqual({ roll: "2-03", page: 56 });
	});
});

describe("emptyRealm", () => {
	it("starts with no terrain and nothing on the map", () => {
		const realm = emptyRealm(g, "seed");
		expect(realm).toMatchObject({ cols: 12, rows: 12, seed: "seed", river: [], holdings: [], myths: [], landmarks: [], barriers: [] });
		expect(realm.terrain).toHaveLength(144);
		expect(terrainAt(realm, g, { col: 3, row: 3 })).toBe(0);
		expect(terrainAt(realm, g, { col: 30, row: 3 })).toBe(0);
		expect(featureAt(realm, { col: 3, row: 3 })).toEqual({ holding: null, myth: null, landmark: null });
	});
});

describe("hexSummary", () => {
	const realm = emptyRealm(g);
	const hex = { col: 4, row: 5 };
	realm.terrain[4 * 12 + 3] = 5;
	realm.holdings.push({ id: "h", hex: { col: 1, row: 1 }, style: "town", seat: true, name: "Oakwall" });
	realm.myths.push({ id: "m", hex, number: 2, d6: 1, d12: 2, omen: 0, revealed: false });
	realm.landmarks.push({ id: "l", hex: { col: 1, row: 1 }, type: "ruin", name: "", seer: null, revealed: true });

	it("shows players a hex's terrain and Holding, and hidden things only once revealed", () => {
		expect(hexSummary(realm, g, hex)).toEqual({ hex, terrain: "forest", holding: null, myth: null, landmark: null });
		expect(hexSummary(realm, g, { col: 1, row: 1 })).toMatchObject({
			holding: { style: "town", name: "Oakwall", seat: true },
			landmark: { type: "ruin", revealed: true }
		});
	});

	it("shows GMs everything", () => {
		expect(hexSummary(realm, g, hex, { showHidden: true }).myth).toEqual({ number: 2, revealed: false });
	});
});

describe("validateRealm", () => {
	const fresh = () => generateRealm({ seed: "checks", geometry: g });
	const reasons = (realm) => validateRealm(realm, g).map(({ kind, reason }) => `${kind}:${reason}`);

	it("finds nothing wrong with a rolled Realm", () => {
		expect(validateRealm(fresh(), g)).toEqual([]);
	});

	it.each([
		["missing terrain", (realm) => { realm.terrain[5] = 0; }, "terrain:terrain"],
		["a gap in the river", (realm) => { realm.river.splice(2, 1); }, "river:river"],
		["the river doubling back", (realm) => { realm.river.push(realm.river[0]); }, "river:duplicate"],
		["a Holding off the map", (realm) => { realm.holdings[0].hex = { col: 20, row: 1 }; }, "holding:offMap"],
		["two things in one hex", (realm) => { realm.myths[0].hex = { ...realm.holdings[0].hex }; }, "hex:crowded"],
		["two Seats of Power", (realm) => { realm.holdings.forEach((holding) => { holding.seat = true; }); }, "holding:seat"],
		["a Holding of no known style", (realm) => { realm.holdings[1].style = "palace"; }, "holding:style"],
		["two Myths with one number", (realm) => { realm.myths[1].number = realm.myths[0].number; }, "myth:duplicate"],
		["a Myth numbered 7", (realm) => { realm.myths[0].number = 7; }, "myth:number"],
		["a Myth rolled off the table", (realm) => { realm.myths[0].d12 = 13; }, "myth:roll"],
		["a seventh Omen", (realm) => { realm.myths[0].omen = 7; }, "myth:omen"],
		["a Landmark of no known type", (realm) => { realm.landmarks[0].type = "tavern"; }, "landmark:type"],
		["a Seer rolled off the table", (realm) => { realm.landmarks[0].seer = { d6: 0, d12: 1 }; }, "landmark:roll"],
		["a Barrier between hexes that don't touch", (realm) => { realm.barriers[0].edge = "1,1|5,5"; }, "barrier:edge"],
		["the same Barrier twice", (realm) => { realm.barriers.push({ id: null, edge: realm.barriers[0].edge, revealed: false }); }, "barrier:duplicate"],
		["a Barrier past the edge of the map", (realm) => { realm.barriers[0].edge = edgeKey({ col: 12, row: 1 }, { col: 13, row: 1 }); }, "barrier:edge"]
	])("points out %s", (_name, spoil, expected) => {
		const realm = fresh();
		spoil(realm);
		expect(reasons(realm)).toContain(expected);
	});

	it("only reports reasons that have wording", () => {
		const realm = fresh();
		realm.terrain[0] = 0;
		realm.myths[0].omen = -1;
		for (const { reason } of validateRealm(realm, g)) expect(REALM_PROBLEMS).toContain(reason);
	});
});
