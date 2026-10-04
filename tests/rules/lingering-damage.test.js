import { describe, expect, it } from "vitest";
import { afflictionsFromText, keepsOnFrom, lingeringAffliction, lingeringUpdates, tollsByKind, withAffliction } from "../../module/rules/afflictions.js";
import { WARDED_OUTCOMES, resolveDamage, spiritOutcome, wardedResult } from "../../module/rules/damage.js";
import { chanceOf, possessionDetails, propertyItems } from "../../module/rules/property.js";
import { npcFromStatBlock } from "../../module/rules/stat-blocks.js";

// Wording here is invented in the book's manner, so no book text lives in the repository.

describe("Damage that burns on (p173)", () => {
	it("is read from a stat block's text, ignoring Armour where it says so", () => {
		expect(afflictionsFromText("Spits venom: 2d6 Damage each round, ignoring armour, until scraped off.", "Spitter")).toEqual([
			{ name: "Spitter", loss: "2d6", virtue: "vig", when: "round", damage: true, ignoresArmour: true }
		]);
		expect(afflictionsFromText("Its embers deal d4 damage daily.", "Embers")).toEqual([
			{ name: "Embers", loss: "1d4", virtue: "vig", when: "day", damage: true, ignoresArmour: false }
		]);
	});

	it("is read off a weapon's note", () => {
		expect(keepsOnFrom("Damage each round until scrubbed away")).toBe("round");
		expect(keepsOnFrom("deals damage daily")).toBe("day");
		expect(keepsOnFrom("Sets the area alight")).toBe("");
	});

	it("marks a stat block's weapon whose note says it keeps on", () => {
		const npc = npcFromStatBlock({ name: "Tinker", stats: { vig: 6, guard: 3 }, lines: ["Jars of lye (d6 Damage each round until rinsed, ignoring armour)"] });
		expect(npc.items[0]).toMatchObject({ name: "Jars of lye", system: { damage: "d6", ignoresArmour: true, lingers: "round" } });
	});

	it("makes an affliction of a weapon that leaves it", () => {
		expect(lingeringAffliction({ name: "Jars of lye", system: { damage: "d6", lingers: "round", ignoresArmour: true } })).toEqual({
			name: "Jars of lye", loss: "1d6", virtue: "vig", when: "round", damage: true, ignoresArmour: true
		});
		expect(lingeringAffliction({ name: "Club", system: { damage: "d6", lingers: "" } })).toBeNull();
		expect(lingeringAffliction({ name: "Odd", system: { damage: "", lingers: "round" } })).toBeNull();
	});

	it("is carried once, apart from a Virtue Loss of the same name", () => {
		const lye = { name: "Lye", loss: "1d6", virtue: "vig", when: "round", damage: true };
		const list = withAffliction([], lye, "a");
		expect(withAffliction(list, { ...lye, virtue: "spi" }, "b")).toBeNull();
		expect(withAffliction(list, { name: "Lye", loss: "1d6", virtue: "vig", when: "round" }, "c")).toHaveLength(2);
	});

	it("is taken as Damage, apart from Virtue Loss", () => {
		const loss = { name: "Rot", damage: false };
		const burn = { name: "Lye", damage: true };
		expect(tollsByKind([loss, burn])).toEqual({ losses: [loss], damage: [burn] });
	});

	it("is marked on a Cast member's weapon already in the world", () => {
		const items = [
			{ id: "w1", type: "weapon", name: "Jars of lye", system: { lingers: "" } },
			{ id: "w2", type: "weapon", name: "Club", system: { lingers: "" } },
			{ id: "w3", type: "weapon", name: "Firepot", system: { lingers: "day" } }
		];
		const printed = [
			{ type: "weapon", name: "Jars of lye", system: { lingers: "round" } },
			{ type: "weapon", name: "Firepot", system: { lingers: "round" } }
		];
		expect(lingeringUpdates(items, printed)).toEqual([{ _id: "w1", "system.lingers": "round" }]);
	});
});

describe("Damage to SPI (p68)", () => {
	it("leaves somebody broken, rather than dying or Slain", () => {
		const half = resolveDamage({ damage: 9, guard: 2, vigour: 12 });
		expect(half.outcome).toBe("mortal");
		expect(spiritOutcome(half).outcome).toBe("broken");
		expect(spiritOutcome(resolveDamage({ damage: 20, guard: 2, vigour: 6 })).outcome).toBe("broken");
		expect(spiritOutcome(resolveDamage({ damage: 4, guard: 2, vigour: 12 })).outcome).toBe("wounded");
	});
});

describe("an ally's Mortal Wound taken in their place (p66)", () => {
	it("leaves the victim's GD gone but no VIG", () => {
		const blow = resolveDamage({ damage: 10, guard: 3, vigour: 8 });
		expect(WARDED_OUTCOMES).toContain(blow.outcome);
		expect(wardedResult(blow, 8)).toMatchObject({ guard: 0, guardLoss: 3, vigour: 8, vigourLoss: 0, outcome: "warded" });
	});
});

describe("odds a possession gives (p88)", () => {
	it("are read from its line", () => {
		expect(chanceOf("Bag of maps (1-in-3 chance one shows the place, otherwise see below)")).toEqual({ chance: { in: 1, of: 3 } });
		expect(chanceOf("Lucky coin")).toEqual({});
		expect(chanceOf("A 3-in-2 chance of nonsense")).toEqual({});
	});

	it("are kept on the gear, and filled into a Knight made before they were read", () => {
		const [bag] = propertyItems(["Bag of maps (1-in-3 chance one shows the place, otherwise see below)"]).items;
		expect(bag).toMatchObject({ type: "gear", system: { chance: { in: 1, of: 3 } } });
		const had = [{ id: "g1", type: "gear", name: bag.name, system: { chance: { in: null, of: null } } }];
		expect(possessionDetails(had, ["Bag of maps (1-in-3 chance one shows the place, otherwise see below)"])).toEqual([{ _id: "g1", "system.chance": { in: 1, of: 3 } }]);
	});

	it("leave weapons whose Damage burns on marked from a Knight's line", () => {
		const [jar] = propertyItems(["Clay jar (d6, Damage each round until rinsed)"]).items;
		expect(jar).toMatchObject({ type: "weapon", system: { damage: "d6", lingers: "round" } });
	});
});
