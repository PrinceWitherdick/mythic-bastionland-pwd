import { describe, expect, it } from "vitest";
import { groupHalved, isDown, moraleRollers, moraleTrigger } from "../../module/rules/morale.js";

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
		expect(isDown({ vigour: 0 })).toBe(true);
		expect(isDown({ vigour: 5, mortalWound: true })).toBe(true);
		expect(isDown({ vigour: 5, defeated: true })).toBe(true);
		expect(isDown({ vigour: 5 })).toBe(false);
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
