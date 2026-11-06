import { describe, expect, it } from "vitest";
import { effectFields, effectOf, POSSESSION_EFFECTS, USED_EFFECTS } from "../../module/rules/possession-effects.js";
import { propertyGear, propertyItems, remedyOf } from "../../module/rules/property.js";
import { columnStats, entryStats, takesStats } from "../../module/rules/table-stats.js";

// Invented lines and entries in the book's shape.
describe("effectOf", () => {
	it("reads what a possession does when used", () => {
		expect(effectOf("Lucky charm (use once only to count a Mortal Wound as a Wound)")).toEqual({ effect: "easesMortal" });
		expect(effectOf("Glass bead (can absorb an ailment, then cracks)")).toEqual({ effect: "absorbsAffliction" });
		expect(effectOf("Restore one Virtue")).toEqual({ effect: "restoresOne" });
		expect(effectOf("Restore all Virtues")).toEqual({ effect: "restoresAll" });
		expect(effectOf("SPI Save or laugh for an hour")).toEqual({ effect: "saveOnUse", effectVirtue: "spi" });
	});

	it("reads what it costs somebody else, as Damage or a Virtue", () => {
		expect(effectOf("A1, anyone who bites you takes d4 Damage")).toEqual({ effect: "harmsOther", effectDie: "d4", effectVirtue: "" });
		expect(effectOf("Foes who shove you lose d6 CLA")).toEqual({ effect: "harmsOther", effectDie: "d6", effectVirtue: "cla" });
		expect(effectOf("A1, the first Attack of any jester at you is Impaired")).toEqual({ effect: "firstAttackImpaired" });
	});

	it("reads nothing into a Virtue the bearer loses, or into plain words", () => {
		expect(effectOf("Lose d6 SPI if you drop it")).toEqual({});
		expect(effectOf("Hums at dusk")).toEqual({});
		expect(effectOf(null)).toEqual({});
	});

	it("knows which are used from a row", () => {
		expect(POSSESSION_EFFECTS[0]).toBe("");
		expect(USED_EFFECTS).not.toContain("firstAttackImpaired");
		expect(effectFields({ effect: "restoresOne" })).toEqual({ effect: "restoresOne", effectDie: "", effectVirtue: "" });
	});
});

describe("the Property reader, possessions that do something", () => {
	it("gives gear its effect, and makes one that restores a Virtue a Remedy", () => {
		const [charm, balm] = propertyGear(["Lucky charm (use once only to count a Mortal Wound as a Wound)", "Herb balm (one use each day, restores CLA)"]);
		expect(charm.system).toMatchObject({ effect: "easesMortal", quantity: { value: 1, max: 1 } });
		expect(balm.system).toMatchObject({ remedy: "cla", restock: "day" });
		expect(remedyOf("Restores a little hope")).toEqual({});
	});

	it("gives armour what it costs whoever grabs its wearer", () => {
		const [coat] = propertyItems(["Thorn coat (A1, anyone who hugs you takes d4 Damage)"]).items;
		expect(coat.system).toMatchObject({ armour: 1, effect: "harmsOther", effectDie: "d4", effectVirtue: "" });
	});
});

describe("table results that do something", () => {
	it("read an effect, a Virtue the bearer loses, and Armour that only protects sometimes", () => {
		expect(entryStats("Restore all Virtues")).toEqual({ kind: "effect", system: { effect: "restoresAll", effectDie: "", effectVirtue: "" } });
		expect(entryStats("Lose d4 CLA when it rains")).toEqual({ kind: "loss", system: { "loss.dice": "d4", "loss.virtue": "cla", "loss.when": "when it rains" } });
		expect(entryStats("Only protects at sea")).toEqual({ kind: "armourCondition", system: { condition: "only", situation: "at sea" } });
	});

	it("read the column saying what a shield is no use against, on its page alone", () => {
		expect(columnStats({ page: 146 }, 0, "Clubs")).toEqual({ kind: "armourCondition", system: { condition: "except", situation: "against clubs" } });
		expect(columnStats({ page: 146 }, 1, "Clubs")).toBeNull();
		expect(columnStats({ page: 40 }, 0, "Clubs")).toBeNull();
	});

	it("land on any possession as it is, and conditions only on armour", () => {
		for (const type of ["gear", "weapon", "armour"]) expect(takesStats({ type }, "effect")).toBe(true);
		expect(takesStats({ type: "gear" }, "armourCondition")).toBe(false);
		expect(takesStats({ type: "armour" }, "armourCondition")).toBe(true);
	});
});
