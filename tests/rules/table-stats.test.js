import { describe, expect, it } from "vitest";
import { entryStats, retypeFor, retypedWeapon, snapshotBefore, tableTargets } from "../../module/rules/table-stats.js";

// Made-up entries in the book's shape: a form and its dice, a specialist die, a trample.
describe("entryStats", () => {
	it("reads a weapon's dice and qualities, writing every quality so a reroll leaves none behind", () => {
		expect(entryStats("Oakheart (d8 hefty)")).toEqual({
			kind: "weapon",
			system: { damage: "d8", hefty: true, long: false, slow: false, blast: false, ignoresArmour: false, heftyMounted: false }
		});
		expect(entryStats("Twin (2d6 long)").system).toMatchObject({ damage: "2d6", long: true });
		expect(entryStats("d10 slow").system).toMatchObject({ damage: "d10", slow: true });
	});

	it("reads a specialist die and when it applies (p12)", () => {
		expect(entryStats("+d8 vs flying things")).toEqual({ kind: "specialist", system: { "specialist.die": "d8", "specialist.situation": "vs flying things" } });
	});

	it("reads Armour and a steed's trample", () => {
		expect(entryStats("Bone plates (A1)")).toEqual({ kind: "armour", system: { armour: 1, condition: "", situation: "" } });
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
