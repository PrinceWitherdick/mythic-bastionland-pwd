import { describe, expect, it } from "vitest";
import {
	attackDamage,
	canJoin,
	canReroll,
	changeAttack,
	checkWielding,
	combineDice,
	damageAgainst,
	defaultWielded,
	diceShowing,
	shareOf,
	sortDice
} from "../../module/rules/attack.js";

/** An Attack card's state, its dice given as [faces, result]. */
const rolled = (pairs, extra = {}) => ({
	dice: sortDice(pairs.map(([faces, result]) => ({ faces, result, label: `d${faces}`, deniedBy: null }))),
	melee: true,
	impaired: false,
	gambits: [],
	feats: [],
	appliedTo: [],
	...extra
});

describe("dice joined into bigger ones (p56)", () => {
	const dice = [{ faces: 4, label: "Shield" }, { faces: 8, label: "Mace" }, { faces: 6, label: "Dagger" }, { faces: 6, label: "Dagger" }];

	it("joins each group into one die as big as its faces together, after those left alone", () => {
		const { dice: joined, over } = combineDice(dice, [1, 1, 2, 2]);
		expect(over).toEqual([]);
		expect(joined.map((die) => die.faces)).toEqual([12, 12]);
		expect(joined[0]).toMatchObject({ label: "d4+d8", joined: [4, 8] });
	});

	it("leaves a die alone where it joins no group, or a group of its own", () => {
		expect(combineDice(dice, [0, 3, 1, 1]).dice.map((die) => die.faces)).toEqual([4, 8, 12]);
		expect(combineDice(dice).dice).toEqual(dice);
	});

	it("joins nothing past a d12, and says which groups came to too much", () => {
		const { dice: joined, over } = combineDice(dice, [1, 1, 1, 0]);
		expect(over).toEqual([1]);
		expect(joined.map((die) => die.faces)).toEqual([6, 4, 8, 6]);
	});
});

describe("weapons that fill no hand", () => {
	const sword = { damage: "d8", hefty: true };
	const shield = { damage: "d4" };
	const bite = { damage: "d6", noHand: true };

	it("are struck beside two hands of weapons, Hefty or Long", () => {
		expect(checkWielding([sword, shield, bite], { hands: true }).refusal).toBeNull();
		expect(checkWielding([sword, shield, { damage: "d6" }], { hands: true }).refusal).toBe("hands");
		expect(checkWielding([{ damage: "d10", long: true }, bite], { hands: true }).refusal).toBeNull();
	});

	it("open unticked for a Knight, as a blow of their own", () => {
		expect(defaultWielded([sword, shield, bite], { hands: true })).toEqual([0, 1]);
		expect(defaultWielded([sword, bite], { hands: false })).toEqual([0, 1]);
	});
});

describe("a blow made alone", () => {
	it("is never joined", () => {
		expect(canJoin(rolled([[8, 5]]))).toBe(true);
		expect(canJoin(rolled([[8, 5]], { alone: true }))).toBe(false);
	});
});

describe("rolling a joint Attack's pool again (p62)", () => {
	const joint = () => changeAttack(rolled([[8, 2], [4, 3]], { attacker: "Actor.moss", attackerName: "Moss" }), {
		type: "join", actor: "Actor.tal", name: "Tal", melee: true, dice: [{ faces: 10, result: 1, label: "Spear" }]
	});

	it("is had only once others have joined, before anything is spent or declared", () => {
		expect(canReroll(rolled([[8, 2]]))).toBe(false);
		expect(canReroll(joint())).toBe(true);
		const fours = joint().dice.findIndex((die) => die.result === 3);
		expect(canReroll(changeAttack(joint(), { type: "focus", key: "repel", actor: "Actor.moss", save: { by: "Moss", total: 3, target: 12, passed: true } }))).toBe(false);
		expect(canReroll(changeAttack(joint(), { type: "deny", die: fours, actor: "Actor.boar", name: "Boar" }))).toBe(false);
		expect(canReroll({ ...joint(), appliedTo: ["Boar"] })).toBe(false);
	});

	it("gives every die a new result, sorted highest first, once, and closes the roll to joiners", () => {
		const attack = joint();
		const results = attack.dice.map((die) => die.faces);
		const again = changeAttack(attack, { type: "reroll", results, by: "Tal" });
		expect(again.dice.map((die) => die.result)).toEqual([10, 8, 4]);
		expect(again.dice[0]).toMatchObject({ by: "Tal", label: "Spear" });
		expect(again.rerolled).toEqual({ by: "Tal" });
		expect(canJoin(again)).toBe(false);
		expect(canReroll(again)).toBe(false);
		expect(changeAttack(again, { type: "reroll", results, by: "Tal" })).toBeNull();
	});

	it("refuses results that don't fit the dice", () => {
		const attack = joint();
		expect(changeAttack(attack, { type: "reroll", results: [1, 1], by: "Tal" })).toBeNull();
		expect(changeAttack(attack, { type: "reroll", results: attack.dice.map((die) => die.faces + 1), by: "Tal" })).toBeNull();
	});
});

describe("a die turned by a rune (p100)", () => {
	it("finds the unspent dice showing the rune's number", () => {
		const attack = rolled([[8, 4], [6, 4], [4, 2]]);
		expect(diceShowing(attack, 4)).toEqual([0, 1]);
		const spent = changeAttack(attack, { type: "gambit", die: 0, key: "repel" });
		expect(diceShowing(spent, 4)).toEqual([1]);
		expect(diceShowing({ ...attack, appliedTo: ["Boar"] }, 4)).toEqual([]);
		expect(diceShowing(attack, null)).toEqual([]);
	});

	it("turns the die to another of its faces, keeping each Gambit on the die that paid for it", () => {
		const attack = changeAttack(rolled([[8, 6], [10, 2], [4, 1]]), { type: "gambit", die: 0, key: "repel" });
		const two = attack.dice.findIndex((die) => die.result === 2);
		const turned = changeAttack(attack, { type: "sigil", die: two, from: 2, value: 9, by: "Ysolde" });
		expect(turned.dice.map((die) => die.result)).toEqual([9, 6, 1]);
		expect(turned.dice[0].adjusted).toEqual({ by: "Ysolde", from: 2 });
		expect(turned.dice[turned.gambits[0].die].result).toBe(6);
		expect(attackDamage(turned).highest).toBe(9);
	});

	it("refuses a die that doesn't show the number, a spent one, or a face it hasn't", () => {
		const attack = changeAttack(rolled([[8, 6], [6, 2]]), { type: "gambit", die: 0, key: "repel" });
		expect(changeAttack(attack, { type: "sigil", die: 1, from: 3, value: 5, by: "Y" })).toBeNull();
		expect(changeAttack(attack, { type: "sigil", die: 0, from: 6, value: 5, by: "Y" })).toBeNull();
		expect(changeAttack(attack, { type: "sigil", die: 1, from: 2, value: 7, by: "Y" })).toBeNull();
		expect(changeAttack(attack, { type: "sigil", die: 1, from: 2, value: 2, by: "Y" })).toBeNull();
	});
});

describe("what an Ability declared follows the die that counts", () => {
	it("carries a drain or Damage to SPI from the share that rolled it", () => {
		const moss = rolled([[8, 2]], { attacker: "Actor.moss", attackerName: "Moss" });
		const joint = changeAttack(moss, { type: "join", actor: "Actor.tal", name: "Tal", melee: true, drain: true, dice: [{ faces: 8, result: 7, label: "Bite" }] });
		expect(damageAgainst(joint)).toMatchObject({ drain: true, spirit: false, dealer: "Actor.tal" });
		expect(shareOf(rolled([[6, 3]], { spirit: true }), null).spirit).toBe(true);
	});

	it("keeps what each share's weapons leave burning, and what they shattered", () => {
		const moss = rolled([[8, 2]], { attacker: "Actor.moss", lingers: [{ name: "Acid", damage: "d8", when: "round" }], shattered: ["Lance"] });
		const joint = changeAttack(moss, {
			type: "join", actor: "Actor.tal", name: "Tal", melee: true, dice: [{ faces: 6, result: 4, label: "Flask" }],
			lingers: [{ name: "Oil", damage: "d6", when: "day" }, { name: "Nonsense" }], shattered: ["Spear", 3]
		});
		expect(joint.lingers.map(({ name }) => name)).toEqual(["Acid", "Oil"]);
		expect(joint.shattered).toEqual(["Lance", "Spear"]);
	});
});
