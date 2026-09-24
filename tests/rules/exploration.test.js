import { describe, expect, it } from "vitest";
import {
	FOLK_SOURCES,
	SEARCH_AIMS,
	SEARCH_SAVE_AIM,
	barriersSeen,
	directionFrom,
	folkloreFrom,
	folkloreToMark,
	landmarksAbout,
	nearestLandmarks,
	nearestMyths,
	surveyFrom
} from "../../module/rules/exploration.js";
import { DIRECTIONS, edgeKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { emptyRealm, TERRAIN } from "../../module/rules/realm.js";

const g = realmGeometry({ cols: 12, rows: 12 });
const hex = (col, row) => ({ col, row });

/** A Realm with everything the Exploration page reads: terrain, Myths, Landmarks and Barriers. */
function realmWith({ myths = [], landmarks = [], barriers = [], terrain = {} } = {}) {
	const realm = emptyRealm(g);
	realm.myths = myths.map(({ number, hex: where, revealed = false }) => ({ id: `myth-${number}`, hex: where, number, d6: 1, d12: 1, omen: 0, revealed }));
	realm.landmarks = landmarks.map(({ type, hex: where, name = "", revealed = false }, index) => ({
		id: `landmark-${index}`, hex: where, type, name, seer: null, revealed
	}));
	realm.barriers = barriers.map((edge, index) => ({ id: `barrier-${index}`, edge, revealed: false }));
	for (const [key, value] of Object.entries(terrain)) {
		const [col, row] = key.split(",").map(Number);
		realm.terrain[(row - 1) * g.cols + (col - 1)] = TERRAIN.indexOf(value) + 1;
	}
	return realm;
}

describe("FOLK_SOURCES and SEARCH_AIMS", () => {
	it("holds the three the book names, in its order", () => {
		expect(FOLK_SOURCES).toEqual(["vassal", "roamer", "seer"]);
		expect(SEARCH_AIMS).toEqual(["sweep", "known", "vantage"]);
		expect(SEARCH_AIMS).toContain(SEARCH_SAVE_AIM);
	});
});

describe("directionFrom", () => {
	it("gives the way a neighbour lies", () => {
		for (const [index, name] of DIRECTIONS.entries()) {
			const from = hex(6, 6);
			const to = [hex(7, 7), hex(6, 7), hex(5, 7), hex(5, 5), hex(6, 5), hex(7, 5)][index];
			expect(DIRECTIONS[directionFrom(g, from, to)], name).toBe(name);
		}
	});

	it("gives the first step of the way to somewhere distant, which is its general direction", () => {
		expect(DIRECTIONS[directionFrom(g, hex(2, 2), hex(2, 10))]).toBe("south");
	});

	it("gives no direction for the hex you stand in", () => {
		expect(directionFrom(g, hex(4, 4), hex(4, 4))).toBeNull();
	});
});

describe("nearestMyths and nearestLandmarks", () => {
	const realm = realmWith({
		myths: [{ number: 1, hex: hex(1, 1) }, { number: 2, hex: hex(5, 5) }, { number: 3, hex: hex(5, 4) }],
		landmarks: [{ type: "dwelling", hex: hex(4, 4) }, { type: "ruin", hex: hex(9, 9) }]
	});

	it("gives every Myth at the shortest distance, by number", () => {
		expect(nearestMyths(realm, hex(5, 5)).map((myth) => myth.number)).toEqual([2]);
		expect(nearestMyths(realm, hex(1, 1)).map((myth) => myth.number)).toEqual([1]);
	});

	it("keeps a tie, so a roll can settle which one is spoken of", () => {
		const tied = realmWith({ myths: [{ number: 4, hex: hex(3, 5) }, { number: 6, hex: hex(5, 5) }] });
		expect(nearestMyths(tied, hex(4, 5)).map((myth) => myth.number)).toEqual([4, 6]);
	});

	it("finds nothing in a Realm with none", () => {
		expect(nearestMyths(realmWith(), hex(1, 1))).toEqual([]);
		expect(nearestLandmarks(realmWith(), hex(1, 1))).toEqual([]);
	});

	it("gives the closest Landmark", () => {
		expect(nearestLandmarks(realm, hex(5, 5))[0].type).toBe("dwelling");
		expect(nearestLandmarks(realm, hex(9, 8))[0].type).toBe("ruin");
	});
});

describe("landmarksAbout", () => {
	it("takes in the hex and the ones around it, and nothing further", () => {
		const realm = realmWith({
			landmarks: [
				{ type: "dwelling", hex: hex(6, 6) },
				{ type: "monument", hex: hex(6, 7) },
				{ type: "hazard", hex: hex(6, 9) }
			]
		});
		expect(landmarksAbout(realm, g, hex(6, 6)).map((landmark) => landmark.type)).toEqual(["dwelling", "monument"]);
	});
});

describe("folkloreFrom", () => {
	const realm = realmWith({
		myths: [{ number: 1, hex: hex(6, 7) }, { number: 2, hex: hex(2, 2) }, { number: 3, hex: hex(11, 11) }],
		landmarks: [
			{ type: "dwelling", hex: hex(6, 6) },
			{ type: "sanctum", hex: hex(6, 7) },
			{ type: "ruin", hex: hex(11, 10) }
		]
	});

	it("refuses somebody the Realm doesn't hold", () => {
		expect(folkloreFrom(realm, g, { source: "wyvern", home: hex(6, 6) })).toBeNull();
	});

	it("has a Vassal name their nearest Myth, precisely when it's adjacent to their home", () => {
		const vassal = folkloreFrom(realm, g, { source: "vassal", home: hex(6, 6) });
		expect(vassal.myths).toHaveLength(1);
		expect(vassal.myths[0]).toMatchObject({ number: 1, precise: true, distance: 1 });
		expect(DIRECTIONS[vassal.myths[0].direction]).toBe("south");
	});

	it("has a Vassal give only the direction of a Myth further from home", () => {
		const vassal = folkloreFrom(realm, g, { source: "vassal", home: hex(4, 4) });
		// Myth 2 at (2,2) is the nearest from here, and too far off to place exactly.
		expect(vassal.myths[0]).toMatchObject({ number: 2, precise: false });
		expect(vassal.myths[0].distance).toBeGreaterThan(1);
	});

	it("has a Vassal know the Landmarks of their home and the Hexes around it", () => {
		const vassal = folkloreFrom(realm, g, { source: "vassal", home: hex(6, 6) });
		expect(vassal.landmarks.map((landmark) => landmark.type)).toEqual(["dwelling", "sanctum"]);
	});

	it("has a roamer know any Myth of the Realm, and only the nearest Landmark", () => {
		const roamer = folkloreFrom(realm, g, { source: "roamer", home: hex(11, 11), pick: 2 });
		expect(roamer.mythChoices).toBe(3);
		expect(roamer.myths[0]).toMatchObject({ number: 3, precise: false });
		expect(roamer.landmarks.map((landmark) => landmark.type)).toEqual(["ruin"]);
	});

	it("holds a pick inside the Myths there are", () => {
		expect(folkloreFrom(realm, g, { source: "roamer", home: hex(1, 1), pick: 99 }).myths[0].number).toBe(3);
	});

	it("has a Seer know every Myth and every Landmark, and where each lies", () => {
		const seer = folkloreFrom(realm, g, { source: "seer", home: hex(6, 6) });
		expect(seer.myths.map((myth) => myth.number)).toEqual([1, 2, 3]);
		expect(seer.myths.every((myth) => myth.precise)).toBe(true);
		expect(seer.landmarks).toHaveLength(3);
		expect(seer.secrets).toBe(true);
		expect(seer.rumours).toBe(false);
	});

	it("leaves the rumours of danger to those who aren't Seers", () => {
		for (const source of ["vassal", "roamer"]) {
			expect(folkloreFrom(realm, g, { source, home: hex(6, 6) }).rumours).toBe(true);
		}
	});

	it("says nothing of Myths in a Realm that holds none", () => {
		const bare = realmWith({ landmarks: [{ type: "ruin", hex: hex(2, 2) }] });
		expect(folkloreFrom(bare, g, { source: "vassal", home: hex(2, 3) }).myths).toEqual([]);
	});
});

describe("folkloreToMark", () => {
	const realm = realmWith({
		myths: [{ number: 1, hex: hex(6, 7) }],
		landmarks: [{ type: "dwelling", hex: hex(6, 6) }, { type: "sanctum", hex: hex(6, 7), revealed: true }]
	});

	it("offers only a Myth whose place the teller knew", () => {
		const precise = folkloreFrom(realm, g, { source: "vassal", home: hex(6, 6) });
		expect(folkloreToMark(precise).myths.map((myth) => myth.number)).toEqual([1]);
		const vague = folkloreFrom(realm, g, { source: "roamer", home: hex(1, 1) });
		expect(folkloreToMark(vague).myths).toEqual([]);
	});

	it("leaves out a Landmark the players' map already shows", () => {
		const vassal = folkloreFrom(realm, g, { source: "vassal", home: hex(6, 6) });
		expect(folkloreToMark(vassal).landmarks.map((landmark) => landmark.type)).toEqual(["dwelling"]);
	});

	it("marks nothing from nobody", () => {
		expect(folkloreToMark(null)).toEqual({ myths: [], landmarks: [] });
	});
});

describe("surveyFrom", () => {
	const realm = realmWith({
		myths: [{ number: 2, hex: hex(6, 6) }],
		landmarks: [{ type: "monument", hex: hex(6, 6) }, { type: "hazard", hex: hex(6, 7) }],
		barriers: [edgeKey(hex(6, 6), hex(6, 7))],
		terrain: { "6,6": "forest", "6,7": "peaks" }
	});

	it("shows the Referee the whole of the hex swept, hidden Myth and Landmark and all", () => {
		const sweep = surveyFrom(realm, g, hex(6, 6));
		expect(sweep.here.terrain).toBe("forest");
		expect(sweep.here.myth).toMatchObject({ number: 2 });
		expect(sweep.here.landmark).toMatchObject({ type: "monument" });
		expect(sweep.around).toEqual([]);
	});

	it("adds the land around from a vantage point, with the Barriers hemming it in", () => {
		const view = surveyFrom(realm, g, hex(6, 6), { vantage: true });
		expect(view.around.length).toBe(6);
		const south = view.around.find((step) => DIRECTIONS[step.direction] === "south");
		expect(south).toMatchObject({ terrain: "peaks", barrier: true });
		expect(view.around.filter((step) => step.barrier)).toHaveLength(1);
	});

	it("keeps the neighbours' Myths and Landmarks out of sight, since those are specific details", () => {
		const view = surveyFrom(realm, g, hex(6, 6), { vantage: true });
		for (const step of view.around) expect(Object.keys(step)).toEqual(["direction", "hex", "terrain", "edge", "barrier", "holding"]);
	});

	it("names the Barriers seen, so they can be marked on the players' map", () => {
		expect(barriersSeen(surveyFrom(realm, g, hex(6, 6), { vantage: true }))).toEqual([edgeKey(hex(6, 6), hex(6, 7))]);
		expect(barriersSeen(surveyFrom(realm, g, hex(6, 6)))).toEqual([]);
	});
});
