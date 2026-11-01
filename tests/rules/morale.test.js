import { describe, expect, it } from "vitest";
import { MORALE_BREAKS, downOf, downedPlace, groupHalved, isDown, isMoraleBreak, moraleRollers, moraleTrigger, skipsBrokenTurn } from "../../module/rules/morale.js";

describe("moraleTrigger", () => {
	const wound = { outcome: "wounded", vigourBefore: 10, vigourAfter: 7, vigourMax: 10 };

	it("asks an individual who is Wounded", () => {
		expect(moraleTrigger(wound)).toBe("wounded");
	});

	it("leaves player characters and structures alone", () => {
		expect(moraleTrigger({ ...wound, playerCharacter: true })).toBeNull();
		expect(moraleTrigger({ ...wound, structure: true })).toBeNull();
	});

	it("doesn't ask anybody who Evaded, took a Scar, or is down", () => {
		for (const outcome of ["none", "evaded", "scar", "mortal", "slain", "unharmed"]) {
			expect(moraleTrigger({ ...wound, outcome })).toBeNull();
		}
	});

	it("asks a Warband once, as its VIG falls to half or below", () => {
		const warband = { outcome: "wounded", vigourMax: 12, warband: true };
		expect(moraleTrigger({ ...warband, vigourBefore: 12, vigourAfter: 7 })).toBeNull();
		expect(moraleTrigger({ ...warband, vigourBefore: 12, vigourAfter: 6 })).toBe("halved");
		expect(moraleTrigger({ ...warband, vigourBefore: 6, vigourAfter: 3 })).toBeNull();
	});
});

describe("isDown", () => {
	it("counts the Slain, the Mortally Wounded and the defeated as down", () => {
		expect(isDown({ vigour: 0, slain: true })).toBe(true);
		expect(isDown({ vigour: 5, mortalWound: true })).toBe(true);
		expect(isDown({ vigour: 5, defeated: true })).toBe(true);
		expect(isDown({ vigour: 5 })).toBe(false);
	});

	it("leaves somebody Exhausted at VIG 0 standing, but not a Warband, wiped out at VIG 0 however it came about (p9, p11)", () => {
		expect(isDown({ vigour: 0 })).toBe(false);
		expect(isDown({ vigour: 0, warband: true })).toBe(true);
		expect(isDown({ vigour: 3, warband: true })).toBe(false);
	});

	it("counts something with no VIG at all as no fighter", () => {
		expect(isDown({ vigour: undefined })).toBe(true);
	});

	it("counts those who fled or surrendered as down, and nothing else as broken", () => {
		expect(isDown({ vigour: 5, broken: "fled" })).toBe(true);
		expect(isDown({ vigour: 5, broken: "surrendered" })).toBe(true);
		expect(isDown({ vigour: 5, broken: "" })).toBe(false);
		expect(isDown({ vigour: 5, broken: "sulking" })).toBe(false);
	});
});

describe("MORALE_BREAKS", () => {
	it("routs or surrenders (p10)", () => {
		expect(MORALE_BREAKS).toEqual(["fled", "surrendered"]);
		expect(MORALE_BREAKS.every(isMoraleBreak)).toBe(true);
		expect(isMoraleBreak("")).toBe(false);
		expect(isMoraleBreak(undefined)).toBe(false);
	});
});

describe("skipsBrokenTurn", () => {
	const turns = (...broken) => broken.map((each) => ({ broken: each }));

	it("passes over somebody who fled or surrendered", () => {
		expect(skipsBrokenTurn(turns("", "fled", ""), 1)).toBe(true);
		expect(skipsBrokenTurn(turns("", "surrendered"), 1)).toBe(true);
	});

	it("leaves anybody still in the fight their turn", () => {
		expect(skipsBrokenTurn(turns("", "fled"), 0)).toBe(false);
		expect(skipsBrokenTurn(turns("fled", ""), 5)).toBe(false);
	});

	it("doesn't go round and round once nobody is left who hasn't broken", () => {
		expect(skipsBrokenTurn(turns("fled", "surrendered"), 0)).toBe(false);
	});

	it("passes over somebody marked defeated for going down, as for broken Morale", () => {
		expect(skipsBrokenTurn([{ broken: "" }, { broken: "", down: true }], 1)).toBe(true);
		expect(skipsBrokenTurn([{ broken: "fled" }, { broken: "", down: true }], 1)).toBe(false);
	});
});

describe("groupHalved", () => {
	const members = (down, standing) => [...Array(down).fill({ down: true }), ...Array(standing).fill({ down: false })];

	it("is true once half or more are down", () => {
		expect(groupHalved(members(1, 3))).toBe(false);
		expect(groupHalved(members(2, 2))).toBe(true);
		expect(groupHalved(members(3, 2))).toBe(true);
	});

	it("needs a group of at least two", () => {
		expect(groupHalved(members(1, 0))).toBe(false);
	});
});

describe("moraleRollers", () => {
	const captain = { name: "Captain", down: false };
	const group = [captain, { name: "Ann", down: false }, { name: "Bo", down: true }];

	it("rolls once on the leader's SPI for an organised group", () => {
		expect(moraleRollers(group, { order: "organised", leader: captain })).toEqual([captain]);
		expect(moraleRollers(group, { order: "organised", leader: group[2] })).toEqual([]);
	});

	it("rolls for each member still standing in a disorganised group", () => {
		expect(moraleRollers(group, { order: "disorganised" }).map((member) => member.name)).toEqual(["Captain", "Ann"]);
	});
});

describe("isDown, for the Cast and Warbands", () => {
	it("leaves one that fights on through a Mortal Wound standing, and counts a destroyed creature down (p11)", () => {
		expect(isDown({ vigour: 5, mortalWound: true, fightsOn: true })).toBe(false);
		expect(isDown({ vigour: 5, destroyed: true })).toBe(true);
	});

	it("counts a Warband broken at SPI 0 as down only when its orders are what's weighed (p11)", () => {
		const militia = { system: { scale: "warband", virtues: { vig: { value: 10 }, spi: { value: 0 } }, moraleBroken: "" } };
		expect(downOf(militia)).toBe(false);
		expect(downOf(militia, { orders: true })).toBe(true);
		const steady = { system: { ...militia.system, virtues: { vig: { value: 10 }, spi: { value: 4 } } } };
		expect(downOf(steady, { orders: true })).toBe(false);
		const broken = { system: { scale: "individual", virtues: { vig: { value: 10 }, spi: { value: 0 } } } };
		expect(downOf(broken, { orders: true })).toBe(false);
	});

	it("reads fighting on and being destroyed off the actor", () => {
		expect(downOf({ system: { virtues: { vig: { value: 4 } }, mortalWound: true, fightsOn: true } })).toBe(false);
		expect(downOf({ system: { virtues: { vig: { value: 4 } }, destroyed: true } })).toBe(true);
	});
});

describe("downedPlace", () => {
	it("marks a place defeated as they go down, and stands it up as they get up", () => {
		expect(downedPlace({ defeated: false }, { out: true, broken: false })).toEqual({ defeated: true, downFlag: true });
		expect(downedPlace({ defeated: true, downFlag: true }, { out: false, broken: false })).toEqual({ defeated: false, downFlag: false });
	});

	it("does nothing twice, and nothing to a place it didn't mark", () => {
		expect(downedPlace({ defeated: true, downFlag: true }, { out: true, broken: false })).toBeNull();
		expect(downedPlace({ defeated: true }, { out: true, broken: false })).toBeNull();
		expect(downedPlace({ defeated: true }, { out: false, broken: false })).toBeNull();
		expect(downedPlace({ defeated: false }, { out: false, broken: false })).toBeNull();
	});

	it("keeps them out for broken Morale, which its own mark then answers for", () => {
		expect(downedPlace({ defeated: true, brokeFlag: true }, { out: true, broken: true })).toEqual({ downFlag: true });
		expect(downedPlace({ defeated: true, downFlag: true }, { out: false, broken: true })).toEqual({ defeated: true, downFlag: false, brokeFlag: true });
	});
});
