import { describe, expect, it } from "vitest";
import { KIT_FLAG, LINKED_KIT_PAGES, kitCatchUp, kitForPage, kittedAbility } from "../../module/rules/ability-kits.js";
import { abilityOffers, abilityUpdatesAfterAttack, linkedAbilities, sideCounts, warbandFighting } from "../../module/rules/ability-uses.js";
import { changeAttack, damageAgainst, sortDice } from "../../module/rules/attack.js";
import { knightItems } from "../../module/rules/creation.js";
import { diceForBlow, lastingOf, temperedDie } from "../../module/rules/lasting-dice.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// Abilities that count the sides (p38), temper a weapon (p98), or are spent by
// the weapon they give (p106, p112). Wording here is invented in the book's
// manner, so no book text lives in the repository.

const ability = (id, system) => ({ id, name: id, type: "ability", system: { grants: {}, quantity: { value: null, max: null }, ...system } });
const kitNames = { dagger: "Dagger", torches: "Torches", rope: "Rope", rations: "Dry rations", camping: "Camping gear" };
const knightOn = (page) => ({
	roll: "2-03",
	page,
	name: "The Test Knight",
	property: ["Old club (d6)"],
	ability: { name: "Odd Gift", text: "Do something odd." },
	passion: { name: "Quiet", text: "Restore SPI in silence." }
});

/** An Attack card straight after rolling, each die `[faces, result, item]`. */
const rolled = (dice, extra = {}) => ({
	dice: sortDice(dice.map(([faces, result, item]) => ({ faces, result, label: `d${faces}`, deniedBy: null, ...(item ? { item } : {}) }))),
	melee: true,
	impaired: false,
	gambits: [],
	feats: [],
	appliedTo: [],
	attacker: "Actor.forge",
	...extra
});

const forge = { label: "Tempering", faces: 8, weapons: [{ id: "guisarme", name: "Bolt-guisarme" }, { id: "knife", name: "Knife" }] };

describe("the kits given more (p38, p98, p106, p112)", () => {
	it("each has a kit, and a weapon an Ability is spent by is one its kit gives", () => {
		for (const page of LINKED_KIT_PAGES) expect(kitForPage(page), String(page)).not.toBeNull();
		for (const page of [106, 112]) {
			const kit = kitForPage(page);
			expect(kit.weapons.map(({ key }) => key)).toContain(kit.ability.weapon);
		}
		expect(kitForPage(38).ability).toMatchObject({ crowd: 3, situational: true });
		expect(kitForPage(98).ability).toMatchObject({ lastingDie: "d8", tempers: true });
	});

	it("tie a new Halo Knight's Ability to the burst it gives", () => {
		const items = knightItems(knightOn(112), kitNames, { radiance: "Light" });
		expect(items.find((item) => item.type === "ability").system.weapon).toBe("radiance");
		expect(items.find((item) => item.name === "Light").flags[SYSTEM_ID][KIT_FLAG]).toBe("radiance");
	});

	it("catch an older Knight up on what's new, and only that", () => {
		const items = [ability("Odd Gift", kittedAbility({ grants: {} }, { ability: { lastingDie: "d8", needs: "melee" } }))];
		expect(kitCatchUp(items, kitForPage(98), "Odd Gift", SYSTEM_ID).update).toEqual({ _id: "Odd Gift", "system.tempers": true });
		const war = [ability("Odd Gift", { grants: { strongGambits: true }, situational: true })];
		expect(kitCatchUp(war, kitForPage(38), "Odd Gift", SYSTEM_ID).update).toEqual({ _id: "Odd Gift", "system.crowd": 3 });
	});
});

describe("counting the sides of a Combat (p38)", () => {
	const self = { disposition: 1, standing: true };
	const ally = { disposition: 1, standing: true };
	const foe = { disposition: -1, standing: true };

	it("counts them on their side, and those against them", () => {
		expect(sideCounts([ally, ally, foe, foe, foe], self)).toEqual({ ours: 3, theirs: 3 });
	});

	it("leaves out bystanders and the fallen", () => {
		const bystander = { disposition: 0, standing: true };
		const fallen = { ...foe, standing: false };
		expect(sideCounts([ally, bystander, bystander, foe, fallen], self)).toEqual({ ours: 2, theirs: 1 });
	});

	it("leaves out the hidden, those on another Scene, and those with no Token to show a side", () => {
		const unseen = { ...foe, present: false };
		const tokenless = { disposition: undefined, standing: true };
		expect(sideCounts([ally, ally, foe, unseen, unseen, tokenless, { ...ally, present: false }], self)).toEqual({ ours: 3, theirs: 1 });
	});

	it("leaves out a Warband routed, surrendered or wiped out, but not one broken", () => {
		expect(warbandFighting(null)).toBe(true);
		expect(warbandFighting({ routed: false, surrendered: false, broken: true, wipedOut: false })).toBe(true);
		for (const gone of ["routed", "surrendered", "wipedOut"]) expect(warbandFighting({ [gone]: true })).toBe(false);
	});

	it("counts nobody whose side is hidden, and no sides for somebody on none", () => {
		const secret = { disposition: -2, standing: true };
		expect(sideCounts([ally, ally, foe, secret, secret], self)).toEqual({ ours: 3, theirs: 1 });
		expect(sideCounts([ally, foe], { disposition: 0, standing: true })).toBeNull();
		expect(sideCounts([ally, foe], { disposition: -2, standing: true })).toBeNull();
	});

	it("counts a Warband as a crowd", () => {
		expect(sideCounts([ally, ally, { ...foe, warband: true }], self).theirs).toBeGreaterThanOrEqual(3);
		expect(sideCounts([{ ...foe, warband: true, standing: false }], self).theirs).toBe(0);
	});

	it("is how many the Ability asks for, which is offered with it", () => {
		const [offer] = abilityOffers([ability("War", kittedAbility({ grants: {} }, kitForPage(38)))]);
		expect(offer).toMatchObject({ crowd: 3, chosen: true });
		expect(abilityOffers([ability("Other", { grants: { blast: true } })])[0].crowd).toBe(0);
	});
});

describe("a weapon an Ability is spent by (p112)", () => {
	const halo = ability("Eruption", { weapon: "radiance", quantity: { value: 1, max: 1 }, restock: "phase" });

	it("finds the Ability a weapon spends", () => {
		expect(linkedAbilities([halo, ability("Other", {})], ["radiance"])).toEqual([halo]);
		expect(linkedAbilities([halo], ["bite"])).toEqual([]);
		expect(linkedAbilities([halo], [])).toEqual([]);
	});

	it("spends its use once, ticked or not", () => {
		expect(abilityUpdatesAfterAttack([halo], ["Eruption"])).toEqual([{ _id: "Eruption", "system.quantity.value": 0 }]);
	});
});

describe("dice given to one weapon (p98)", () => {
	it("keep the weapon, and drop a blank one", () => {
		const [tied, loose] = lastingOf([{ faces: 8, label: "T", melee: true, item: "guisarme", itemName: "Bolt-guisarme" }, { faces: 8, label: "B", item: "" }]);
		expect(tied).toEqual({ faces: 8, label: "T", melee: true, item: "guisarme", itemName: "Bolt-guisarme" });
		expect(loose).toEqual({ faces: 8, label: "B" });
	});

	it("join only a blow made with that weapon", () => {
		const dice = lastingOf([{ faces: 8, label: "T", melee: true, item: "guisarme" }, { faces: 6, label: "Vow", melee: true }]);
		expect(diceForBlow(dice, { melee: true, items: ["guisarme"] })).toHaveLength(2);
		expect(diceForBlow(dice, { melee: true, items: ["knife"] })).toEqual([{ faces: 6, label: "Vow", melee: true }]);
		// Where the weapons aren't known, nothing sits out for them.
		expect(diceForBlow(dice, { melee: true })).toHaveLength(2);
	});
});

describe("a Wound that tempers its weapon (p98)", () => {
	it("tempers the weapon whose die counted", () => {
		const attack = rolled([[10, 3, "guisarme"], [6, 5, "knife"]], { tempers: forge });
		const blow = damageAgainst(attack);
		expect(temperedDie(attack, blow)).toEqual({ faces: 8, label: "Tempering", melee: true, item: "knife", itemName: "Knife" });
	});

	it("tempers the weapon that rolled highest where a bonus die counted", () => {
		const attack = rolled([[10, 3, "guisarme"], [6, 2, "knife"], [12, 11]], { tempers: forge });
		expect(temperedDie(attack, damageAgainst(attack)).item).toBe("guisarme");
		// With no weapon's die to go by, the first weapon wielded.
		expect(temperedDie(rolled([[4, 3]], { tempers: forge }), { dealer: "Actor.forge", die: 0 }).item).toBe("guisarme");
	});

	it("tempers nothing for a blow the weapon didn't deal", () => {
		// A Dismount's d6 counted: no die of the Attack's dealt it.
		expect(temperedDie(rolled([[10, 3, "guisarme"]], { tempers: forge }), { dealer: "Actor.forge", die: null })).toBeNull();
		// A shield of theirs that isn't one of the tempering weapons.
		const shielded = rolled([[4, 4, "shield"], [10, 2, "guisarme"]], { tempers: forge });
		expect(temperedDie(shielded, { dealer: "Actor.forge", die: 0 })).toBeNull();
		// A steed's trample.
		const ridden = { ...rolled([[10, 2, "guisarme"]], { tempers: forge }) };
		ridden.dice = [{ faces: 8, result: 8, label: "Charger", trample: true }, ...ridden.dice];
		expect(temperedDie(ridden, { dealer: "Actor.forge", die: 0 })).toBeNull();
	});

	it("tempers nothing without the Ability", () => {
		const attack = rolled([[10, 9, "guisarme"]]);
		expect(temperedDie(attack, damageAgainst(attack))).toBeNull();
	});

	it("tempers a joiner's weapon only when their die counted", () => {
		const moss = rolled([[8, 2, "sword"]], { attacker: "Actor.moss" });
		const joint = changeAttack(moss, { type: "join", actor: "Actor.forge", name: "Forge", melee: true, tempers: forge, dice: [{ faces: 10, result: 9, label: "Bolt-guisarme", item: "guisarme" }] });
		expect(joint.joined[0].tempers).toEqual(forge);
		expect(temperedDie(joint, damageAgainst(joint))).toMatchObject({ item: "guisarme" });
		const mossWins = changeAttack(rolled([[8, 8, "sword"]], { attacker: "Actor.moss" }), { type: "join", actor: "Actor.forge", name: "Forge", melee: true, tempers: forge, dice: [{ faces: 10, result: 2, label: "Bolt-guisarme", item: "guisarme" }] });
		expect(temperedDie(mossWins, damageAgainst(mossWins))).toBeNull();
	});

	it("drops a joiner's temper that isn't one", () => {
		const moss = rolled([[8, 2]], { attacker: "Actor.moss" });
		for (const tempers of [null, "d8", { faces: 8, weapons: [] }, { faces: "8", weapons: [{ id: "x" }] }]) {
			expect(changeAttack(moss, { type: "join", actor: "Actor.b", name: "B", melee: true, tempers, dice: [{ faces: 6, result: 1, label: "x" }] }).joined[0].tempers).toBeNull();
		}
	});
});
