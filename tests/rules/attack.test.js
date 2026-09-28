import { describe, expect, it } from "vitest";
import {
	atIndividuals,
	attackDamage,
	attackerImpaired,
	attackersOf,
	buildAttackPool,
	canDeny,
	canJoin,
	damageAgainst,
	harmBarred,
	isAttacker,
	isIndividual,
	lastingMarkBy,
	canFundGambit,
	canFundStrongGambit,
	changeAttack,
	checkWielding,
	defaultWielded,
	dismountLanded,
	gambitAllowsSave,
	gambitIgnored,
	hasDeniableDie,
	heldAs,
	isDieSpent,
	knownWeakness,
	parseDice,
	sortDice,
	SAVE_VIRTUES,
	gambitSaveVirtue,
	swarmImpairs,
	trampleJoins,
	weaknessFaces,
	gearHeldInHands,
	insteadOfChanges,
	insteadOfOptions,
	wieldsInHands
} from "../../module/rules/attack.js";
import { npcFromStatBlock } from "../../module/rules/stat-blocks.js";

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
	it("remembers a Gambit Saved against in another Virtue, and reads the rest as VIG (p10, p187)", () => {
		const attack = rolled([[8, 6], [6, 5]]);
		const stab = changeAttack(attack, { type: "gambit", die: 0, key: "impair", saveIn: "cla" });
		expect(stab.gambits[0].saveIn).toBe("cla");
		expect(gambitSaveVirtue(stab.gambits[0])).toBe("cla");
		const plain = changeAttack(attack, { type: "gambit", die: 0, key: "repel", saveIn: "vig" });
		expect(plain.gambits[0]).not.toHaveProperty("saveIn");
		expect(gambitSaveVirtue(plain.gambits[0])).toBe("vig");
		expect(changeAttack(attack, { type: "gambit", die: 0, key: "repel", saveIn: "luck" }).gambits[0]).not.toHaveProperty("saveIn");
		const focused = changeAttack(attack, { type: "focus", key: "trap", actor: "Actor.a", saveIn: "spi", save: { by: "A", total: 3, target: 12, passed: true } });
		expect(gambitSaveVirtue(focused.gambits[0])).toBe("spi");
		expect(SAVE_VIRTUES).toEqual(["vig", "cla", "spi"]);
	});

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
		expect(focused.gambits).toEqual([{ key: "bolster", die: null, strong: null, bonus: null, save: null, dismissed: false, focus: null, payer: "Actor.k" }]);
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

	it("records a Greater effect once, even on a settled card, unless the foe Saved", () => {
		const greater = changeAttack(rolled([[10, 9]]), { type: "gambit", die: 0, key: "impair", strong: "greater" });
		const settled = changeAttack(greater, { type: "applied", names: ["Grey Knight"] });
		const done = changeAttack(settled, { type: "greater", index: 0, text: "Grey Knight loses hold of the Longsword." });
		expect(done.gambits[0].greater).toBe("Grey Knight loses hold of the Longsword.");
		expect(changeAttack(done, { type: "greater", index: 0, text: "Again" })).toBeNull();
		expect(changeAttack(settled, { type: "greater", index: 0, text: " " })).toBeNull();

		const saved = changeAttack(greater, { type: "gambitSave", index: 0, by: "Grey Knight", total: 3, target: 12, passed: true });
		expect(changeAttack(saved, { type: "greater", index: 0, text: "Too late" })).toBeNull();

		const plain = changeAttack(rolled([[10, 9]]), { type: "gambit", die: 0, key: "impair", strong: "noSave" });
		expect(changeAttack(plain, { type: "greater", index: 0, text: "Not strong enough" })).toBeNull();
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

describe("dismountLanded", () => {
	const gambit = (changes) => ({ key: "dismount", die: 5, strong: false, bonus: 3, save: null, dismissed: false, ...changes });
	it("lands unless Saved against or taken back", () => {
		expect(dismountLanded({ gambits: [gambit()] })).toBe(true);
		expect(dismountLanded({ gambits: [gambit({ save: { passed: false } })] })).toBe(true);
		expect(dismountLanded({ gambits: [gambit({ save: { passed: true } })] })).toBe(false);
		expect(dismountLanded({ gambits: [gambit({ dismissed: true })] })).toBe(false);
		expect(dismountLanded({ gambits: [{ ...gambit(), key: "repel" }] })).toBe(false);
	});
});

describe("swarmImpairs", () => {
	it("Impairs an individual's Attack at a swarm unless it's a Blast (p61)", () => {
		expect(swarmImpairs({}, [{ swarm: true }])).toBe(true);
		expect(swarmImpairs({ blast: true }, [{ swarm: true }])).toBe(false);
		expect(swarmImpairs({}, [{ swarm: false }, {}])).toBe(false);
		expect(swarmImpairs({}, [])).toBe(false);
	});

	it("leaves a Warband's Attack alone, since it's no individual's", () => {
		expect(swarmImpairs({ largeScale: true }, [{ swarm: true }])).toBe(false);
	});
});

describe("trampleJoins", () => {
	it("tramples enemies on foot, and takes the charger's word with nobody targeted", () => {
		expect(trampleJoins([])).toBe(true);
		expect(trampleJoins([{ mounted: false }])).toBe(true);
		expect(trampleJoins([{ mounted: true }, { mounted: false }])).toBe(true);
	});

	it("doesn't trample riders, ships or walls", () => {
		expect(trampleJoins([{ mounted: true }])).toBe(false);
		expect(trampleJoins([{ structure: true }, { mounted: true }])).toBe(false);
	});
});

describe("how an NPC wields", () => {
	const weapon = (name, qualities = {}) => ({ name, type: "weapon", system: { damage: "d6", ...qualities } });
	const cast = (line) => npcFromStatBlock({ name: "Somebody", stats: { vig: 10, cla: 10, spi: 10, guard: 3 }, lines: ["A1 (mail)", line] }).items;

	it("reads two hands off a Hefty, Long or Slow weapon, or a shield", () => {
		expect(gearHeldInHands([weapon("Flail", { hefty: true })])).toBe(true);
		expect(gearHeldInHands([weapon("Bow", { long: true })])).toBe(true);
		expect(gearHeldInHands([weapon("Maul", { slow: true })])).toBe(true);
		expect(gearHeldInHands([weapon("Dagger"), weapon("Kite shield")])).toBe(true);
		expect(gearHeldInHands([{ name: "Roundshield", type: "armour", system: { kind: "shield" } }])).toBe(true);
	});

	it("reads claws, teeth and plain weapons as all at once", () => {
		expect(gearHeldInHands([weapon("Claws"), weapon("Bite")])).toBe(false);
		expect(gearHeldInHands([{ name: "Mail", type: "armour", system: { kind: "coat" } }])).toBe(false);
		expect(gearHeldInHands([])).toBe(false);
	});

	it("lets the sheet say otherwise", () => {
		expect(wieldsInHands("", [weapon("Flail", { hefty: true })])).toBe(true);
		expect(wieldsInHands("free", [weapon("Flail", { hefty: true })])).toBe(false);
		expect(wieldsInHands("hands", [weapon("Claws")])).toBe(true);
	});

	it("holds the armed Cast to two hands, and leaves beasts free", () => {
		expect(gearHeldInHands(cast("Sling-staff (d6 long), glaive (d10 long)"))).toBe(true);
		expect(gearHeldInHands(cast("Crossbow (d8 slow), knife (d6)"))).toBe(true);
		expect(gearHeldInHands(cast("Talons and teeth (2d6)"))).toBe(false);
	});

	it("opens an armed NPC's Attack on what two hands can hold", () => {
		const kit = [{ damage: "d6", long: true }, { damage: "d10", long: true }];
		expect(defaultWielded(kit, { hands: true })).toEqual([1]);
		expect(checkWielding(kit, { hands: true }).refusal).toBe("long");
	});

	it("opens a beast's Attack on the harder of attacks printed with \"or\", beside what joins them", () => {
		const beast = [{ damage: "2d12", of: "Pound" }, { damage: "d12", blast: true, of: "Pound" }, { damage: "d6", of: "Bite" }];
		expect(defaultWielded(beast)).toEqual([0, 2]);
		expect(checkWielding(beast).refusal).toBe("twoWays");
	});
});

describe("the Instead of choice", () => {
	const weapon = (id, name, either = "") => ({ id, name, either });

	it("offers each other attack, and each set already one or the other", () => {
		const others = [weapon("p1", "Pound", "Pound"), weapon("s1", "Sweep", "Pound"), weapon("b1", "Bite")];
		expect(insteadOfOptions(weapon("n1", "Kick"), others)).toEqual({
			options: [{ key: "Pound", label: "Pound or Sweep" }, { key: "b1", label: "Bite" }],
			selected: ""
		});
		expect(insteadOfOptions(weapon("n1", "Kick", "Pound"), others).selected).toBe("Pound");
		// A mark nobody else shares any more is no set.
		expect(insteadOfOptions(weapon("n1", "Kick", "gone"), others).selected).toBe("");
	});

	it("marks the attack picked when it wasn't in a set yet", () => {
		expect(insteadOfChanges(weapon(null, "Kick"), [weapon("b1", "Bite")], "b1")).toEqual({
			either: "b1",
			others: [{ _id: "b1", "system.either": "b1" }]
		});
		expect(insteadOfChanges(weapon("k1", "Kick"), [weapon("p1", "Pound", "Pound"), weapon("s1", "Sweep", "Pound")], "Pound")).toEqual({
			either: "Pound",
			others: []
		});
	});

	it("unmarks the last one left in a set", () => {
		expect(insteadOfChanges(weapon("k1", "Kick", "b1"), [weapon("b1", "Bite", "b1")], "")).toEqual({
			either: "",
			others: [{ _id: "b1", "system.either": "" }]
		});
		const three = [weapon("p1", "Pound", "Pound"), weapon("s1", "Sweep", "Pound")];
		expect(insteadOfChanges(weapon("k1", "Kick", "Pound"), three, "").others).toEqual([]);
	});

	it("changes nothing when the pick stands", () => {
		expect(insteadOfChanges(weapon("k1", "Kick", "b1"), [weapon("b1", "Bite", "b1")], "b1")).toEqual({ either: "b1", others: [] });
	});
});

describe("knownWeakness", () => {
	it("gives a learned weakness and its die", () => {
		expect(knownWeakness({ weakness: { text: " hatred of fire ", die: "d10", known: true } })).toEqual({ text: "hatred of fire", die: "d10" });
	});

	it("gives nothing the Knights haven't learned yet", () => {
		expect(knownWeakness({ weakness: { text: "hatred of fire", die: "d10", known: false } })).toBeNull();
	});

	it("gives a known weakness nobody wrote down, with its die", () => {
		expect(knownWeakness({ weakness: { text: "", die: "d8", known: true } })).toEqual({ text: "", die: "d8" });
	});

	it("gives nothing for an actor without one, or a die the book doesn't offer", () => {
		expect(knownWeakness({})).toBeNull();
		expect(knownWeakness(undefined)).toBeNull();
		expect(knownWeakness({ weakness: { text: "x", die: "d20", known: true } })).toBeNull();
	});
});

describe("weaknessFaces", () => {
	it("gives the one die a weakness is worth", () => {
		expect(weaknessFaces([{ die: "d10" }])).toBe(10);
	});

	it("gives one die for a card at several foes, the biggest", () => {
		expect(weaknessFaces([{ die: "d6" }, { die: "d12" }, { die: "d8" }])).toBe(12);
	});

	it("gives nothing when no weakness is used", () => {
		expect(weaknessFaces([])).toBeNull();
	});
});

describe("a Warband against individuals", () => {
	it("counts one person or beast as an individual, and not a Warband, a swarm or a structure (p11)", () => {
		expect(isIndividual({})).toBe(true);
		expect(isIndividual({ mounted: true })).toBe(true);
		expect(isIndividual({ warband: true })).toBe(false);
		expect(isIndividual({ swarm: true })).toBe(false);
		expect(isIndividual({ structure: true })).toBe(false);
	});

	it("is at individuals only when everybody targeted is one, as Tal and Moss are (p189)", () => {
		expect(atIndividuals([{}, { mounted: true }])).toBe(true);
		expect(atIndividuals([{}, { warband: true }])).toBe(false);
		expect(atIndividuals([{ structure: true }])).toBe(false);
	});

	it("can't say with nobody targeted", () => {
		expect(atIndividuals([])).toBeNull();
	});
});

describe("Impairing one weapon", () => {
	const jaw = { id: "jaw", name: "Jaws", actor: "Actor.croc" };

	it("keeps the weapon an Impair names, from a die or from Focus (p186)", () => {
		const attack = rolled([[8, 6], [6, 5]]);
		expect(changeAttack(attack, { type: "gambit", die: 0, key: "impair", weapon: jaw }).gambits[0].weapon).toEqual(jaw);
		const focused = changeAttack(attack, { type: "focus", key: "impair", actor: "Actor.a", weapon: { id: "tail", name: " Tail " } });
		expect(focused.gambits[0].weapon).toEqual({ id: "tail", name: "Tail", actor: null });
	});

	it("names none for the foe's whole next Attack, or for any other Gambit", () => {
		const attack = rolled([[8, 6], [6, 5]]);
		expect(changeAttack(attack, { type: "gambit", die: 0, key: "impair" }).gambits[0]).not.toHaveProperty("weapon");
		expect(changeAttack(attack, { type: "gambit", die: 0, key: "impair", weapon: { id: "jaw", name: " " } }).gambits[0]).not.toHaveProperty("weapon");
		expect(changeAttack(attack, { type: "gambit", die: 0, key: "trap", weapon: jaw }).gambits[0]).not.toHaveProperty("weapon");
	});
});

describe("a joint Attack", () => {
	// p185: Moss rolls d8 and d4, showing 2 and 8, and Tal pounces with 2d8, showing 3 and 5.
	const moss = () => rolled([[8, 2], [4, 8]], { attacker: "Actor.moss", attackerName: "Moss", ignoresArmour: false });
	const tal = (extra = {}) => ({
		type: "join",
		actor: "Actor.tal",
		name: "Tal",
		melee: true,
		dice: [{ faces: 8, result: 5, label: "Hookhammer" }, { faces: 8, result: 3, label: "Hookhammer" }],
		...extra
	});

	it("pools the dice highest first, each labelled with who rolled it (p8)", () => {
		const joint = changeAttack(moss(), tal());
		expect(joint.dice.map((die) => `${die.by} d${die.faces}:${die.result}`)).toEqual(["Moss d4:8", "Tal d8:5", "Tal d8:3", "Moss d8:2"]);
		expect(joint.dice[1]).toMatchObject({ actor: "Actor.tal", label: "Hookhammer", deniedBy: null });
		expect(joint.joined).toEqual([expect.objectContaining({ actor: "Actor.tal", name: "Tal", impaired: false })]);
		expect(attackersOf(joint)).toEqual(["Actor.moss", "Actor.tal"]);
	});

	it("keeps the weapon each of the joiner's dice was rolled for, so a foe can Impair it (p186)", () => {
		const joint = changeAttack(moss(), tal({ dice: [{ faces: 8, result: 5, label: "Hookhammer", item: "hammer" }, { faces: 8, result: 3, label: "Hookhammer", item: "" }] }));
		expect(joint.dice.filter((die) => die.by === "Tal").map((die) => die.item ?? null)).toEqual(["hammer", null]);
	});

	it("takes the highest single die as the Damage, and lets another's die Bolster it, as Tal's 5 does (p185)", () => {
		const joint = changeAttack(moss(), tal());
		const five = joint.dice.findIndex((die) => die.result === 5);
		const bolstered = changeAttack(joint, { type: "gambit", die: five, key: "bolster" });
		expect(attackDamage(bolstered)).toMatchObject({ highest: 8, bolster: 1, damage: 9, faces: 4 });
		expect(damageAgainst(bolstered).dealer).toBe("Actor.moss");
	});

	it("counts the joiner's die when it's the highest, and names them as its dealer", () => {
		const joint = changeAttack(moss(), tal({ dice: [{ faces: 10, result: 9, label: "Axe" }] }));
		expect(joint.dice.map((die) => die.result)).toEqual([9, 8, 2]);
		expect(attackDamage(joint)).toMatchObject({ highest: 9, die: 0 });
		expect(damageAgainst(joint).dealer).toBe("Actor.tal");
	});

	it("closes to joiners once a Deny, Gambit or Focus is declared, taken back or not (p8)", () => {
		expect(canJoin(moss())).toBe(true);
		const gambit = changeAttack(moss(), { type: "gambit", die: 0, key: "bolster" });
		expect(canJoin(gambit)).toBe(false);
		expect(changeAttack(gambit, tal())).toBeNull();
		expect(canJoin(changeAttack(gambit, { type: "withdraw", die: 0 }))).toBe(false);
		expect(canJoin(changeAttack(moss(), { type: "deny", die: 1, actor: "Actor.boar", name: "Boar" }))).toBe(false);
		expect(canJoin(changeAttack(moss(), { type: "focus", key: "move", actor: "Actor.moss" }))).toBe(false);
		// A card from before `declared` was kept shows what was declared on it.
		expect(canJoin({ ...moss(), gambits: [{ key: "bolster", die: 0 }] })).toBe(false);
		expect(canJoin({ ...moss(), duel: "Message.d" })).toBe(false);
		expect(canJoin(changeAttack(moss(), { type: "applied", names: ["Boar"] }))).toBe(false);
		// Joining itself leaves the roll open to more.
		expect(canJoin(changeAttack(moss(), tal()))).toBe(true);
	});

	it("names a joining Warband's leader, who leads from the front (p11)", () => {
		const joint = changeAttack(moss(), tal({ leader: { uuid: "Actor.aldric", name: "Aldric" } }));
		expect(joint.joined[0].leader).toEqual({ uuid: "Actor.aldric", name: "Aldric" });
		expect(changeAttack(moss(), tal()).joined[0].leader).toBeNull();
	});

	it("takes each combatant once, and nobody into a duel or a settled Attack", () => {
		const joint = changeAttack(moss(), tal());
		expect(changeAttack(joint, tal())).toBeNull();
		expect(changeAttack(moss(), tal({ actor: "Actor.moss" }))).toBeNull();
		expect(changeAttack(rolled([[8, 6]], { attacker: "Actor.moss", duel: "Message.d" }), tal())).toBeNull();
		expect(changeAttack(changeAttack(moss(), { type: "applied", names: ["Boar"] }), tal())).toBeNull();
	});

	it("takes only dice really rolled", () => {
		expect(changeAttack(moss(), tal({ dice: [] }))).toBeNull();
		expect(changeAttack(moss(), tal({ dice: [{ faces: 6, result: 7, label: "d6" }] }))).toBeNull();
		expect(changeAttack(moss(), tal({ dice: [{ faces: 6, result: "4", label: "d6" }] }))).toBeNull();
	});

	it("lets nobody rolling in it Deny it", () => {
		const joint = changeAttack(moss(), tal());
		expect(isAttacker(joint, "Actor.tal")).toBe(true);
		expect(canDeny(joint, { uuid: "Actor.tal" })).toBe(false);
		expect(canDeny(joint, { uuid: "Actor.boar" })).toBe(true);
	});

	it("makes Strong Gambits only from melee dice, and counts as ranged once a ranged share joins", () => {
		const joint = changeAttack(moss(), tal({ melee: false, dice: [{ faces: 10, result: 9, label: "Crossbow" }] }));
		expect(joint.melee).toBe(false);
		expect(canFundStrongGambit(joint, joint.dice.findIndex((die) => die.result === 9))).toBe(false);
		expect(canFundStrongGambit(joint, joint.dice.findIndex((die) => die.result === 8))).toBe(true);
	});

	it("weighs cover and Slaying as the die that counts does (p10)", () => {
		const bowman = tal({ melee: false, nonLethal: true, dice: [{ faces: 10, result: 9, label: "Crossbow" }] });
		const joint = changeAttack(moss(), bowman);
		expect(damageAgainst(joint)).toMatchObject({ damage: 9, ranged: true, nonLethal: true, dealer: "Actor.tal" });
		// Deny the crossbow's 9 and Moss's 8 counts: a melee blow that can Slay.
		const denied = changeAttack(joint, { type: "deny", die: 0, actor: "Actor.boar", name: "Boar" });
		expect(damageAgainst(denied)).toMatchObject({ damage: 8, ranged: false, nonLethal: false, dealer: "Actor.moss" });
	});

	it("counts against a Warband only the dice of shares that can harm it (p11)", () => {
		const blast = tal({ blast: true, dice: [{ faces: 6, result: 4, label: "Firepot" }] });
		const joint = changeAttack(moss(), blast);
		// Moss's 8 can't harm a Warband, so Tal's Blast 4 is the Damage against one.
		expect(damageAgainst(joint, { warband: true })).toMatchObject({ damage: 4, harm: { warband: true } });
		expect(damageAgainst(joint)).toMatchObject({ damage: 8 });
		// Nobody's share harms it: the whole is weighed, and the dialog finds them unharmed.
		expect(damageAgainst(changeAttack(moss(), tal()), { warband: true })).toMatchObject({ damage: 8, harm: { warband: false } });
	});

	it("counts against a structure only the dice of shares that can harm it (p11)", () => {
		const fire = tal({ structureHarm: { siege: false, fire: true, large: false }, dice: [{ faces: 6, result: 3, label: "Torch" }] });
		const joint = changeAttack(moss(), fire);
		expect(damageAgainst(joint, { structure: true })).toMatchObject({ damage: 3, harm: { structure: true } });
		// Stone yields only to siege weapons, which nobody brought.
		expect(damageAgainst(joint, { structure: true, stone: true })).toMatchObject({ damage: 8, harm: { structure: false } });
	});

	it("says why a share can't harm a Warband, a structure or a stone wall (p11)", () => {
		expect(harmBarred({ blast: false, largeScale: false }, { warband: true })).toBe("warband");
		expect(harmBarred({ blast: true }, { warband: true })).toBeNull();
		expect(harmBarred({ largeScale: true }, { warband: true })).toBeNull();
		expect(harmBarred({ structureHarm: null }, { structure: true })).toBe("structure");
		expect(harmBarred({ structureHarm: { fire: true } }, { structure: true })).toBeNull();
		expect(harmBarred({ structureHarm: { fire: true } }, { structure: true, stone: true })).toBe("stone");
		expect(harmBarred({}, {})).toBeNull();
	});

	it("says when nobody's share can harm the target at all", () => {
		expect(damageAgainst(changeAttack(moss(), tal()), { warband: true }).unharmed).toBe(true);
		expect(damageAgainst(changeAttack(moss(), tal({ blast: true })), { warband: true }).unharmed).toBe(false);
		expect(damageAgainst(moss()).unharmed).toBe(false);
	});

	it("weighs a lone attacker's card as before", () => {
		const alone = rolled([[8, 6]], { attacker: "Actor.a", melee: false, blast: true, nonLethal: true, ignoresArmour: true });
		expect(damageAgainst(alone, { warband: true })).toMatchObject({ damage: 6, ranged: true, nonLethal: true, ignoresArmour: true, harm: { warband: true, structure: false }, dealer: "Actor.a" });
	});

	it("ignores Armour as the die that counts does", () => {
		const joint = changeAttack(moss(), tal({ ignoresArmour: true, dice: [{ faces: 10, result: 9, label: "Pick" }] }));
		expect(damageAgainst(joint).ignoresArmour).toBe(true);
		const denied = changeAttack(joint, { type: "deny", die: 0, actor: "Actor.boar", name: "Boar" });
		expect(damageAgainst(denied).ignoresArmour).toBe(false);
	});

	it("lets an attacker Focus unless their own share was Impaired (p8)", () => {
		const impaired = changeAttack(rolled([[4, 3]], { attacker: "Actor.moss", impaired: true }), tal({ impaired: true, dice: [{ faces: 4, result: 4, label: "Impaired" }] }));
		expect(attackerImpaired(impaired, "Actor.tal")).toBe(true);
		expect(changeAttack(impaired, { type: "focus", key: "bolster", actor: "Actor.tal" })).toBeNull();

		const shared = changeAttack(rolled([[4, 3]], { attacker: "Actor.moss", impaired: true }), tal());
		expect(changeAttack(shared, { type: "focus", key: "bolster", actor: "Actor.moss" })).toBeNull();
		expect(changeAttack(shared, { type: "focus", key: "bolster", actor: "Actor.tal" }).gambits).toHaveLength(1);
	});

	it("never Slays while any share can, and harms what any share harms (p11)", () => {
		const gentle = rolled([[6, 4]], { attacker: "Actor.a", nonLethal: true, blast: false, structureHarm: { siege: false, fire: false, large: false } });
		const joint = changeAttack(gentle, tal({ nonLethal: false, blast: true, structureHarm: { siege: false, fire: true, large: false } }));
		expect(joint.nonLethal).toBe(false);
		expect(joint.blast).toBe(true);
		expect(joint.structureHarm).toEqual({ siege: false, fire: true, large: false });
	});

	it("leaves a lasting mark for whoever Smote for one", () => {
		expect(lastingMarkBy(moss())).toBeNull();
		expect(lastingMarkBy({ ...moss(), smiteMark: true })).toBe("Moss");
		expect(lastingMarkBy(changeAttack(moss(), tal({ smiteMark: true })))).toBe("Tal");
	});
});
