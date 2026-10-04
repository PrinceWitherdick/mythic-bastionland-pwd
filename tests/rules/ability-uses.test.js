import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ATTACK_GRANTS, abilityOffers, usesFrom } from "../../module/rules/ability-uses.js";
import { ABILITY_CADENCES } from "../../module/rules/restock.js";
import { knightItems } from "../../module/rules/creation.js";

// Made-up wording throughout: the book's own never ships.
describe("usesFrom", () => {
	it("reads how many uses and when they come back", () => {
		expect(usesFrom("You may do this once per day.")).toEqual({ quantity: { value: 1, max: 1 }, restock: "day" });
		expect(usesFrom("Call the hounds twice each fight.")).toEqual({ quantity: { value: 2, max: 2 }, restock: "combat" });
		expect(usesFrom("Usable 3 times, all returning at sunset.")).toEqual({ quantity: { value: 3, max: 3 }, restock: "night" });
		expect(usesFrom("<p>Four times a Season you may ask.</p>")).toEqual({ quantity: { value: 4, max: 4 }, restock: "season" });
		expect(usesFrom("Once per Attack, swap two dice.")).toEqual({ quantity: { value: 1, max: 1 }, restock: "attack" });
		expect(usesFrom("Once each Phase, glimpse ahead.")).toEqual({ quantity: { value: 1, max: 1 }, restock: "phase" });
	});

	it("takes the time said nearest the count", () => {
		expect(usesFrom("Before nightfall, and only once per place, you may listen.")).toMatchObject({ restock: "location" });
		expect(usesFrom("Each day you wake early. You may roar twice per fight.")).toMatchObject({ restock: "combat" });
	});

	it("fills nothing without both a count and a time", () => {
		expect(usesFrom("Once you have heard it, you never forget.")).toEqual({});
		expect(usesFrom("Each day the sky darkens.")).toEqual({});
		expect(usesFrom("")).toEqual({});
		expect(usesFrom(null)).toEqual({});
	});

	it("takes no plain 'once', and no time said far from its count", () => {
		expect(usesFrom("Once you have seen a foe fight, you may add a die to an Attack against them.")).toEqual({});
		expect(usesFrom("The hounds come at once, and stay a day.")).toEqual({});
		expect(usesFrom("Shout twice and the crowd will hush and listen to you for a day.")).toEqual({});
	});

	it("reads a later count when the first is no count", () => {
		expect(usesFrom("Once the horn sounds, you may charge twice per fight.")).toEqual({ quantity: { value: 2, max: 2 }, restock: "combat" });
	});
});

describe("abilityOffers", () => {
	const ability = (id, system) => ({ id, name: id, type: "ability", system: { grants: { blast: true }, ...system } });

	it("offers an Ability whose uses come back with this Attack, even spent", () => {
		const items = [
			ability("perAttack", { quantity: { value: 0, max: 1 }, restock: "attack" }),
			ability("perDay", { quantity: { value: 0, max: 1 }, restock: "day" }),
			ability("free", {})
		];
		expect(abilityOffers(items).map(({ id }) => id)).toEqual(["perAttack", "free"]);
	});
});

describe("knightItems and a limited Ability", () => {
	it("starts the Ability counted when its words limit it, and leaves the Passion alone", () => {
		const knight = {
			ability: { name: "Bell Toll", text: "Ring the bell twice per day to halt every foe." },
			passion: { name: "Peal", text: "Restore SPI once per day when the bells ring." }
		};
		const items = knightItems(knight, {});
		expect(items.find((item) => item.type === "ability").system).toMatchObject({ quantity: { value: 2, max: 2 }, restock: "day" });
		expect(items.find((item) => item.type === "passion").system).not.toHaveProperty("restock");
	});
});

describe("the words for each cadence and grant", () => {
	const lang = JSON.parse(readFileSync(join(import.meta.dirname, "../../languages/en.json"), "utf8")).bastionland;

	it("names every time an Ability's uses come back, and every grant with its hint", () => {
		for (const key of ABILITY_CADENCES) expect(typeof lang.ability.per[key || "none"], key).toBe("string");
		for (const key of ATTACK_GRANTS) {
			expect(typeof lang.attack.grant[key], key).toBe("string");
			expect(typeof lang.attack.grant[`${key}Hint`], key).toBe("string");
		}
	});
});
