import { describe, expect, it } from "vitest";
import { pointsBelow, tableItemId } from "../../module/rules/knight-tables.js";
import { companionActorData, knightCompanions, nameWithoutOwner, ownerOf, possessionDetails, propertyGear, propertyItems, retypedProperty } from "../../module/rules/property.js";

// Lines here are invented so no book text lives in the repository.

describe("propertyItems", () => {
	it("keeps a pointer to the page's table on the piece that says it", () => {
		const { items } = propertyItems(["Old sword (d8 hefty), mail (A1, see below)", "Round shield (d4, A1) painted with a moth (see below)"]);
		expect(items.map((item) => item.name)).toEqual(["Old sword", "Mail (see below)", "Round shield (see below)"]);
		expect(items[1].system.description).toBe("");
		expect(items[2].system.description).toBe("<p>Painted with a moth</p>");
	});

	it("reads armour from a later parenthesis when the first is an aside", () => {
		const [cloak] = propertyItems(["Woven cloak (see below) over mail (A1)"]).items;
		expect(cloak).toMatchObject({ type: "armour", name: "Woven cloak (see below) over mail", system: { armour: 1 } });
	});

	it("splits a second piece carried with the first", () => {
		const { items } = propertyItems(["Mail (A1) with visored helm (A1, see below)"]);
		expect(items.map((item) => [item.name, item.system.kind])).toEqual([["Mail", "coat"], ["Visored helm (see below)", "helm"]]);
	});

	it("gives an armour an Attack die only when its parenthesis starts with one", () => {
		const [spiked] = propertyItems(["Spiked coat (A1, anyone who grabs you takes d6 Damage)"]).items;
		expect(spiked.system.damage).toBe("");
		expect(spiked.system.description).toBe("<p>Anyone who grabs you takes d6 Damage</p>");
		const [heater] = propertyItems(["Heater shield (A1 d4)"]).items;
		expect(heater.system).toMatchObject({ damage: "d4", armour: 1, description: "" });
	});

	it("marks a bow ranged, as Arms & Goods does", () => {
		const [bow, spear] = propertyItems(["Yew bow (d6 long), spear (d8 hefty)"]).items;
		expect(bow.system.ranged).toBe(true);
		expect(spear.system.ranged).toBe(false);
	});

	it("makes a weapon Hefty only when mounted, as a lance is (p12)", () => {
		const [great, plain] = propertyItems(["Tilting lance (2d10 hefty when mounted, slow on foot)", "Ash lance (d10 long, or hefty if mounted)"]).items;
		expect(great.system).toMatchObject({ hefty: false, heftyMounted: true, slow: true, description: "" });
		expect(plain.system).toMatchObject({ hefty: false, heftyMounted: true, long: true, description: "" });
	});
});

describe("propertyGear", () => {
	it("keeps a companion as one piece of gear, as printed", () => {
		const items = propertyGear(["Short spear (d8), gambeson (A1)", "Grey mare (VIG 10, CLA 8, SPI 5, 3GD)"]);
		expect(items.map((item) => item.type)).toEqual(["weapon", "armour", "gear"]);
		expect(items[2].name).toBe("Grey mare (VIG 10, CLA 8, SPI 5, 3GD)");
	});

	it("leaves the page's table on the same piece the sheet looks for", () => {
		const items = propertyGear(["Hooked lamp (d8 hefty, see below), coat (A1)"]).map((item, index) => ({ ...item, id: String(index) }));
		expect(pointsBelow(items[0].name)).toBe(true);
		expect(tableItemId(items)).toBe("0");
	});
});

describe("retypedProperty", () => {
	const gear = (id, name, sort, system = {}) => ({ id, type: "gear", name, sort, system: { description: "", remedy: "", ...system } });

	it("replaces a Property line kept as gear with what it lists, in its place", () => {
		const { remove, create } = retypedProperty([gear("a", "Old sword (d8 hefty), mail (A1)", 100), gear("b", "Rope", 200)]);
		expect(remove).toEqual(["a"]);
		expect(create).toHaveLength(2);
		expect(create[0]).toMatchObject({ type: "weapon", name: "Old sword", sort: 100 });
		expect(create[1]).toMatchObject({ type: "armour", name: "Mail", sort: 101, system: { equipped: true } });
	});

	it("doesn't wear a second piece of a type already worn (p12)", () => {
		const worn = { id: "c", type: "armour", name: "Gambeson", system: { kind: "coat", equipped: true } };
		const { create } = retypedProperty([worn, gear("a", "Mail (A1), helm (A1)", 0)]);
		expect(create.map((item) => [item.system.kind, item.system.equipped])).toEqual([["coat", false], ["helm", true]]);
	});

	it("leaves gear someone has written about, a Remedy, or a line with nothing typed", () => {
		const { remove, create } = retypedProperty([
			gear("a", "Mail (A1)", 0, { description: "<p>Rusted</p>" }),
			gear("b", "Tincture (A1)", 0, { remedy: "vig" }),
			gear("c", "Pouch of salt (keeps meat a Season)", 0),
			gear("d", "Grey mare (VIG 10, CLA 8, SPI 5, 3GD)", 0)
		]);
		expect(remove).toEqual([]);
		expect(create).toEqual([]);
	});
});

describe("blast consumables", () => {
	it("makes a thrown thing that strikes an area a Blast weapon", () => {
		const [pebbles] = propertyItems(["2 river pebbles (thrown, they burst into gravel, striking for d8 blast, restock each new Season)"]).items;
		expect(pebbles).toMatchObject({ type: "weapon", name: "River pebbles", system: { damage: "d8", blast: true, equipped: true } });
		expect(pebbles.system.description).toBe("<p>Thrown</p><p>They burst into gravel</p><p>Restock each new Season</p>");
		// Two carried, each Attack throws one, and they come back each new Season.
		expect(pebbles.system).toMatchObject({ quantity: { value: 2, max: 2 }, restock: "season", usedUp: true });
	});

	it("counts from an aside that starts with a number", () => {
		const [cones] = propertyItems(["Ember cones (4 dry cones. They crackle as they fly, striking for d8 blast, restock each new Season)"]).items;
		expect(cones.system).toMatchObject({ quantity: { value: 4, max: 4 }, restock: "season", usedUp: true });
	});
});

describe("counts and restocks", () => {
	it("takes the number carried off the front of a name", () => {
		const [darts] = propertyItems(["Oar-hammer (d10 long), 4 barbed darts (d6)"]).items.slice(1);
		expect(darts).toMatchObject({ type: "weapon", name: "Barbed darts", system: { damage: "d6", quantity: { value: 4, max: 4 } } });
		// A dart can be picked up again, so an Attack doesn't use one.
		expect(darts.system.usedUp).toBeUndefined();
	});

	it("counts gear and says when it comes round again", () => {
		const { items } = propertyItems([
			"2 sealed letters (see below, only a Seer may break the seal)",
			"Frost pebble (melts into a cold draught when needed, restock each new Season)",
			"Bramble tea (you brew enough for one dose each day, see below)",
			"Lucky button (use once only to shrug off a Scar)",
			"Wooden spoon (and a fondness for broth)"
		]);
		expect(items[0]).toMatchObject({ name: "Sealed letters (see below, only a Seer may break the seal)", system: { quantity: { value: 2, max: 2 } } });
		expect(items[1].system).toEqual({ quantity: { value: 1, max: 1 }, restock: "season" });
		expect(items[2].system).toEqual({ quantity: { value: 1, max: 1 }, restock: "day" });
		expect(items[3].system).toEqual({ quantity: { value: 1, max: 1 } });
		expect(items[4]).toEqual({ type: "gear", name: "Wooden spoon (and a fondness for broth)" });
	});
});

describe("armour that counts only sometimes", () => {
	it("reads the words sharing its Armour value", () => {
		const { items } = propertyItems([
			"Thorn axe (d8 hefty), grim plate (A1 only when Wounded)",
			"Saddle hauberk (A1 when mounted)",
			"Moss mail (A1 in marshland only), heater (d4, A1)",
			"Reed coat (A1, no protection against water)",
			"Gate plate (A1, when the wearer kneels no arrow finds them)"
		]);
		const piece = (name) => items.find((item) => item.name === name).system;
		expect(piece("Grim plate")).toMatchObject({ condition: "wounded", situation: "", description: "" });
		expect(piece("Saddle hauberk")).toMatchObject({ condition: "mounted" });
		expect(piece("Moss mail")).toMatchObject({ condition: "only", situation: "in marshland", description: "" });
		expect(piece("Reed coat")).toMatchObject({ condition: "except", situation: "against water", description: "" });
		// Said in an aside of its own, a "when" is something it does, not when it counts.
		expect(piece("Gate plate").condition).toBeUndefined();
	});
});

describe("weapons fought two ways", () => {
	it("reads a shot as well as a swing, and a pair as well as one", () => {
		const [hook] = propertyItems(["Crank-hook (d8 long in melee or d8 slow ranged), gambeson (A1)"]).items;
		expect(hook.system).toMatchObject({ damage: "d8", long: true, alternate: { label: "ranged", damage: "d8", slow: true, ranged: true }, description: "" });
		const [knives] = propertyItems(["Twin knives (d4, or d6 each when wielded as a pair), jerkin (A1)"]).items;
		expect(knives.system).toMatchObject({ damage: "d4", alternate: { label: "as a pair", damage: "2d6" }, description: "" });
	});
});

describe("wood and bucklers", () => {
	it("takes shields and staves as wooden, and knows a buckler", () => {
		const { items } = propertyItems([
			"Ash cudgel (d8 hefty), buckler (d4, A1), coif (A1)",
			"Pick-axe (d8 hefty), heater (d4, A1), mail (A1)",
			"Maul (d8 hefty), iron shield (d6, A1)"
		]);
		const piece = (name) => items.find((item) => item.name === name).system;
		expect(piece("Ash cudgel").wooden).toBe(true);
		expect(piece("Buckler")).toMatchObject({ buckler: true });
		expect(piece("Buckler").wooden).toBeUndefined();
		expect(piece("Iron shield").wooden).toBeUndefined();
		expect(piece("Pick-axe").wooden).toBeUndefined();
	});
});

describe("possessionDetails", () => {
	const lines = ["Oar-hammer (d10 long), 4 barbed darts (d6)", "Grim plate (A1 only when Wounded)"];
	const item = (id, type, name, system = {}) => ({ id, type, name, system });

	it("fills in what an older Knight's items don't say", () => {
		const updates = possessionDetails([
			item("darts", "weapon", "4 barbed darts", { quantity: { value: null, max: null } }),
			item("plate", "armour", "Grim plate", { condition: "" }),
			item("hammer", "weapon", "Oar-hammer")
		], lines);
		expect(updates).toEqual([
			{ _id: "darts", "system.quantity": { value: 4, max: 4 }, name: "Barbed darts" },
			{ _id: "plate", "system.condition": "wounded", "system.situation": "" }
		]);
	});

	it("leaves what a player set", () => {
		expect(possessionDetails([
			item("darts", "weapon", "Barbed darts", { quantity: { value: 1, max: 4 } }),
			item("plate", "armour", "Grim plate", { condition: "only", situation: "in a rage" })
		], lines)).toEqual([]);
	});
});

describe("specialist dice", () => {
	it("reads a Knight's own +d6", () => {
		const [axe] = propertyItems(["2 riding axes (d6, +d6 when mounted, thrown at need)"]).items;
		expect(axe.system.specialist).toEqual({ die: "d6", situation: "when mounted" });
		expect(axe.system.description).toBe("<p>Thrown at need</p>");
	});
});

describe("companions", () => {
	it("makes a companion's own attack a weapon of its NPC", () => {
		const { companions } = propertyItems(["Tame owl (VIG 5, CLA 10, SPI 5, 4GD, d4 talons, see below)"]);
		expect(companions[0]).toMatchObject({ name: "Tame owl", attacks: [{ name: "Talons", damage: "d4" }], notes: [] });
		expect(companionActorData(companions[0]).items).toEqual([{ type: "weapon", name: "Talons", system: { damage: "d4", equipped: true } }]);
	});

	it("names a companion's NPC without the pointer to the table", () => {
		const { companions } = propertyItems(["Friend (see below) (VIG 5, CLA 10, SPI 7, 4GD)"]);
		expect(companions[0].name).toBe("Friend");
	});
});

describe("knightCompanions", () => {
	const gear = (id, name, description = "") => ({ id, type: "gear", name, system: { description } });

	it("finds the steed they ride, and the other companions", () => {
		const found = knightCompanions([
			gear("a", "Rope"),
			gear("b", "Grey mare (VIG 10, CLA 8, SPI 5, 3GD, d6 trample)"),
			gear("c", "Tame owl (VIG 5, CLA 10, SPI 5, 4GD, d4 talons, see below)"),
			gear("d", "Spare pony (VIG 7, CLA 7, SPI 5, 2GD)")
		]);
		expect(found.map(({ itemId, steed, keepLine }) => [itemId, steed, keepLine])).toEqual([["b", true, false], ["c", false, true], ["d", false, true]]);
	});

	it("keeps a steed's line that points at the page's table", () => {
		const [found] = knightCompanions([gear("a", "Old steed (VIG 8, CLA 8, SPI 7, 2GD, see below)")]);
		expect(found).toMatchObject({ steed: true, keepLine: true });
	});

	it("can find only the steed, and leaves lines someone has written about", () => {
		const items = [gear("a", "Tame owl (VIG 5, CLA 10, SPI 5, 4GD)"), gear("b", "Grey mare (VIG 10, CLA 8, SPI 5, 3GD)", "<p>Mine now</p>")];
		expect(knightCompanions(items, { steedOnly: true })).toEqual([]);
		expect(knightCompanions(items).map(({ itemId }) => itemId)).toEqual(["a"]);
	});
});

describe("ownerOf", () => {
	const knight = (id, steed) => ({ type: "knight", id, uuid: `Actor.${id}`, system: { steed } });

	it("finds the Knight who rides a steed", () => {
		const bardolf = knight("b", "Actor.s");
		expect(ownerOf([knight("a", null), { type: "npc", uuid: "Actor.s", system: {} }, bardolf], { uuid: "Actor.s" })).toBe(bardolf);
	});

	it("finds the Knight a companion was made for", () => {
		const bardolf = knight("b", null);
		expect(ownerOf([knight("a", null), bardolf], { uuid: "Actor.hawk", companionOf: "b" })).toBe(bardolf);
	});

	it("asks who rides it before whose companion it is", () => {
		const rider = knight("r", "Actor.s");
		expect(ownerOf([knight("m", null), rider], { uuid: "Actor.s", companionOf: "m" })).toBe(rider);
	});

	it("finds nobody for an NPC of its own, or one whose Knight is gone", () => {
		expect(ownerOf([knight("b", "Actor.s")], { uuid: "Actor.other" })).toBeNull();
		expect(ownerOf([knight("b", "Actor.s")], { uuid: "Actor.hawk", companionOf: "gone" })).toBeNull();
		expect(ownerOf([knight("b", "Actor.s")], {})).toBeNull();
	});

	it("passes over an NPC that somehow points at it", () => {
		expect(ownerOf([{ type: "npc", id: "n", uuid: "Actor.n", system: { steed: "Actor.s" } }], { uuid: "Actor.s", companionOf: "n" })).toBeNull();
	});
});

describe("nameWithoutOwner", () => {
	it("takes the Knight's name back off a companion that carried it", () => {
		expect(nameWithoutOwner("Majestic charger (Sir Bardolf)", "Sir Bardolf")).toBe("Majestic charger");
		expect(nameWithoutOwner("Tame owl (Sir Bardolf)", "Sir Bardolf")).toBe("Tame owl");
	});

	it("leaves a name of the companion's own alone", () => {
		expect(nameWithoutOwner("Bucephalus", "Sir Bardolf")).toBe("Bucephalus");
		expect(nameWithoutOwner("Charger (Sir Kay)", "Sir Bardolf")).toBe("Charger (Sir Kay)");
		expect(nameWithoutOwner("Charger", undefined)).toBe("Charger");
	});

	it("keeps a name with nothing left under the Knight's", () => {
		expect(nameWithoutOwner(" (Sir Bardolf)", "Sir Bardolf")).toBe(" (Sir Bardolf)");
	});
});
