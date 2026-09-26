import { describe, expect, it } from "vitest";
import { armourCounts, armourTotal, displacedArmour, looksWooden, shieldwallBearing } from "../../module/rules/armour.js";

const piece = (kind, armour = 1, more = {}) => ({ kind, armour, equipped: true, ...more });

describe("armourCounts", () => {
	it("counts worn armour that isn't broken", () => {
		expect(armourCounts(piece("coat"))).toBe(true);
		expect(armourCounts(piece("coat", 1, { equipped: false }))).toBe(false);
		expect(armourCounts(piece("coat", 1, { broken: true }))).toBe(false);
	});

	it("counts a rider's plate on horseback and a brutal plate while Wounded", () => {
		expect(armourCounts(piece("plates", 1, { condition: "mounted" }))).toBe(false);
		expect(armourCounts(piece("plates", 1, { condition: "mounted" }), { mounted: true })).toBe(true);
		expect(armourCounts(piece("plates", 1, { condition: "wounded" }), { wounded: true })).toBe(true);
		expect(armourCounts(piece("plates", 1, { condition: "wounded" }), { mounted: true })).toBe(false);
	});

	it("counts cloaked mail only where it holds, and woven coat armour except where it does", () => {
		expect(armourCounts(piece("coat", 1, { condition: "only", holds: false }))).toBe(false);
		expect(armourCounts(piece("coat", 1, { condition: "only", holds: true }))).toBe(true);
		expect(armourCounts(piece("coat", 1, { condition: "except", holds: false }))).toBe(true);
		expect(armourCounts(piece("coat", 1, { condition: "except", holds: true }))).toBe(false);
	});
});

describe("armourTotal", () => {
	it("adds one of each type, the best of each", () => {
		expect(armourTotal([piece("coat"), piece("plates"), piece("helm"), piece("shield")])).toBe(4);
		expect(armourTotal([piece("coat"), piece("coat", 2), piece("shield")])).toBe(3);
	});

	it("leaves out what doesn't count right now", () => {
		const pieces = [piece("coat"), piece("plates", 1, { condition: "mounted" })];
		expect(armourTotal(pieces)).toBe(1);
		expect(armourTotal(pieces, { mounted: true })).toBe(2);
	});
});

describe("displacedArmour", () => {
	it("takes off the other worn piece of the same type", () => {
		const items = [
			{ id: "mail", type: "armour", system: piece("coat") },
			{ id: "gambeson", type: "armour", system: piece("coat", 1, { equipped: false }) },
			{ id: "helm", type: "armour", system: piece("helm") },
			{ id: "sword", type: "weapon", system: { equipped: true } }
		];
		expect(displacedArmour(items, "gambeson")).toEqual(["mail"]);
		expect(displacedArmour(items, "helm")).toEqual([]);
		expect(displacedArmour(items, "sword")).toEqual([]);
	});
});

describe("shieldwallBearing", () => {
	it("tells a shield from a buckler, and says nothing without either", () => {
		expect(shieldwallBearing([piece("coat")])).toBeNull();
		expect(shieldwallBearing([piece("shield", 1, { buckler: true })])).toBe("buckler");
		expect(shieldwallBearing([piece("shield")])).toBe("shield");
		expect(shieldwallBearing([piece("shield", 1, { broken: true })])).toBeNull();
	});
});

describe("looksWooden", () => {
	it("takes shields as wooden unless metal, and weapons only by name", () => {
		expect(looksWooden("Kite shield", { type: "armour", kind: "shield" })).toBe(true);
		expect(looksWooden("Bronze buckler", { type: "armour", kind: "shield" })).toBe(false);
		expect(looksWooden("Mail", { type: "armour", kind: "coat" })).toBe(false);
		expect(looksWooden("Heavy staff", { type: "weapon" })).toBe(true);
		expect(looksWooden("Ashwood bow", { type: "weapon" })).toBe(true);
		expect(looksWooden("Iron mace", { type: "weapon" })).toBe(false);
	});
});
