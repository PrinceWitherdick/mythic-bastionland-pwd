import { describe, expect, it } from "vitest";
import { armourCounts, armourTotal, armourWorn, armourUnshielded, displacedArmour, greaterEffects, looksWooden, noteBearing, noteNamesShield, noteWithout, npcArmourUnshielded, shieldwallAround, shieldwallBearing, standTogether } from "../../module/rules/armour.js";

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

describe("a Trapped shield", () => {
	it("leaves a Knight the Armour of their other pieces", () => {
		expect(armourUnshielded([piece("coat"), piece("helm"), piece("shield")])).toBe(2);
		expect(armourUnshielded([piece("coat"), piece("shield", 1, { buckler: true })])).toBe(1);
		expect(armourUnshielded([piece("plates", 1, { condition: "mounted" }), piece("shield")], { mounted: true })).toBe(1);
	});

	it("takes a point off an NPC whose Armour note names a shield", () => {
		expect(noteNamesShield("mail, helm, shield")).toBe(true);
		expect(noteNamesShield("ringmail, redshield")).toBe(true);
		expect(noteNamesShield("huge body")).toBe(false);
		expect(npcArmourUnshielded(3, "mail, helm, shield")).toBe(2);
		expect(npcArmourUnshielded(1, "brass shield")).toBe(0);
		expect(npcArmourUnshielded(2, "muscular hide, wiry fur")).toBe(2);
		expect(npcArmourUnshielded(0, "shield")).toBe(0);
	});
});

describe("a Strong Gambit's Greater effect", () => {
	const item = (id, type, system) => ({ id, name: id, type, system: { equipped: true, broken: false, wooden: false, ...system } });

	it("offers to disarm, unhelm or break what a Knight holds and wears", () => {
		const effects = greaterEffects([
			item("Longsword", "weapon", {}),
			item("Staff", "weapon", { wooden: true }),
			item("Trample", "weapon", { trample: true }),
			item("Kite shield", "armour", { kind: "shield", wooden: true }),
			item("Helm", "armour", { kind: "helm" }),
			item("Mail", "armour", { kind: "coat" })
		]);
		expect(effects).toEqual([
			{ effect: "disarm", name: "Longsword", id: "Longsword" },
			{ effect: "disarm", name: "Staff", id: "Staff" },
			{ effect: "break", name: "Staff", id: "Staff" },
			{ effect: "disarm", name: "Kite shield", id: "Kite shield" },
			{ effect: "break", name: "Kite shield", id: "Kite shield" },
			{ effect: "unhelm", name: "Helm", id: "Helm" }
		]);
	});

	it("leaves out what is already off, set down or broken", () => {
		expect(greaterEffects([
			item("Helm", "armour", { kind: "helm", equipped: false }),
			item("Spear", "weapon", { equipped: false }),
			item("Round shield", "armour", { kind: "shield", wooden: true, broken: true })
		])).toEqual([]);
		// A wooden weapon set down can still be broken.
		expect(greaterEffects([item("Club", "weapon", { equipped: false, wooden: true })])).toEqual([{ effect: "break", name: "Club", id: "Club" }]);
	});

	it("offers an NPC's helm and shield from its Armour note while it has Armour", () => {
		expect(greaterEffects([item("Axe", "weapon", {})], { armour: 3, armourNote: "mail, helm, shield" })).toEqual([
			{ effect: "disarm", name: "Axe", id: "Axe" },
			{ effect: "disarm", name: "shield", id: null },
			{ effect: "unhelm", name: "helm", id: null }
		]);
		expect(greaterEffects([], { armour: 2, armourNote: "ringmail, redshield" })).toEqual([{ effect: "disarm", name: "redshield", id: null }]);
		expect(greaterEffects([], { armour: 0, armourNote: "helm" })).toEqual([]);
		expect(greaterEffects([], { armour: 2, armourNote: "muscular hide" })).toEqual([]);
		// An NPC's armour items add nothing to its Armour, so only the note is offered.
		expect(greaterEffects([item("Helm", "armour", { kind: "helm" })], { armour: 1, armourNote: "" })).toEqual([]);
	});

	it("takes the part naming a helm or shield out of an NPC's Armour note", () => {
		expect(noteWithout("mail, helm, shield", "helm")).toBe("mail, shield");
		expect(noteWithout("ringmail, redshield", "shield")).toBe("ringmail");
		expect(noteWithout("plate and great helm", "helm")).toBe("plate");
		expect(noteWithout("helm", "helm")).toBe("");
		expect(noteWithout("huge body", "helm")).toBe("huge body");
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

describe("armourWorn", () => {
	const item = (name, ...rest) => ({ name, system: piece(...rest) });

	it("lists each worn piece with its Armour, leaving out what is carried", () => {
		const items = [item("Mail", "coat"), item("Helm", "helm"), item("Spare helm", "helm", 1, { equipped: false })];
		expect(armourWorn(items)).toEqual([{ name: "Mail", armour: 1, counts: true }, { name: "Helm", armour: 1, counts: true }]);
	});

	it("marks a piece that does not count right now", () => {
		const items = [item("Plate", "plates", 1, { condition: "mounted" }), item("Shield", "shield", 1, { broken: true })];
		expect(armourWorn(items).map((each) => each.counts)).toEqual([false, false]);
		expect(armourWorn(items, { mounted: true }).map((each) => each.counts)).toEqual([true, false]);
	});

	it("counts only the better of two pieces of one type, as the total does", () => {
		const items = [item("Gambeson", "coat", 1), item("Mail", "coat", 2), item("Old mail", "coat", 2)];
		expect(armourWorn(items).map((each) => each.counts)).toEqual([false, true, false]);
	});
});
