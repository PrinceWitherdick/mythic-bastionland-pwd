import { describe, expect, it } from "vitest";
import {
	attackDamage,
	buildAttackPool,
	canDeny,
	canFundGambit,
	canFundStrongGambit,
	changeAttack,
	checkWielding,
	defaultWielded,
	gambitAllowsSave,
	gambitIgnored,
	hasDeniableDie,
	heldAs,
	isDieSpent,
	parseDice,
	sortDice,
	summarizeAttack
} from "../../module/rules/attack.js";

describe("checkWielding", () => {
	const mace = { hefty: true };
	const shield = {};
	const longbow = { slow: true, ranged: true };
	const shortbow = { long: true, ranged: true };
	const poleaxe = { long: true };

	// The worked example on p8: a mace (d8) and a shield (d4).
	it("lets a Knight wield a Hefty weapon and a shield", () => {
		expect(checkWielding([mace, shield], { hands: true })).toEqual({ refusal: null, usable: [0, 1], setAside: [], impaired: false });
	});

	it("sets a Slow weapon aside after moving", () => {
		expect(checkWielding([longbow], { moved: true })).toMatchObject({ refusal: "allSetAside", usable: [], setAside: [{ index: 0, reason: "slow" }] });
		expect(checkWielding([longbow]).usable).toEqual([0]);
	});

	it("sets a purely ranged weapon aside when the turn began engaged in melee", () => {
		const check = checkWielding([shortbow, { hefty: true }], { engaged: true });
		expect(check).toMatchObject({ usable: [1], setAside: [{ index: 0, reason: "ranged" }] });
	});

	it("refuses an Attack whose every weapon sits out, but not one with a weapon left", () => {
		expect(checkWielding([longbow, shortbow], { moved: true, engaged: true }).refusal).toBe("allSetAside");
		expect(checkWielding([longbow, mace], { moved: true }).refusal).toBeNull();
		// Nothing chosen is an unarmed Attack, which is Impaired rather than refused.
		expect(checkWielding([], { moved: true }).refusal).toBeNull();
	});

	it("keeps Smite to a melee Attack", () => {
		expect(checkWielding([shortbow], { smite: true }).refusal).toBe("smiteRanged");
		expect(checkWielding([shortbow, { hefty: true }], { smite: true }).refusal).toBeNull();
		expect(checkWielding([mace], { smite: true }).refusal).toBeNull();
		expect(checkWielding([shortbow]).refusal).toBeNull();
	});

	it("refuses an Exhausted Attack after moving, but not before", () => {
		expect(checkWielding([mace], { exhausted: true, moved: true }).refusal).toBe("exhausted");
		expect(checkWielding([mace], { exhausted: true }).refusal).toBeNull();
	});

	it("holds a Knight to one Hefty item", () => {
		expect(checkWielding([mace, { hefty: true }], { hands: true }).refusal).toBe("hefty");
		expect(checkWielding([mace, { hefty: true }]).refusal).toBeNull();
	});

	it("keeps a Knight's Long weapon in both hands", () => {
		expect(checkWielding([poleaxe, shield], { hands: true }).refusal).toBe("long");
		expect(checkWielding([longbow, { hefty: true }], { hands: true }).refusal).toBe("long");
		expect(checkWielding([poleaxe], { hands: true }).refusal).toBeNull();
	});

	it("counts a lance as Hefty rather than Long when mounted, so it goes with a shield", () => {
		const lance = { long: true, heftyMounted: true };
		expect(checkWielding([lance, shield], { hands: true }).refusal).toBe("long");
		expect(checkWielding([lance, shield], { hands: true, mounted: true }).refusal).toBeNull();
		expect(checkWielding([lance, mace], { hands: true, mounted: true }).refusal).toBe("hefty");
		expect(checkWielding([lance], { confined: true, mounted: true }).impaired).toBe(false);
		expect(heldAs(lance, true)).toEqual({ hefty: true, long: false, slow: false });
		expect(heldAs(poleaxe, true)).toEqual({ hefty: false, long: true, slow: false });
	});

	it("takes a greatlance Slow on foot as Hefty, and not Slow, on horseback", () => {
		const greatlance = { slow: true, heftyMounted: true };
		expect(checkWielding([greatlance], { moved: true }).setAside).toEqual([{ index: 0, reason: "slow" }]);
		expect(checkWielding([greatlance], { moved: true, mounted: true }).setAside).toEqual([]);
	});

	it("fights a weapon one way at a time", () => {
		const melee = { long: true, of: "guisarme" };
		const shot = { slow: true, ranged: true, of: "guisarme" };
		expect(checkWielding([melee, shot]).refusal).toBe("twoWays");
		expect(checkWielding([shot]).refusal).toBeNull();
		expect(checkWielding([{ of: "a" }, { of: "b" }]).refusal).toBeNull();
	});

	it("holds a Knight to two hands, whatever the items are", () => {
		const dagger = {};
		expect(checkWielding([mace, shield, dagger], { hands: true }).refusal).toBe("hands");
		expect(checkWielding([dagger, dagger, dagger], { hands: true }).refusal).toBe("hands");
		expect(checkWielding([mace, dagger], { hands: true }).refusal).toBeNull();
		// A creature's listed attacks aren't held in hands at all.
		expect(checkWielding([mace, shield, dagger]).refusal).toBeNull();
	});

	it("names the Hefty or Long rule before counting hands", () => {
		expect(checkWielding([mace, { hefty: true }, shield], { hands: true }).refusal).toBe("hefty");
		expect(checkWielding([poleaxe, shield, {}], { hands: true }).refusal).toBe("long");
	});

	it("refuses an Attack on the turn its attacker charged a spearwall", () => {
		expect(checkWielding([mace], { spearwall: true }).refusal).toBe("spearwall");
		expect(checkWielding([mace], { exhausted: true, moved: true, spearwall: true }).refusal).toBe("exhausted");
	});

	it("Impairs a Long weapon in a confined space, unless it's set aside", () => {
		expect(checkWielding([poleaxe], { confined: true }).impaired).toBe(true);
		expect(checkWielding([mace], { confined: true }).impaired).toBe(false);
		expect(checkWielding([longbow], { confined: true, moved: true }).impaired).toBe(false);
	});
});

describe("defaultWielded", () => {
	const mace = { damage: "d8", hefty: true };
	const shield = { damage: "d4" };
	const poleaxe = { damage: "d10", long: true };
	const dagger = { damage: "d6" };

	it("ticks everything a Knight can hold at once", () => {
		expect(defaultWielded([mace, shield], { hands: true })).toEqual([0, 1]);
	});

	it("ticks only the Long weapon when a second item is offered", () => {
		expect(defaultWielded([poleaxe, shield], { hands: true })).toEqual([0]);
		expect(defaultWielded([shield, poleaxe], { hands: true })).toEqual([1]);
	});

	it("keeps the hardest-hitting item when a Long weapon is the weaker one", () => {
		expect(defaultWielded([{ damage: "d6", long: true }, mace], { hands: true })).toEqual([1]);
	});

	it("drops the lesser of two Hefty items", () => {
		expect(defaultWielded([{ damage: "d6", hefty: true }, mace], { hands: true })).toEqual([1]);
	});

	it("takes the first of two items that hit equally hard", () => {
		expect(defaultWielded([{ damage: "d8", long: true }, mace], { hands: true })).toEqual([0]);
	});

	it("lets a mounted Knight tick a lance and a shield together", () => {
		const lance = { damage: "d10", long: true, heftyMounted: true };
		expect(defaultWielded([lance, shield], { hands: true })).toEqual([0]);
		expect(defaultWielded([lance, shield], { hands: true, mounted: true })).toEqual([0, 1]);
	});

	it("ticks only the two hardest-hitting of three one-handed items", () => {
		expect(defaultWielded([mace, shield, dagger], { hands: true })).toEqual([0, 2]);
	});

	it("ticks every attack of a creature whose hands aren't counted", () => {
		expect(defaultWielded([poleaxe, mace, dagger])).toEqual([0, 1, 2]);
	});
});

describe("parseDice", () => {
	it.each([
		["d8", [8]],
		["2d6", [6, 6]],
		["D10", [10]],
		["d6+d4", [6, 4]],
		["d6, d12", [6, 12]],
		["d6 d12", [6, 12]],
		["+2d10", [10, 10]],
		[" 2d8 ", [8, 8]],
		["", []],
		["hefty", []],
		[undefined, []]
	])("reads %j as %j", (notation, expected) => {
		expect(parseDice(notation)).toEqual(expected);
	});

	it("caps runaway dice counts", () => {
		expect(parseDice("99d6")).toHaveLength(10);
	});
});

describe("buildAttackPool", () => {
	// The worked example on p8: mace, shield, and an ally's two daggers.
	it("rolls every weapon and shield die together", () => {
		const pool = buildAttackPool({ sources: ["d8", "d4", "d6", "d6"] });
		expect(pool).toEqual({ dice: [8, 4, 6, 6], impaired: false });
	});

	it("adds bonus dice such as Smite", () => {
		expect(buildAttackPool({ sources: ["d8"], bonus: [12] }).dice).toEqual([8, 12]);
	});

	it("rolls only a d4 when Impaired, ignoring bonus dice", () => {
		expect(buildAttackPool({ sources: ["2d10"], bonus: [12], impaired: true })).toEqual({ dice: [4], impaired: true });
	});

	it("treats an Attack with no weapon dice as unarmed and Impaired", () => {
		expect(buildAttackPool({ sources: [], bonus: [8] })).toEqual({ dice: [4], impaired: true });
	});
});

describe("summarizeAttack", () => {
	// p8: the dice show 7, 3, 1 and 5.
	it("takes the highest die and counts dice able to fund Gambits", () => {
		expect(summarizeAttack([7, 3, 1, 5])).toEqual({ highest: 7, gambitDice: 2, strongDice: 0 });
	});

	it("counts Strong Gambit dice only in melee", () => {
		expect(summarizeAttack([9, 8, 2])).toMatchObject({ strongDice: 2 });
		expect(summarizeAttack([9, 8, 2], { melee: false })).toMatchObject({ strongDice: 0 });
	});

	it("handles an empty roll", () => {
		expect(summarizeAttack([])).toEqual({ highest: 0, gambitDice: 0, strongDice: 0 });
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

describe("sortDice", () => {
	it("puts the highest result first, and the larger die first between equals", () => {
		const dice = sortDice([{ faces: 6, result: 5 }, { faces: 8, result: 7 }, { faces: 10, result: 5 }]);
		expect(dice.map((die) => `d${die.faces}:${die.result}`)).toEqual(["d8:7", "d10:5", "d6:5"]);
	});
});

describe("attackDamage", () => {
	// The worked example on p8: d8 7, d4 3, d6 1 and d6 5, with the 5 spent to Bolster.
	it("takes the highest die left and adds Bolster", () => {
		let attack = rolled([[8, 7], [4, 3], [6, 1], [6, 5]]);
		const five = attack.dice.findIndex((die) => die.result === 5);
		attack = changeAttack(attack, { type: "gambit", die: five, key: "bolster" });
		expect(attackDamage(attack)).toMatchObject({ highest: 7, bolster: 1, damage: 8, faces: 8 });
	});

	it("falls to the next die when the highest is spent, and names that die for a Scar", () => {
		const attack = changeAttack(rolled([[10, 9], [6, 4]]), { type: "deny", die: 0, actor: "Actor.a", name: "Ser A" });
		expect(attackDamage(attack)).toMatchObject({ highest: 4, damage: 4, die: 1, faces: 6 });
	});

	it("leaves only Bolster once every die is gone", () => {
		const attack = changeAttack(rolled([[8, 6]]), { type: "gambit", die: 0, key: "bolster" });
		expect(attackDamage(attack)).toMatchObject({ highest: 0, bolster: 1, damage: 1, die: null, faces: null });
	});
});

describe("changeAttack", () => {
	it("spends only unspent dice of 4 or higher on Gambits", () => {
		const attack = rolled([[8, 6], [6, 3]]);
		expect(canFundGambit(attack, 1)).toBe(false);
		expect(changeAttack(attack, { type: "gambit", die: 1, key: "repel" })).toBeNull();

		const spent = changeAttack(attack, { type: "gambit", die: 0, key: "repel" });
		expect(isDieSpent(spent, 0)).toBe(true);
		expect(changeAttack(spent, { type: "gambit", die: 0, key: "trap" })).toBeNull();
	});

	it("refuses Gambits the book doesn't have", () => {
		expect(changeAttack(rolled([[8, 6]]), { type: "gambit", die: 0, key: "fireball" })).toBeNull();
	});

	it("keeps a Strong Gambit only for a melee die of 8 or higher", () => {
		const melee = rolled([[10, 9], [8, 5]]);
		expect(canFundStrongGambit(melee, 0)).toBe(true);
		expect(changeAttack(melee, { type: "gambit", die: 0, key: "repel", strong: "noSave" }).gambits[0].strong).toBe("noSave");
		expect(changeAttack(melee, { type: "gambit", die: 1, key: "repel", strong: "noSave" }).gambits[0].strong).toBeNull();

		const ranged = rolled([[10, 9]], { melee: false });
		expect(canFundStrongGambit(ranged, 0)).toBe(false);
		expect(changeAttack(ranged, { type: "gambit", die: 0, key: "stop", strong: "greater" }).gambits[0].strong).toBeNull();
	});

	it("takes a Gambit back and frees its die", () => {
		const spent = changeAttack(rolled([[8, 6]]), { type: "gambit", die: 0, key: "move" });
		const withdrawn = changeAttack(spent, { type: "withdraw", die: 0 });
		expect(withdrawn.gambits).toEqual([]);
		expect(isDieSpent(withdrawn, 0)).toBe(false);
		expect(changeAttack(withdrawn, { type: "withdraw", die: 0 })).toBeNull();
	});

	it("performs a Focus Gambit without a die, once per combatant and never when Impaired", () => {
		const focused = changeAttack(rolled([[8, 2]]), { type: "focus", key: "bolster", actor: "Actor.k" });
		expect(focused.gambits).toEqual([{ key: "bolster", die: null, strong: null, bonus: null, save: null, dismissed: false, focus: null }]);
		expect(attackDamage(focused).damage).toBe(3);
		expect(changeAttack(focused, { type: "withdraw", die: null })).toBeNull();
		expect(changeAttack(focused, { type: "focus", key: "move", actor: "Actor.k" })).toBeNull();
		expect(changeAttack(rolled([[4, 2]], { impaired: true }), { type: "focus", key: "move", actor: "Actor.k" })).toBeNull();
	});

	it("keeps the CLA Save a Focus cost beside its Gambit", () => {
		const save = { by: "Eve", total: 15, target: 12, passed: false };
		const focused = changeAttack(rolled([[8, 2]]), { type: "focus", key: "move", actor: "Actor.k", save });
		expect(focused.gambits[0].focus).toEqual(save);
		expect(changeAttack(rolled([[8, 2]]), { type: "focus", key: "move", actor: "Actor.k", save: { total: "15" } }).gambits[0].focus).toBeNull();
	});

	it("adds a Dismount's d6 to the dice, and takes it away with the Gambit", () => {
		const attack = rolled([[8, 5], [6, 2]]);
		const dismounted = changeAttack(attack, { type: "gambit", die: 0, key: "dismount", bonus: 6 });
		expect(dismounted.gambits[0].bonus).toBe(6);
		expect(attackDamage(dismounted)).toMatchObject({ highest: 6, damage: 6, die: null, faces: 6 });
		expect(attackDamage(changeAttack(dismounted, { type: "withdraw", die: 0 }))).toMatchObject({ highest: 5, faces: 8 });

		const low = changeAttack(rolled([[10, 9], [8, 5]]), { type: "gambit", die: 1, key: "dismount", bonus: 2 });
		expect(attackDamage(low)).toMatchObject({ highest: 9, die: 0, faces: 10 });
	});

	it("keeps a bonus die only for Dismount, and only one a d6 can show", () => {
		expect(changeAttack(rolled([[8, 6]]), { type: "gambit", die: 0, key: "repel", bonus: 5 }).gambits[0].bonus).toBeNull();
		expect(changeAttack(rolled([[8, 6]]), { type: "gambit", die: 0, key: "dismount", bonus: 9 }).gambits[0].bonus).toBeNull();
		expect(changeAttack(rolled([[8, 2]]), { type: "focus", key: "dismount", actor: "Actor.k", bonus: 4 }).gambits[0].bonus).toBe(4);
	});


	it("records the target's VIG Save against a Gambit, once", () => {
		const spent = changeAttack(rolled([[8, 6]]), { type: "gambit", die: 0, key: "repel" });
		const saved = changeAttack(spent, { type: "gambitSave", index: 0, by: "Grey Knight", total: 17, target: 12, passed: true });
		expect(saved.gambits[0].save).toEqual({ by: "Grey Knight", total: 17, target: 12, passed: true });
		expect(gambitIgnored(saved.gambits[0])).toBe(true);
		// The die stays spent whatever the Save shows: it paid for the attempt (p10).
		expect(isDieSpent(saved, 0)).toBe(true);
		expect(changeAttack(saved, { type: "gambitSave", index: 0, by: "Grey Knight", total: 3, target: 12, passed: false })).toBeNull();
	});

	it("offers no Save against Bolster, Move or a Strong Gambit that denies one", () => {
		expect(gambitAllowsSave({ key: "bolster", strong: null })).toBe(false);
		expect(gambitAllowsSave({ key: "move", strong: null })).toBe(false);
		expect(gambitAllowsSave({ key: "repel", strong: null })).toBe(true);
		expect(gambitAllowsSave({ key: "repel", strong: "greater" })).toBe(true);
		expect(gambitAllowsSave({ key: "repel", strong: "noSave" })).toBe(false);

		const bolstered = changeAttack(rolled([[8, 6]]), { type: "gambit", die: 0, key: "bolster" });
		expect(changeAttack(bolstered, { type: "gambitSave", index: 0, by: "Grey Knight", total: 3, target: 12, passed: false })).toBeNull();
		expect(changeAttack(bolstered, { type: "gambitSave", index: 1, by: "Grey Knight", total: 3, target: 12, passed: false })).toBeNull();
	});

	it("refuses a Save without a d20 and a Virtue to beat", () => {
		const spent = changeAttack(rolled([[8, 6]]), { type: "gambit", die: 0, key: "trap" });
		expect(changeAttack(spent, { type: "gambitSave", index: 0, by: "Grey Knight", passed: true })).toBeNull();
		expect(changeAttack(spent, { type: "gambitSave", index: 0, by: "Grey Knight", total: "17", target: 12, passed: true })).toBeNull();
	});

	it("drops a Saved Dismount's d6 and a Saved Bolster from the Damage", () => {
		const dismounted = changeAttack(rolled([[8, 5], [6, 2]]), { type: "gambit", die: 0, key: "dismount", bonus: 6 });
		expect(attackDamage(dismounted)).toMatchObject({ highest: 6, damage: 6, faces: 6 });

		const saved = changeAttack(dismounted, { type: "gambitSave", index: 0, by: "Grey Knight", total: 18, target: 12, passed: true });
		// The d8 is still spent, so only the d6 showing 2 is left to cause Damage.
		expect(attackDamage(saved)).toMatchObject({ highest: 2, damage: 2, die: 1, faces: 6 });

		const failed = changeAttack(dismounted, { type: "gambitSave", index: 0, by: "Grey Knight", total: 4, target: 12, passed: false });
		expect(attackDamage(failed)).toMatchObject({ highest: 6, damage: 6, faces: 6 });
	});


	it("clears a landed Gambit's mark, even once the Damage is settled", () => {
		const spent = changeAttack(rolled([[8, 6]]), { type: "gambit", die: 0, key: "impair" });
		const settled = changeAttack(spent, { type: "applied", names: ["Grey Knight"] });
		// A mark holds into the turns after the blow, so this is the one change a settled card takes.
		const cleared = changeAttack(settled, { type: "dismissMark", index: 0 });
		expect(cleared.gambits[0].dismissed).toBe(true);
		expect(changeAttack(cleared, { type: "dismissMark", index: 0 })).toBeNull();
		expect(changeAttack(settled, { type: "gambit", die: 0, key: "bolster" })).toBeNull();
	});

	it("clears nothing for a Gambit that leaves no mark", () => {
		const bolstered = changeAttack(rolled([[8, 6]]), { type: "gambit", die: 0, key: "bolster" });
		expect(changeAttack(bolstered, { type: "dismissMark", index: 0 })).toBeNull();
		expect(changeAttack(bolstered, { type: "dismissMark", index: 4 })).toBeNull();
	});

	it("Denies any unspent die, low or high, once per combatant", () => {
		const attack = rolled([[8, 7], [6, 2]]);
		const denied = changeAttack(attack, { type: "deny", die: 1, actor: "Actor.a", name: "Ser A" });
		expect(denied.dice[1].deniedBy).toBe("Ser A");
		expect(changeAttack(denied, { type: "deny", die: 0, actor: "Actor.a", name: "Ser A" })).toBeNull();
		expect(changeAttack(denied, { type: "deny", die: 0, actor: "Actor.b", name: "Ser B" }).dice[0].deniedBy).toBe("Ser B");
		expect(changeAttack(denied, { type: "deny", die: 1, actor: "Actor.b", name: "Ser B" })).toBeNull();
	});

	it("settles once the Damage is applied", () => {
		const settled = changeAttack(rolled([[8, 6]]), { type: "applied", names: ["Goblin"] });
		expect(settled.appliedTo).toEqual(["Goblin"]);
		expect(changeAttack(settled, { type: "gambit", die: 0, key: "bolster" })).toBeNull();
		expect(changeAttack(settled, { type: "applied", names: ["Goblin"] })).toBeNull();
		expect(changeAttack(rolled([[8, 6]]), { type: "applied", names: [] })).toBeNull();
	});

	it("ignores unknown changes", () => {
		expect(changeAttack(rolled([[8, 6]]), { type: "reroll" })).toBeNull();
		expect(changeAttack(rolled([[8, 6]]), null)).toBeNull();
	});
});

describe("canDeny", () => {
	const attack = () => rolled([[8, 6], [6, 3]], { attacker: "Actor.foe" });
	const knight = { uuid: "Actor.knight" };

	it("lets somebody Deny while a die is left to discard", () => {
		expect(canDeny(attack(), knight)).toBe(true);
		expect(hasDeniableDie(attack())).toBe(true);
	});

	it("refuses a Fatigued Knight, who can perform no Feats until they rest", () => {
		expect(canDeny(attack(), { ...knight, fatigued: true })).toBe(false);
	});

	it("refuses whoever rolled the Attack, and anybody who already Denied it", () => {
		expect(canDeny(attack(), { uuid: "Actor.foe" })).toBe(false);
		const denied = changeAttack(attack(), { type: "deny", die: 0, actor: knight.uuid, name: "Ser K" });
		expect(canDeny(denied, knight)).toBe(false);
		expect(canDeny(denied, { uuid: "Actor.other" })).toBe(true);
	});

	it("falls silent once every die is spent or the Damage lands", () => {
		let spent = changeAttack(attack(), { type: "deny", die: 0, actor: "Actor.a", name: "Ser A" });
		spent = changeAttack(spent, { type: "deny", die: 1, actor: "Actor.b", name: "Ser B" });
		expect(hasDeniableDie(spent)).toBe(false);
		expect(canDeny(spent, knight)).toBe(false);
		expect(canDeny(changeAttack(attack(), { type: "applied", names: ["Ser K"] }), knight)).toBe(false);
	});
});
