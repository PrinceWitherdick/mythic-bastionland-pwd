import { describe, expect, it } from "vitest";
import { addsPiece, columnsToRedo, companionStats, entryStats, isCompanionLine, namingColumn, retypeFor, retypedWeapon, snapshotBefore, statsForItem, tableSubject, tableTargets, takesStats } from "../../module/rules/table-stats.js";

// Made-up entries in the book's shape: a form and its dice, a specialist die, a trample.
describe("entryStats", () => {
	it("reads a weapon's dice and qualities, writing every quality so a reroll leaves none behind", () => {
		expect(entryStats("Oakheart (d8 hefty)")).toEqual({
			kind: "weapon",
			system: { damage: "d8", hefty: true, long: false, slow: false, blast: false, ignoresArmour: false, heftyMounted: false },
			name: "Oakheart",
			words: "Oakheart (d8 hefty)"
		});
		expect(entryStats("Twin (2d6 long)").system).toMatchObject({ damage: "2d6", long: true });
		expect(entryStats("d10 slow").system).toMatchObject({ damage: "d10", slow: true });
	});

	it("reads a specialist die and when it applies (p12)", () => {
		expect(entryStats("+d8 vs flying things")).toEqual({ kind: "specialist", system: { "specialist.die": "d8", "specialist.situation": "vs flying things" } });
	});

	it("reads Armour and a steed's trample", () => {
		expect(entryStats("Bone plates (A1)")).toEqual({ kind: "armour", system: { armour: 1, condition: "", situation: "" }, name: "Bone plates", armourKind: "plates" });
		expect(entryStats("A1 in fog")).toEqual({ kind: "armour", system: { armour: 1, condition: "only", situation: "in fog" } });
		expect(entryStats("A1")?.kind).toBe("armour");
		expect(entryStats("d6 trample")).toEqual({ kind: "trample", system: { damage: "d6" } });
	});

	it("finds nothing in words alone", () => {
		expect(entryStats("Hums when it rains")).toBeNull();
		expect(entryStats("")).toBeNull();
		expect(entryStats(null)).toBeNull();
	});
});

describe("tableTargets", () => {
	const items = [
		{ id: "pole", name: "Hooked polearm (d8, long, see below)", type: "weapon" },
		{ id: "helm", name: "Helm (A1, see below)", type: "armour" },
		{ id: "bow", name: "Odd bow (see below)", type: "gear" },
		{ id: "cloak", name: "Cloak", type: "gear" },
		{ id: "song", name: "Hooked polearm song", type: "ability" }
	];

	it("takes the possession the column names", () => {
		expect(tableTargets(items, { header: "Hooked Polearm", tableName: "Kit", tableItemId: "helm", kind: "specialist" })).toEqual(["pole"]);
	});

	it("takes the one the table names when the column names none", () => {
		expect(tableTargets(items, { header: "Form", tableName: "Odd Bow", tableItemId: "pole", kind: "weapon" })).toEqual(["bow"]);
	});

	it("falls back on the one that says see below, if it can take the stats", () => {
		expect(tableTargets(items, { header: "Form", tableName: "Kit", tableItemId: "pole", kind: "weapon" })).toEqual(["pole"]);
		expect(tableTargets(items, { header: "Form", tableName: "Kit", tableItemId: "pole", kind: "armour" })).toEqual([]);
	});

	it("gives several to choose from where the words fit more than one", () => {
		const two = [...items, { id: "pole2", name: "Spare hooked polearm", type: "weapon" }];
		expect(tableTargets(two, { header: "Hooked Polearm", tableName: "", tableItemId: null, kind: "weapon" })).toEqual(["pole", "pole2"]);
	});
});

describe("retyping and putting back", () => {
	it("turns only gear into a weapon or armour", () => {
		expect(retypeFor("gear", "weapon")).toBe("weapon");
		expect(retypeFor("gear", "specialist")).toBe("weapon");
		expect(retypeFor("gear", "armour")).toBe("armour");
		expect(retypeFor("weapon", "weapon")).toBeNull();
		expect(retypedWeapon("Odd crossbow")).toEqual({ equipped: true, ranged: true });
		expect(retypedWeapon("Odd club").ranged).toBe(false);
	});

	it("keeps each value from before the first result, adding only what's new", () => {
		const first = snapshotBefore(null, { damage: "d8", hefty: true }, (path) => ({ damage: "d6", hefty: false })[path]);
		expect(first).toEqual({ damage: "d6", hefty: false });
		const again = snapshotBefore(first, { damage: "d10", "specialist.die": "d8" }, () => "changed");
		expect(again).toEqual({ damage: "d6", hefty: false, "specialist.die": "changed" });
	});
});

// Made-up entries for what companions, shields and new pieces take.
describe("entryStats, beyond a possession's own stats", () => {
	it("reads a trample written after a name, a Guard, and a way to throw it", () => {
		expect(entryStats("Wild (d10 trample)")).toEqual({ kind: "trample", system: { damage: "d10" } });
		expect(entryStats("Marsh heron (6GD)")).toEqual({ kind: "guard", system: { "guard.value": 6, "guard.max": 6 } });
		expect(entryStats("Can be thrown (d8)")).toEqual({ kind: "alternate", system: { "alternate.label": "thrown", "alternate.damage": "d8", "alternate.ranged": true } });
	});

	it("reads a specialist die in an aside after a name, and one of two dice", () => {
		expect(entryStats("Hunting wolves (+d6 vs wolves)")).toEqual({ kind: "specialist", system: { "specialist.die": "d6", "specialist.situation": "vs wolves" } });
		expect(entryStats("+2d10 vs old friends")).toEqual({ kind: "specialist", system: { "specialist.die": "2d10", "specialist.situation": "vs old friends" } });
	});

	it("takes the typed piece of two named together", () => {
		expect(entryStats("Old coat and gloves (A1)")).toMatchObject({ kind: "armour", system: { armour: 1 }, name: "Gloves" });
	});
});

describe("where a result lands", () => {
	const shield = { id: "s", name: "Odd shield (see below)", type: "armour", system: { kind: "shield" } };
	const plate = { id: "p", name: "Odd plate (see below)", type: "armour", system: { kind: "plates" } };

	it("gives a shield a weapon's dice as another way to fight with it", () => {
		expect(takesStats(shield, "weapon")).toBe(true);
		expect(takesStats(shield, "alternate")).toBe(true);
		expect(takesStats(plate, "weapon")).toBe(false);
		expect(statsForItem(entryStats("Edged (d6 in melee)"), shield)).toEqual({
			kind: "alternate",
			system: { "alternate.label": "edged", "alternate.damage": "d6", "alternate.hefty": false, "alternate.long": false, "alternate.slow": false, "alternate.ranged": false, "alternate.blast": false }
		});
		const weapon = { type: "weapon" };
		expect(statsForItem(entryStats("Edged (d6)"), weapon).kind).toBe("weapon");
	});

	it("makes a helm rolled for plate a piece of its own, but not Armour for gear", () => {
		expect(addsPiece(entryStats("Grim helm (A1)"), plate)).toBe(true);
		expect(addsPiece(entryStats("Thick plates (A1)"), plate)).toBe(false);
		expect(addsPiece(entryStats("Grim helm (A1)"), { type: "gear" })).toBe(false);
		expect(addsPiece(entryStats("A1"), plate)).toBe(false);
	});

	it("knows a companion line, and offers it for what its NPC can take", () => {
		const hawk = { id: "h", name: "Grey hawk (VIG 4, CLA 9, SPI 5, 3GD, d4 beak, see below)", type: "gear" };
		expect(isCompanionLine(hawk)).toBe(true);
		expect(isCompanionLine({ type: "gear", name: "Lantern (see below)" })).toBe(false);
		const items = [hawk, { id: "l", name: "Lantern", type: "gear" }];
		expect(tableTargets(items, { header: "Breed", tableName: "Grey Hawk", tableItemId: null, kind: "guard" })).toEqual(["h"]);
		expect(tableTargets(items, { header: "Breed", tableName: "Grey Hawk", tableItemId: null, kind: "weapon" })).toEqual(["h"]);
	});

	it("finds what a table is about whatever its result gives", () => {
		expect(tableSubject([plate, { id: "x", name: "Rope", type: "gear" }], { header: "Quirk", tableName: "Strange Armour", tableItemId: "p" })).toBe("p");
		expect(tableSubject([{ id: "x", name: "Rope", type: "gear" }], { header: "Quirk", tableName: "Strange Armour", tableItemId: null })).toBeNull();
	});

	it("names the companion only on the page it's for", () => {
		expect(namingColumn({ page: 30 })).toBe(1);
		expect(namingColumn({ page: 48 })).toBeNull();
		expect(namingColumn(null)).toBeNull();
	});
});

describe("companionStats", () => {
	const npc = {
		items: [
			{ id: "t", type: "weapon", name: "Trample", system: { trample: true } },
			{ id: "b", type: "weapon", name: "Beak", system: { damage: "d4" } },
			{ id: "c", type: "weapon", name: "Claws", system: { damage: "d4" } }
		]
	};

	it("puts Armour and Guard on the NPC", () => {
		expect(companionStats(entryStats("Stout (A1)"), npc)).toEqual({ actor: { armour: 1 } });
		expect(companionStats(entryStats("Old bird (5GD)"), npc)).toEqual({ actor: { "guard.value": 5, "guard.max": 5 } });
	});

	it("puts dice on the attack the entry speaks of, or a trample on the trample", () => {
		expect(companionStats(entryStats("Kestrel (d6 claws)"), npc).item).toMatchObject({ id: "c", system: { damage: "d6" } });
		expect(companionStats(entryStats("Fierce (d8 trample)"), npc)).toEqual({ item: { id: "t", system: { damage: "d8" } } });
	});

	it("gives an attack or a trample the NPC hadn't got", () => {
		expect(companionStats(entryStats("Stinging tail (d6)"), { items: [] }).create).toMatchObject({ type: "weapon", name: "Stinging tail", system: { damage: "d6", equipped: true } });
		expect(companionStats(entryStats("Fierce (d8 trample)"), { items: [] }, { trampleName: "Hooves" }).create).toEqual({ type: "weapon", name: "Hooves", system: { damage: "d8", trample: true, equipped: true } });
	});

	it("puts a specialist die on the only attack, and nowhere when it can't tell", () => {
		const one = { items: [{ id: "b", type: "weapon", name: "Beak", system: {} }] };
		expect(companionStats(entryStats("+d6 vs snakes"), one)).toEqual({ item: { id: "b", system: { "specialist.die": "d6", "specialist.situation": "vs snakes" } } });
		expect(companionStats(entryStats("+d6 vs snakes"), npc)).toBeNull();
		expect(companionStats(entryStats("Hums"), npc)).toBeNull();
	});
});

describe("columnsToRedo", () => {
	const table = (rows, rolls, page = 99) => ({ columns: rows[0].map((_cell, index) => `Column ${index}`), rows, rolls, page });

	it("redoes a companion's result that was put on the line naming it", () => {
		const hawk = table([["Kestrel (d6 beak)"]], [1]);
		const wrong = { 0: { item: "x", kind: "weapon", retypedFrom: { type: "gear", name: "Grey hawk (VIG 4, CLA 9, SPI 5, 3GD, see below)" } } };
		expect(columnsToRedo(hawk, wrong)).toEqual([0]);
		expect(columnsToRedo(hawk, { 0: { actor: "Actor.hawk", item: "beak", kind: "weapon" } })).toEqual([]);
	});

	it("redoes a result whose kind has changed, or that nothing took before", () => {
		const rows = [["Can be thrown (d6)", "Fierce (d8 trample)", "Hums"]];
		expect(columnsToRedo(table(rows, [1, 1, 1]), { 0: { item: "t", kind: "weapon" }, 1: { item: "s", kind: "weapon" } })).toEqual([0, 1]);
		expect(columnsToRedo(table(rows, [1, 1, 1]), {})).toEqual([0, 1]);
		expect(columnsToRedo(table(rows, [0, 0, 0]), {})).toEqual([]);
	});

	it("redoes named armour put on armour of another kind, but not bare Armour", () => {
		expect(columnsToRedo(table([["Grim helm (A1)"]], [1]), { 0: { item: "plate", kind: "armour", before: {} } })).toEqual([0]);
		expect(columnsToRedo(table([["A1 in fog"]], [1]), { 0: { item: "plate", kind: "armour", before: {} } })).toEqual([]);
	});

	it("names a companion not named yet", () => {
		const named = table([["Lost", "Badger"]], [1, 1], 30);
		expect(columnsToRedo(named, {})).toEqual([1]);
		expect(columnsToRedo(named, { 1: { actor: "Actor.pal", kind: "name", named: "Badger" } })).toEqual([]);
	});
});
