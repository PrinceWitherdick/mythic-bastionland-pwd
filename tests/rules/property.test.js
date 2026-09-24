import { describe, expect, it } from "vitest";
import { pointsBelow, tableItemId } from "../../module/rules/knight-tables.js";
import { companionActorData, knightCompanions, nameWithoutOwner, ownerOf, propertyGear, propertyItems, retypedProperty } from "../../module/rules/property.js";

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
		const [pebbles] = propertyItems(["2 river pebbles (thrown, they burst into gravel, striking for d10 blast, restock each new Season)"]).items;
		expect(pebbles).toMatchObject({ type: "weapon", name: "2 river pebbles", system: { damage: "d10", blast: true, equipped: true } });
		expect(pebbles.system.description).toBe("<p>Thrown</p><p>They burst into gravel</p><p>Restock each new Season</p>");
	});
});

describe("specialist dice", () => {
	it("reads a Knight's own +d6", () => {
		const [axe] = propertyItems(["2 riding axes (d6, +d6 when mounted, can be thrown)"]).items;
		expect(axe.system.specialist).toEqual({ die: "d6", situation: "when mounted" });
		expect(axe.system.description).toBe("<p>Can be thrown</p>");
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
