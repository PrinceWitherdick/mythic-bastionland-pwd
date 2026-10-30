import { describe, expect, it } from "vitest";
import { ABILITY_KITS, BOOK_EFFECT_PAGES, kitCatchUp, kitForPage, kittedAbility } from "../../module/rules/ability-kits.js";
import { ABILITY_NEEDS, ABILITY_POWERS, ATTACK_GRANTS, abilityOffers, declarableBy, unmetNeed } from "../../module/rules/ability-uses.js";
import { armourTotal, armourUnshielded, armourWorn, severEffects } from "../../module/rules/armour.js";
import { isBladedName } from "../../module/rules/attack-fx.js";
import { attackDamage, changeAttack, damageAgainst, harmBarred, sortDice, withoutDismountDice } from "../../module/rules/attack.js";
import { knightItems } from "../../module/rules/creation.js";
import { resolveDamage } from "../../module/rules/damage.js";
import { diceForBlow, lastingOf } from "../../module/rules/lasting-dice.js";
import { keepsSeat, possessionDetails, propertyItems, seatOf } from "../../module/rules/property.js";
import { NO_STANCE, changesArmour, hasStance, lapsedUpdates, onMoveUpdates, questSworn, stanceOf, stanceTicks } from "../../module/rules/stances.js";

// The Knights' Abilities as their pages give them effects (p28-170). Wording here is
// invented in the book's manner, so no book text lives in the repository.

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

/** The Ability fields a kit may set: what AbilityModel keeps, besides its grants. */
const ABILITY_FIELDS = new Set([
	"bonusDie", "needs", "lastingDie", "situational", "armourFloor", "armourBonus", "doublesShield", "lapses", "onMove", "tempers", "crowd", "weapon", ...ABILITY_POWERS
]);

describe("the Abilities the Knight pages give effects", () => {
	it("set only what an Ability keeps, and only grants and needs there are", () => {
		for (const kit of Object.values(ABILITY_KITS)) {
			const { grants = {}, ...rest } = kit.ability ?? {};
			for (const key of Object.keys(grants)) expect(ATTACK_GRANTS).toContain(key);
			for (const key of Object.keys(rest)) expect(ABILITY_FIELDS.has(key), key).toBe(true);
			if (rest.needs) expect(ABILITY_NEEDS).toContain(rest.needs);
		}
	});

	it("list every page given a kit since the first catch-up, for the step that catches Knights up on them", () => {
		for (const page of BOOK_EFFECT_PAGES) expect(kitForPage(page), String(page)).not.toBeNull();
		expect(BOOK_EFFECT_PAGES).not.toContain(92);
	});

	it("offer a die for one kind of blow unticked, as against somebody known to lie (p28)", () => {
		const system = kittedAbility({ description: "", grants: {} }, kitForPage(28));
		expect(system).toMatchObject({ bonusDie: "d10", needs: "melee", situational: true, grants: { ignoresArmour: true } });
		const [offer] = abilityOffers([ability("stroke", system)]);
		expect(offer).toMatchObject({ grants: ["ignoresArmour"], bonusDie: "d10", needs: "melee", chosen: true, active: false });
	});

	it("offer a Blast or Strong Gambits unticked when only some blows have them (p34, p38)", () => {
		for (const page of [34, 38]) {
			const [offer] = abilityOffers([ability("x", kittedAbility({ grants: {} }, kitForPage(page)))]);
			expect(offer.chosen, String(page)).toBe(true);
		}
		// Set by hand with neither, a Blast with no limit still comes ticked.
		expect(abilityOffers([ability("y", { grants: { blast: true } })])[0].chosen).toBe(false);
	});

	it("give the burst of light and the branches as weapons, kept off until taken up (p112, p152)", () => {
		const halo = knightItems(knightOn(112), kitNames, { radiance: "Light" }).find((item) => item.name === "Light");
		expect(halo.system).toMatchObject({ damage: "d12", blast: true, noHand: true, equipped: false });
		const leaf = knightItems(knightOn(152), kitNames, { branchJavelin: "Thrown", branchSpear: "Spear" });
		expect(leaf.find((item) => item.name === "Thrown").system).toMatchObject({ damage: "d6", hefty: true, equipped: false });
		expect(leaf.find((item) => item.name === "Spear").system).toMatchObject({ damage: "d10", long: true, equipped: false });
	});

	it("catch a Knight made before up on the flat settings it gives", () => {
		const items = [ability("Odd Gift", { armourFloor: null, onMove: false, lapses: "" })];
		const { update } = kitCatchUp(items, kitForPage(40), "Odd Gift", "mythic-bastionland");
		expect(update).toEqual({ _id: "Odd Gift", "system.armourFloor": 4, "system.lapses": "turn", "system.onMove": true });
	});

	it("keep the grants only an Ability lends off what the Referee's Cast declares by hand", () => {
		const open = declarableBy({ type: "npc" });
		expect(open).toContain("ignoresImmunity");
		expect(open).not.toContain("backlash");
		expect(open).not.toContain("rally");
	});
});

describe("what kind of blow an Ability needs", () => {
	const offer = (needs) => ({ name: needs, needs });

	it("a shot (p50)", () => {
		expect(unmetNeed([offer("ranged")], { melee: true, charging: false })).toEqual({ name: "ranged", needs: "ranged" });
		expect(unmetNeed([offer("ranged")], { melee: false, charging: false })).toBeNull();
	});

	it("a melee blow with a shield (p78)", () => {
		expect(unmetNeed([offer("shield")], { melee: true, charging: false, shield: false })).toMatchObject({ needs: "shield" });
		expect(unmetNeed([offer("shield")], { melee: false, charging: false, shield: true })).toMatchObject({ needs: "shield" });
		expect(unmetNeed([offer("shield")], { melee: true, charging: false, shield: true })).toBeNull();
	});

	it("a melee blow made without moving (p54)", () => {
		expect(unmetNeed([offer("still")], { melee: true, charging: false, moved: true })).toMatchObject({ needs: "still" });
		expect(unmetNeed([offer("still")], { melee: false, charging: false, moved: false })).toMatchObject({ needs: "still" });
		expect(unmetNeed([offer("still")], { melee: true, charging: false, moved: false })).toBeNull();
	});
});

describe("dice for the fight kept for melee (p32, p98)", () => {
	it("keep the mark, and sit out a shot", () => {
		const dice = lastingOf([{ faces: 6, label: "Vow", melee: true }, { faces: 8, label: "Bonus" }, { faces: 8, label: "Edge", melee: true }]);
		expect(dice[0]).toEqual({ faces: 6, label: "Vow", melee: true });
		expect(dice[1]).toEqual({ faces: 8, label: "Bonus" });
		expect(diceForBlow(dice, { melee: true })).toHaveLength(3);
		expect(diceForBlow(dice, { melee: false })).toEqual([{ faces: 8, label: "Bonus" }]);
	});
});

describe("stances (p40, p78, p82, p94)", () => {
	const shell = ability("shell", { doublesShield: true, lapses: "turn", inEffect: true });
	const wade = ability("wade", { armourBonus: 1, bonusDie: "d6", inEffect: true });
	const bend = ability("bend", { armourFloor: 4, lapses: "turn", onMove: true, inEffect: false });
	const quest = ability("quest", { oath: true, bonusDie: "d12", situational: true, inEffect: true });

	it("know an Ability that has one, and what it does to Armour once taken up", () => {
		expect([shell, wade, bend, quest].map((item) => hasStance(item.system))).toEqual([true, true, true, true]);
		expect(changesArmour(quest.system)).toBe(false);
		expect(stanceOf([])).toBe(NO_STANCE);
		expect(stanceOf([shell, wade, bend, quest])).toEqual({
			bonus: 1,
			floor: 0,
			doublesShield: true,
			lines: [{ name: "shell", kind: "doublesShield", value: 2 }, { name: "wade", kind: "bonus", value: 1 }]
		});
	});

	it("end those that last a turn, and take up those a Move brings", () => {
		expect(lapsedUpdates([shell, wade, bend])).toEqual([{ _id: "shell", "system.inEffect": false }]);
		expect(onMoveUpdates([shell, wade, bend])).toEqual([{ _id: "bend", "system.inEffect": true }]);
		expect(onMoveUpdates([{ ...bend, system: { ...bend.system, inEffect: true } }])).toEqual([]);
	});

	it("hold GD back while a quest is sworn", () => {
		expect(questSworn([quest])).toBe(true);
		expect(questSworn([{ ...quest, system: { ...quest.system, inEffect: false } }])).toBe(false);
	});

	it("tick the die of one that adds to every blow, but not one kept for some blows or one kind", () => {
		expect(stanceTicks(wade.system)).toBe(true);
		expect(stanceTicks({ ...wade.system, inEffect: false })).toBe(false);
		expect(stanceTicks(quest.system)).toBe(false);
		expect(stanceTicks({ ...shell.system, needs: "shield", bonusDie: "d6" })).toBe(false);
		expect(abilityOffers([wade])[0]).toMatchObject({ active: true, chosen: true });
	});
});

describe("Armour under a stance", () => {
	const mail = { kind: "coat", armour: 1, equipped: true };
	const helm = { kind: "helm", armour: 1, equipped: true };
	const shield = { kind: "shield", armour: 1, equipped: true };
	const spare = { kind: "shield", armour: 1, equipped: true };

	it("adds a point in deep water (p82)", () => {
		expect(armourTotal([mail, shield], { stance: { bonus: 1, floor: 0, doublesShield: false } })).toBe(3);
	});

	it("counts as Armour 4 at least, without adding to what's worn (p40)", () => {
		const floor = { bonus: 0, floor: 4, doublesShield: false };
		expect(armourTotal([mail], { stance: floor })).toBe(4);
		expect(armourTotal([mail, helm, shield, { kind: "plates", armour: 2, equipped: true }], { stance: floor })).toBe(5);
	});

	it("doubles the one shield that counts (p78), which a Trap still takes away (p10)", () => {
		const doubled = { bonus: 0, floor: 0, doublesShield: true };
		expect(armourTotal([mail, shield, spare], { stance: doubled })).toBe(3);
		expect(armourWorn([{ name: "Shield", system: shield }], { stance: doubled })).toEqual([{ name: "Shield", armour: 2, counts: true }]);
		expect(armourUnshielded([mail, shield], { stance: doubled })).toBe(1);
		expect(armourTotal([mail], { stance: doubled })).toBe(1);
	});
});

describe("VIG lost to Damage doubled by a horn (p72)", () => {
	it("doubles only what comes off VIG, and judges a Mortal Wound on what's lost", () => {
		// 3 past GD 2, doubled to 6 of VIG 12: half, so a Mortal Wound where 3 would only Wound.
		expect(resolveDamage({ damage: 5, guard: 2, vigour: 12 })).toMatchObject({ vigourLoss: 3, outcome: "wounded" });
		expect(resolveDamage({ damage: 5, guard: 2, vigour: 12, vigourTimes: 2 })).toMatchObject({ vigourLoss: 6, vigour: 6, outcome: "mortal" });
	});

	it("leaves GD, an Evade and a Scar as they were", () => {
		expect(resolveDamage({ damage: 2, guard: 2, vigour: 12, vigourTimes: 2 })).toMatchObject({ outcome: "scar", vigourLoss: 0, guard: 0 });
		expect(resolveDamage({ damage: 1, guard: 2, vigour: 12, vigourTimes: 2 })).toMatchObject({ outcome: "evaded", guard: 1 });
	});

	it("still leaves non-lethal Damage short of death, and Slays at 0", () => {
		expect(resolveDamage({ damage: 9, guard: 0, vigour: 10, vigourTimes: 2, nonLethal: true })).toMatchObject({ vigour: 1 });
		expect(resolveDamage({ damage: 5, guard: 0, vigour: 10, vigourTimes: 2 })).toMatchObject({ vigour: 0, outcome: "slain" });
	});
});

/** An Attack card's state straight after rolling these faces and results. */
const rolled = (pairs, extra = {}) => ({
	dice: sortDice(pairs.map(([faces, result]) => ({ faces, result, label: `d${faces}`, deniedBy: null }))),
	melee: true,
	impaired: false,
	gambits: [],
	feats: [],
	appliedTo: [],
	...extra
});

describe("a strike past immunities of any sort (p54)", () => {
	it("reaches a Warband and a structure, and says so to the Damage dialog", () => {
		const share = { melee: true, blast: false, largeScale: false, ignoresImmunity: true, structureHarm: null };
		expect(harmBarred(share, { warband: true })).toBeNull();
		expect(harmBarred(share, { structure: true, stone: true })).toBeNull();
		const strike = rolled([[10, 7]], { ignoresImmunity: true });
		expect(damageAgainst(strike, { warband: true })).toMatchObject({ damage: 7, unharmed: false, harm: { warband: true, structure: true, immunity: true } });
		expect(damageAgainst(rolled([[10, 7]]), { warband: true }).harm).toEqual({ warband: false, structure: false });
	});
});

describe("somebody who can never be dismounted (p44)", () => {
	it("is read off a possession's words, and caught up on an older Knight's", () => {
		expect(seatOf("Fine saddle (you can never be dismounted)")).toEqual({ keepsSeat: true });
		expect(seatOf("Plain saddle")).toEqual({});
		const [saddle] = propertyItems(["Fine saddle (you can never be dismounted)"]).items;
		expect(saddle.system.keepsSeat).toBe(true);
		const older = [{ id: "s", type: "gear", name: "Fine saddle (you can never be dismounted)", system: {} }];
		expect(possessionDetails(older, ["Fine saddle (you can never be dismounted)"])).toEqual([{ _id: "s", "system.keepsSeat": true }]);
	});

	it("fills only the details asked for, so a count the Referee cleared stays cleared", () => {
		const items = [
			{ id: "s", type: "gear", name: "Old saddle (its rider may never be dismounted)", system: {} },
			{ id: "j", type: "weapon", name: "Javelins", system: { damage: "d6", quantity: { value: null, max: null } } }
		];
		const lines = ["Old saddle (its rider may never be dismounted)", "3 javelins (d6 hefty)"];
		expect(possessionDetails(items, lines).some((update) => update._id === "j")).toBe(true);
		expect(possessionDetails(items, lines, { only: ["keepsSeat"] })).toEqual([{ _id: "s", "system.keepsSeat": true }]);
	});

	it("keeps their seat while the saddle is whole", () => {
		expect(keepsSeat([{ type: "gear", system: { keepsSeat: true } }])).toBe(true);
		expect(keepsSeat([{ type: "gear", system: { keepsSeat: true, broken: true } }])).toBe(false);
		expect(keepsSeat(null)).toBe(false);
	});

	it("takes no d6 from a Dismount, whose die stays spent", () => {
		let attack = rolled([[8, 3], [6, 5]]);
		attack = changeAttack(attack, { type: "gambit", die: 0, key: "dismount", bonus: 6 });
		expect(attackDamage(attack)).toMatchObject({ damage: 6 });
		expect(attackDamage(withoutDismountDice(attack))).toMatchObject({ damage: 3 });
		expect(damageAgainst(attack, { seated: true })).toMatchObject({ damage: 3 });
	});
});

describe("limbs and heads taken with a blade (p114)", () => {
	it("knows a blade by its name", () => {
		expect(["Cleavingblade", "Old sword", "Hook-axe", "War sickle", "Stout halberd"].map(isBladedName)).toEqual([true, true, true, true, true]);
		expect(["Polished mace", "Spear", "Heavy staff", ""].map(isBladedName)).toEqual([false, false, false, false]);
	});

	it("offers a limb, and a head only at 0 GD, with the Ability and a blade", () => {
		expect(severEffects({ severs: true, bladed: true, guard: 3 })).toEqual(["limb"]);
		expect(severEffects({ severs: true, bladed: true, guard: 0 })).toEqual(["limb", "head"]);
		expect(severEffects({ severs: true, bladed: false, guard: 0 })).toEqual([]);
		expect(severEffects({ severs: false, bladed: true, guard: 0 })).toEqual([]);
	});
});
