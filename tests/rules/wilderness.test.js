import { describe, expect, it } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";
import {
	companyHex,
	mythChoices,
	needsWildernessRoll,
	nextOmen,
	wildernessOutcome,
	wildernessResult,
	wildernessSituation
} from "../../module/rules/wilderness.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });

/** A small Realm: Myths 1-3 around the middle, a Holding and a Landmark. */
function sampleRealm() {
	const realm = emptyRealm(g, "wild");
	realm.myths = [
		{ id: "m2", hex: hex(8, 6), number: 2, d6: 1, d12: 2, omen: 0, revealed: false },
		{ id: "m1", hex: hex(4, 6), number: 1, d6: 1, d12: 1, omen: 5, revealed: false },
		{ id: "m3", hex: hex(6, 11), number: 3, d6: 1, d12: 3, omen: 6, revealed: false }
	];
	realm.holdings = [{ id: "h1", hex: hex(2, 2), style: "castle", seat: true, name: "" }];
	realm.landmarks = [{ id: "l1", hex: hex(6, 6), type: "hazard", name: "", seer: null, revealed: false }];
	return realm;
}

describe("wildernessResult", () => {
	it.each([
		[1, "travel", true, "randomOmen"],
		[2, "travel", true, "nearestOmen"],
		[3, "camp", true, "nearestOmen"],
		[4, "travel", true, "landmark"],
		[6, "travel", false, "allClear"],
		[5, "camp", true, "allClear"]
	])("reads %i while %s, with a Landmark: %s, as %s", (d6, mode, hasLandmark, expected) => {
		expect(wildernessResult(d6, { mode, hasLandmark })).toBe(expected);
	});

	it("has no Omen to give in a Realm without Myths", () => {
		expect(wildernessResult(1, { hasMyths: false })).toBe("noMyths");
		expect(wildernessResult(3, { hasMyths: false })).toBe("noMyths");
		expect(wildernessResult(4, { hasMyths: false })).toBe("allClear");
	});
});

describe("wildernessSituation", () => {
	it("finds what's in the hex and every Myth tied for nearest", () => {
		const realm = sampleRealm();
		const situation = wildernessSituation(realm, g, hex(6, 6));
		expect(situation.landmark?.id).toBe("l1");
		expect(situation.nearest.map((myth) => myth.number)).toEqual([1, 2]);
		expect(needsWildernessRoll(situation)).toBe(true);
		expect(needsWildernessRoll(wildernessSituation(realm, g, hex(2, 2)))).toBe(false);
		expect(needsWildernessRoll(wildernessSituation(realm, g, hex(8, 6)))).toBe(false);
	});
});

describe("nextOmen", () => {
	it("counts Omens in order and stops after the sixth", () => {
		expect(nextOmen({ omen: 0 })).toEqual({ omen: 1, complete: false });
		expect(nextOmen({ omen: 5 })).toEqual({ omen: 6, complete: false });
		expect(nextOmen({ omen: 6 })).toEqual({ omen: 6, complete: true });
	});
});

describe("wildernessOutcome", () => {
	const realm = sampleRealm();

	it("makes no roll in a Holding, and gives a Myth's hex its next Omen", () => {
		expect(wildernessOutcome(realm, wildernessSituation(realm, g, hex(2, 2)), { d6: 1 })).toEqual({ result: "holding", d6: null });
		expect(wildernessOutcome(realm, wildernessSituation(realm, g, hex(8, 6)))).toMatchObject({ result: "mythHex", myth: { id: "m2" }, omen: 1, complete: false });
	});

	it("chooses a random Myth by number, and the nearest with its ties shown", () => {
		const situation = wildernessSituation(realm, g, hex(6, 6));
		expect(mythChoices(realm, situation, "randomOmen")).toBe(3);
		expect(wildernessOutcome(realm, situation, { d6: 1, pick: 2 })).toMatchObject({ result: "randomOmen", myth: { number: 3 }, complete: true });

		expect(mythChoices(realm, situation, "nearestOmen")).toBe(2);
		const nearest = wildernessOutcome(realm, situation, { d6: 2, pick: 1 });
		expect(nearest).toMatchObject({ result: "nearestOmen", myth: { number: 2 }, omen: 1 });
		expect(nearest.tied.map((myth) => myth.number)).toEqual([1, 2]);
		expect(mythChoices(realm, situation, "landmark")).toBe(1);
	});

	it("finds the hex's Landmark while travelling, but not while camping", () => {
		const situation = wildernessSituation(realm, g, hex(6, 6));
		expect(wildernessOutcome(realm, situation, { d6: 5 })).toMatchObject({ result: "landmark", landmark: { id: "l1" } });
		expect(wildernessOutcome(realm, situation, { mode: "camp", d6: 5 })).toEqual({ result: "allClear", d6: 5 });
		expect(wildernessOutcome(realm, wildernessSituation(realm, g, hex(10, 2)), { d6: 6 })).toEqual({ result: "allClear", d6: 6 });
	});
});

describe("companyHex", () => {
	it("goes where most of the Company stands, and notices when it's split", () => {
		expect(companyHex([hex(3, 3), hex(3, 3), hex(4, 3), null])).toEqual({ hex: hex(3, 3), split: true });
		expect(companyHex([hex(5, 5), hex(5, 5)])).toEqual({ hex: hex(5, 5), split: false });
		expect(companyHex([null])).toEqual({ hex: null, split: false });
	});
});
