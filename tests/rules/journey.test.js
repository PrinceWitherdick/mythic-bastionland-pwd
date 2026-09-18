import { describe, expect, it } from "vitest";
import {
	JOURNEY_VERSION,
	changedHexes,
	emptyJourney,
	forgetVisits,
	hexesEntered,
	normaliseJourney,
	recordVisits,
	visitedNewestFirst,
	visitsAt
} from "../../module/rules/journey.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";

const hex = (col, row) => ({ col, row });
const spring = { age: 1, season: "spring", day: 3, phase: "morning" };
const winter = { age: 1, season: "winter", day: 1, phase: "night" };

describe("normaliseJourney", () => {
	it("gives an empty journey for anything that isn't one", () => {
		for (const raw of [undefined, null, "", 7, [], {}, { hexes: [] }, { hexes: "no" }]) {
			expect(normaliseJourney(raw)).toEqual(emptyJourney());
		}
	});

	it("keeps only hexes the Company came into, under keys that name a hex", () => {
		const journey = normaliseJourney({
			hexes: {
				"3,4": { count: 2, first: { when: spring, order: 1 }, last: { when: winter, order: 5 } },
				"up a bit": { count: 1, first: { order: 2 } },
				"5,5": { count: 0, first: { order: 3 } },
				"6,6": { count: 1 }
			}
		});
		expect(Object.keys(journey.hexes)).toEqual(["3,4"]);
		expect(journey.hexes["3,4"]).toEqual({ count: 2, first: { when: spring, order: 1 }, last: { when: winter, order: 5 } });
	});

	it("reads a missing last arrival as the first, and a calendar that isn't one as none", () => {
		const journey = normaliseJourney({ hexes: { "2,2": { count: 1, first: { when: { age: "old" }, order: 4 } } } });
		expect(journey.hexes["2,2"]).toEqual({ count: 1, first: { when: null, order: 4 }, last: { when: null, order: 4 } });
	});

	it("never counts on from behind a hex already come into", () => {
		const raw = { version: 99, next: 2, hexes: { "2,2": { count: 1, first: { order: 7 }, last: { order: 9 } } } };
		expect(normaliseJourney(raw)).toMatchObject({ version: JOURNEY_VERSION, next: 10 });
		expect(normaliseJourney({ next: 40, hexes: {} }).next).toBe(40);
	});
});

describe("hexesEntered", () => {
	it("lists each hex a move comes into, once, in order", () => {
		const path = [hex(1, 1), hex(1, 1), hex(2, 1), null, hex(2, 1), hex(3, 2)];
		expect(hexesEntered(path, hex(1, 1))).toEqual([hex(2, 1), hex(3, 2)]);
	});

	it("counts a hex left and come back into", () => {
		expect(hexesEntered([hex(2, 1), hex(1, 1)], hex(1, 1))).toEqual([hex(2, 1), hex(1, 1)]);
	});

	it("comes into nothing when the move stays in its hex or goes off the map", () => {
		expect(hexesEntered([hex(4, 4), null], hex(4, 4))).toEqual([]);
		expect(hexesEntered([])).toEqual([]);
		expect(hexesEntered(undefined)).toEqual([]);
	});

	it("counts the first hex when nobody knows where the move set off from", () => {
		expect(hexesEntered([hex(4, 4)])).toEqual([hex(4, 4)]);
	});

	it("comes into each hex between the steps of a walked move", () => {
		expect(hexesEntered([hex(3, 5), hex(4, 5)], hex(3, 2), { walkedAcross: realmGeometry() })).toEqual([hex(3, 3), hex(3, 4), hex(3, 5), hex(4, 5)]);
		expect(hexesEntered([hex(3, 5)], hex(3, 2))).toEqual([hex(3, 5)]);
	});
});

describe("recordVisits", () => {
	it("counts each hex come into, stamping the first and the last time", () => {
		let journey = recordVisits(emptyJourney(), [hex(1, 1), hex(2, 1)], spring);
		journey = recordVisits(journey, [hex(1, 1)], winter);
		expect(visitsAt(journey, hex(1, 1))).toEqual({ count: 2, first: { when: spring, order: 1 }, last: { when: winter, order: 3 } });
		expect(visitsAt(journey, hex(2, 1))).toEqual({ count: 1, first: { when: spring, order: 2 }, last: { when: spring, order: 2 } });
		expect(journey.next).toBe(4);
	});

	it("keeps no calendar that isn't one, and changes nothing for no hexes", () => {
		const start = emptyJourney();
		expect(recordVisits(start, [])).toBe(start);
		expect(visitsAt(recordVisits(start, [hex(3, 3)], { day: "soon" }), hex(3, 3)).first.when).toBeNull();
	});

	it("leaves the journey it was given alone", () => {
		const start = recordVisits(emptyJourney(), [hex(1, 1)], spring);
		const copy = structuredClone(start);
		recordVisits(start, [hex(1, 1), hex(9, 9)], winter);
		expect(start).toEqual(copy);
	});
});

describe("forgetVisits", () => {
	it("forgets one hex and leaves the rest", () => {
		const journey = recordVisits(emptyJourney(), [hex(1, 1), hex(2, 1)], spring);
		const forgotten = forgetVisits(journey, hex(1, 1));
		expect(visitsAt(forgotten, hex(1, 1))).toBeNull();
		expect(visitsAt(forgotten, hex(2, 1))).not.toBeNull();
		expect(forgotten.next).toBe(journey.next);
	});

	it("changes nothing for a hex never come into", () => {
		const journey = recordVisits(emptyJourney(), [hex(1, 1)], spring);
		expect(forgetVisits(journey, hex(8, 8))).toBe(journey);
	});
});

describe("changedHexes", () => {
	it("names the hexes a change touched, so each is written on its own", () => {
		const before = recordVisits(emptyJourney(), [hex(1, 1), hex(2, 1)], spring);
		const after = forgetVisits(recordVisits(before, [hex(3, 3), hex(1, 1)], winter), hex(2, 1));
		expect(changedHexes(before, after).sort()).toEqual(["1,1", "2,1", "3,3"]);
		expect(changedHexes(before, before)).toEqual([]);
	});
});

describe("visitedNewestFirst", () => {
	it("puts the hex reached last first", () => {
		let journey = recordVisits(emptyJourney(), [hex(1, 1), hex(2, 1), hex(3, 1)], spring);
		journey = recordVisits(journey, [hex(1, 1)], winter);
		expect(visitedNewestFirst(journey).map(({ key }) => key)).toEqual(["1,1", "3,1", "2,1"]);
		expect(visitedNewestFirst(journey)[0]).toMatchObject({ hex: hex(1, 1), count: 2 });
		expect(visitedNewestFirst(null)).toEqual([]);
	});
});
