import { describe, expect, it } from "vitest";
import { POWER_KIT_PAGES, kitForPage, kittedAbility } from "../../module/rules/ability-kits.js";
import { diceAimedAt, lastingOf } from "../../module/rules/lasting-dice.js";
import { alliesBeside, drawingFire, featBySeal, guardAfter, mendedUpdate, risenUpdate, sealable, sealedPossession } from "../../module/rules/knight-powers.js";
import { hasStance } from "../../module/rules/stances.js";

describe("the kits for what six Abilities do once used", () => {
	it("give each page its power, and a stance that lapses at their next turn for the one that draws fire", () => {
		expect(POWER_KIT_PAGES).toEqual([42, 70, 84, 128, 156, 158]);
		const powers = { 42: "mortalRally", 70: "seals", 84: "breaksThrough", 128: "drawsFire", 156: "mendsByDay", 158: "rises" };
		for (const [page, power] of Object.entries(powers)) expect(kittedAbility({}, kitForPage(Number(page)))[power]).toBe(true);
		const drawn = kittedAbility({}, kitForPage(128));
		expect(drawn.lapses).toBe("turn");
		expect(hasStance(drawn)).toBe(true);
	});
});

describe("a seal on somebody else's arms", () => {
	const sealed = { type: "weapon", name: "Club", system: { sealed: true, equipped: true } };
	it("counts only while worn or wielded, and whole", () => {
		expect(sealedPossession([{ type: "weapon", system: {} }, sealed])).toBe(sealed);
		expect(sealedPossession([{ ...sealed, system: { sealed: true, equipped: false } }])).toBeNull();
		expect(sealedPossession([{ ...sealed, system: { sealed: true, broken: true } }])).toBeNull();
	});

	it("lends Smite or Deny to somebody who doesn't know it, never Focus", () => {
		expect(featBySeal({ feats: { smite: false } }, [sealed], "smite")).toBe(true);
		expect(featBySeal({ feats: { smite: true } }, [sealed], "smite")).toBe(false);
		expect(featBySeal({ feats: {} }, [sealed], "focus")).toBe(false);
		expect(featBySeal({ feats: {} }, [], "deny")).toBe(false);
	});

	it("goes on a weapon or armour not sealed already, never a trample", () => {
		const items = [
			{ id: "a", type: "weapon", name: "Club", system: {} },
			{ id: "b", type: "armour", name: "Coat", system: {} },
			{ id: "c", type: "gear", name: "Rope", system: {} },
			{ id: "d", type: "weapon", name: "Hooves", system: { trample: true } },
			{ id: "e", type: "weapon", name: "Spear", system: { sealed: true } }
		];
		expect(sealable(items)).toEqual([{ id: "a", name: "Club" }, { id: "b", name: "Coat" }]);
	});
});

describe("a day in a cocoon", () => {
	it("mends the body: VIG, the Mortal Wound and Wound, and afflictions of VIG or Damage", () => {
		const system = {
			virtues: { vig: { value: 2, max: 14 } },
			afflictions: [{ id: "a", virtue: "vig" }, { id: "b", virtue: "spi" }, { id: "c", virtue: "cla", damage: true }]
		};
		expect(mendedUpdate(system)).toEqual({
			"system.virtues.vig.value": 14,
			"system.mortalWound": false,
			"system.wounded": false,
			"system.afflictions": [{ id: "b", virtue: "spi" }]
		});
		expect(mendedUpdate({ virtues: { vig: { max: 9 } }, afflictions: [] })).not.toHaveProperty("system.afflictions");
	});
});

describe("a return from death", () => {
	it("leaves every score as it was, taking only a fate the death wrote", () => {
		const wrote = (fate) => fate.startsWith("Died");
		expect(risenUpdate({ fate: "Died in a ditch" }, wrote)).toEqual({ "system.slain": false, "system.fate": "" });
		expect(risenUpdate({ fate: "Wed a giant" }, wrote)).toEqual({ "system.slain": false });
		expect(risenUpdate({}, wrote)).toEqual({ "system.slain": false });
	});
});

describe("allies rallied by a Mortal Wound", () => {
	const actor = (uuid, system = { guard: { value: 1, max: 4 } }) => ({ uuid, system });
	it("are those alive on the same side, each once", () => {
		const ally = actor("b");
		const combatants = [
			{ actor: actor("a"), disposition: 1 },
			{ actor: ally, disposition: 1 },
			{ actor: ally, disposition: 1 },
			{ actor: actor("c"), disposition: -1 },
			{ actor: actor("d", { slain: true, guard: { value: 0, max: 3 } }), disposition: 1 },
			{ actor: null, disposition: 1 }
		];
		expect(alliesBeside(combatants, "a", 1)).toEqual([ally]);
		expect(alliesBeside(combatants, "a", null)).toEqual([]);
	});

	it("regain GD no further than its most", () => {
		expect(guardAfter({ value: 2, max: 5 }, 6)).toBe(5);
		expect(guardAfter({ value: 2, max: 5 }, 1)).toBe(3);
	});

	it("keep a die against the foe, offered only at them", () => {
		const dice = lastingOf([{ faces: 12, label: "Rally", against: "Actor.foe", againstName: "Foe" }, { faces: 6, label: "Vow" }]);
		expect(dice[0]).toEqual({ faces: 12, label: "Rally", against: "Actor.foe", againstName: "Foe" });
		expect(diceAimedAt(dice, ["Actor.foe"]).map((die) => die.faces)).toEqual([12, 6]);
		expect(diceAimedAt(dice, ["Actor.foe", "Actor.other"]).map((die) => die.faces)).toEqual([6]);
		expect(diceAimedAt(dice, []).map((die) => die.faces)).toEqual([6]);
	});
});

describe("foes who strike elsewhere", () => {
	const knight = (uuid, inEffect) => ({ uuid, items: [{ type: "ability", system: { drawsFire: true, inEffect } }] });
	it("pay to every Knight on another side, holding the stance, who wasn't struck", () => {
		const salt = knight("s", true);
		const combatants = [
			{ actor: { uuid: "foe", items: [] }, disposition: -1 },
			{ actor: salt, disposition: 1 },
			{ actor: knight("t", false), disposition: 1 },
			{ actor: knight("u", true), disposition: -1 }
		];
		expect(drawingFire(combatants, { uuid: "foe", side: -1 }, ["v"]).map(({ actor }) => actor.uuid)).toEqual(["s"]);
		expect(drawingFire(combatants, { uuid: "foe", side: -1 }, ["s"])).toEqual([]);
		expect(drawingFire(combatants, { uuid: "foe", side: -1 }, [])).toEqual([]);
	});
});
