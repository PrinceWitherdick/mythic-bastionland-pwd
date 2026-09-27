import { describe, expect, it } from "vitest";
import { armourCounts, armourTotal, displacedArmour, looksWooden, noteBearing, shieldwallAround, shieldwallBearing, standTogether } from "../../module/rules/armour.js";

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

describe("noteBearing", () => {
	it("reads a shield or a buckler off an NPC's Armour note", () => {
		expect(noteBearing("mail, helm, shield")).toBe("shield");
		expect(noteBearing("leather, buckler")).toBe("buckler");
		expect(noteBearing("plate and helm")).toBeNull();
		expect(noteBearing(undefined)).toBeNull();
	});
});

describe("a shieldwall on the map", () => {
	const SIZE = 100;
	const at = (name, col, row, bearing = "shield") => ({ name, bearing, box: { x: col * SIZE, y: row * SIZE, w: SIZE, h: SIZE } });

	it("counts Tokens side by side or corner to corner as standing together, and one space apart as not", () => {
		expect(standTogether(at("a", 0, 0).box, at("b", 1, 0).box, SIZE)).toBe(true);
		expect(standTogether(at("a", 0, 0).box, at("b", 1, 1).box, SIZE)).toBe(true);
		expect(standTogether(at("a", 0, 0).box, at("b", 2, 0).box, SIZE)).toBe(false);
	});

	it("forms of 3 or more allies in a chain, all bearing shields", () => {
		const wall = shieldwallAround(at("Ada", 0, 0), [at("Bryn", 1, 0), at("Cal", 2, 0), at("Far", 6, 6, null)], SIZE);
		expect(wall).toEqual({ count: 3, formed: true, unshielded: [] });
	});

	it("doesn't form of fewer than 3", () => {
		expect(shieldwallAround(at("Ada", 0, 0), [at("Bryn", 1, 0), at("Cal", 3, 0)], SIZE)).toEqual({ count: 2, formed: false, unshielded: [] });
	});

	it("names whoever in it bears a buckler or no shield", () => {
		const wall = shieldwallAround(at("Ada", 0, 0, null), [at("Bryn", 1, 0, "buckler"), at("Cal", 2, 0)], SIZE);
		expect(wall).toEqual({ count: 3, formed: false, unshielded: ["Ada", "Bryn"] });
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
