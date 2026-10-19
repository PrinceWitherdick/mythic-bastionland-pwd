import { describe, expect, it } from "vitest";
import { blindLanding } from "../../module/rules/night-travel.js";
import { DIRECTIONS, neighbour, realmGeometry } from "../../module/rules/realm-geometry.js";

const g = realmGeometry();
const from = { col: 6, row: 6 };
const step = (direction) => neighbour(g, from, DIRECTIONS.indexOf(direction));

describe("blindLanding", () => {
	const south = step("south");

	it("circles back to where the Company set off (p18)", () => {
		expect(blindLanding(g, from, south, { result: "circleBack" })).toEqual(from);
	});

	it("drifts a hex to the travellers' left or right of the one they made for", () => {
		// Heading south, a traveller's right hand is to the west.
		expect(blindLanding(g, from, south, { result: "drift", side: "right" })).toEqual(step("southwest"));
		expect(blindLanding(g, from, south, { result: "drift", side: "left" })).toEqual(step("southeast"));
		expect(blindLanding(g, from, step("north"), { result: "drift", side: "right" })).toEqual(step("northeast"));
	});

	it("leaves the Company where it meant to go otherwise", () => {
		expect(blindLanding(g, from, south, { result: "asPlanned" })).toBeNull();
		expect(blindLanding(g, null, south, { result: "circleBack" })).toBeNull();
		expect(blindLanding(g, from, from, { result: "circleBack" })).toBeNull();
		// Not neighbours, so no heading to drift from.
		expect(blindLanding(g, from, { col: 9, row: 9 }, { result: "drift", side: "left" })).toBeNull();
		// Off the Realm's edge there's nowhere to drift to.
		expect(blindLanding(g, { col: 1, row: 1 }, { col: 1, row: 2 }, { result: "drift", side: "right" })).toBeNull();
	});
});
