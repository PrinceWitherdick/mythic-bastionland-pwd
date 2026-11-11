import { describe, expect, it } from "vitest";
import { canJoinPack, changePack, joinablePool, newPack, packAsJoining, packAttackState, packCombines, packDice, packJoinsDice, packPreview, unspentShares } from "../../module/rules/pack.js";

const boar = [{ uuid: "Scene.s.Token.boar", name: "Boar" }];

/** The Horde Knight's Pack, with a spear's d8 and a steed's trample. */
function horde() {
	return newPack({
		attackId: "attack-1",
		attacker: "Actor.horde",
		attackerName: "Horde",
		targets: boar,
		share: {
			made: { melee: true, impaired: false, setAside: [], notes: [], lingers: [], shattered: [], onWound: [] },
			dice: [{ faces: 8, label: "Spear", item: "spear" }, { faces: 6, label: "Steed", trample: true }],
			blows: { attacker: "Actor.horde" }
		}
	});
}

/** One who joins, as a card's `join` change brings them. */
const ally = (actor, name, dice, made = { melee: true }) => ({ type: "join", actor, name, made, dice, blows: null });

describe("a Pack card gathering dice before the roll (p56)", () => {
	it("takes each ally's dice once, unrolled, until the Knight rolls", () => {
		let pack = changePack(horde(), ally("Actor.anne", "Anne", [{ faces: 4, label: "Dagger" }]));
		expect(pack.shares.map((share) => share.name)).toEqual(["Horde", "Anne"]);
		expect(changePack(pack, ally("Actor.anne", "Anne", [{ faces: 6, label: "Sword" }]))).toBeNull();
		expect(changePack(pack, ally("Actor.horde", "Horde", [{ faces: 6, label: "Sword" }]))).toBeNull();
		expect(changePack(pack, ally("Actor.bors", "Bors", []))).toBeNull();
		expect(changePack(pack, ally("Actor.bors", "Bors", [{ faces: 0, label: "Nothing" }]))).toBeNull();

		pack = changePack(pack, { type: "roll", shares: 2 });
		expect(canJoinPack(pack)).toBe(false);
		expect(changePack(pack, ally("Actor.bors", "Bors", [{ faces: 6, label: "Sword" }]))).toBeNull();
		expect(changePack(pack, { type: "roll", shares: 2 })).toBeNull();
	});

	it("won't close for a roll made before somebody else joined", () => {
		const pack = changePack(horde(), ally("Actor.anne", "Anne", [{ faces: 4, label: "Dagger" }]));
		expect(changePack(pack, { type: "roll", shares: 1 })).toBeNull();
	});

	it("keeps the Attack card it was rolled into, once", () => {
		const rolled = changePack(horde(), { type: "roll", shares: 1 });
		expect(changePack(horde(), { type: "posted", message: "m" })).toBeNull();
		const posted = changePack(rolled, { type: "posted", message: "m" });
		expect(posted.message).toBe("m");
		expect(changePack(posted, { type: "posted", message: "n" })).toBeNull();
	});

	it("takes a known weakness's die once, however many know it (p188)", () => {
		const pack = changePack(horde(), ally("Actor.anne", "Anne", [{ faces: 4, label: "Dagger" }, { faces: 6, label: "Weakness", weakness: true }]));
		const again = changePack(pack, ally("Actor.bors", "Bors", [{ faces: 6, label: "Sword" }, { faces: 6, label: "Weakness", weakness: true }]));
		expect(again.shares[2].dice).toEqual([{ faces: 6, label: "Sword" }]);
		expect(packAsJoining(again).dice.filter((die) => die.weakness)).toHaveLength(1);
	});

	it("reads as a card to join, aimed where the Knight aimed", () => {
		expect(packAsJoining(horde())).toMatchObject({ attacker: "Actor.horde", attackerName: "Horde", targets: boar, pack: true });
	});
});

describe("rolling a Pack card into an Attack card (p8, p56)", () => {
	const joinedLabel = (dice, others) => (others.length ? `Joined ${dice} with ${others.join(", ")}` : `Joined ${dice}`);
	const anne = () => changePack(horde(), ally("Actor.anne", "Anne", [{ faces: 4, label: "Dagger" }], { melee: false, ignoresArmour: true }));

	it("never offers the steed's trample for joining (p10)", () => {
		expect(joinablePool(anne()).map((die) => die.label)).toEqual(["Spear", "Dagger"]);
	});

	it("joins an ally's d4 and the Knight's d8 into a d12 of the Knight's, who brought more of it", () => {
		const pack = anne();
		const { dice, over } = packDice(pack, [1, 1], joinedLabel);
		expect(over).toEqual([]);
		expect(dice).toEqual([
			{ faces: 12, label: "Joined d8+d4 with Anne", share: 0, joined: true },
			{ faces: 6, label: "Steed", trample: true, share: 0 }
		]);
		const state = packAttackState(pack, dice, [9, 2], { combat: "c", round: 2, turn: 1 });
		expect(state.dice.map((die) => [die.faces, die.result, die.by])).toEqual([[12, 9, "Horde"], [6, 2, "Horde"]]);
		expect(state.dice.some((die) => "joined" in die || "share" in die || "trample" in die)).toBe(false);
		expect(state.place).toEqual({ combat: "c", round: 2, turn: 1 });
		// Anne's dice all went into the Knight's, but she made the Attack too, and may Focus on it.
		expect(state.joined.map((entry) => entry.name)).toEqual(["Anne"]);
		expect(state).toMatchObject({ attacker: "Actor.horde", targets: boar, gambits: [], feats: [], appliedTo: [], duel: null, melee: false });
	});

	it("gives a joined die to whoever brought most of its faces, the Knight between equals", () => {
		const pack = changePack(changePack(horde(), ally("Actor.anne", "Anne", [{ faces: 4, label: "Dagger" }, { faces: 4, label: "Knife" }])), ally("Actor.bors", "Bors", [{ faces: 8, label: "Axe" }]));
		// The Knight's Spear d8 with Anne's Dagger d4 is the Knight's; Anne's Knife d4 with Bors's Axe d8 is Bors's.
		const { dice } = packDice(pack, [1, 1, 2, 2], joinedLabel);
		expect(dice.filter((die) => !die.trample).map((die) => [die.faces, die.share, die.label])).toEqual([
			[12, 0, "Joined d8+d4 with Anne"],
			[12, 2, "Joined d4+d8 with Anne"]
		]);
		const state = packAttackState(pack, dice, [10, 11, 3]);
		expect(state.dice.map((die) => die.by)).toEqual(["Bors", "Horde", "Horde"]);
		expect(state.joined.map((entry) => entry.name)).toEqual(["Anne", "Bors"]);
	});

	it("gives the Knight a die they brought as much of as an ally did", () => {
		const pack = changePack(
			newPack({ attackId: "a", attacker: "Actor.horde", attackerName: "Horde", targets: [], share: { made: { melee: true }, dice: [{ faces: 4, label: "Knife" }] } }),
			ally("Actor.anne", "Anne", [{ faces: 4, label: "Dagger" }])
		);
		const { dice } = packDice(pack, [1, 1], joinedLabel);
		expect(dice).toEqual([{ faces: 8, label: "Joined d4+d4 with Anne", share: 0, joined: true }]);
	});

	it("keeps each share's own dice and traits on the card, sorted highest first", () => {
		const pack = anne();
		const { dice } = packDice(pack, [0, 0], joinedLabel);
		const state = packAttackState(pack, dice, [3, 4, 5]);
		expect(state.dice.map((die) => [die.label, die.result, die.by, die.ignoresArmour])).toEqual([
			["Steed", 5, "Horde", false],
			["Dagger", 4, "Anne", true],
			["Spear", 3, "Horde", false]
		]);
		expect(state.dice.find((die) => die.label === "Spear").item).toBe("spear");
	});

	it("rolls the Knight's dice alone when nobody joined", () => {
		const pack = horde();
		const { dice } = packDice(pack, [], joinedLabel);
		const state = packAttackState(pack, dice, [7, 6]);
		expect(state.dice.map((die) => die.result)).toEqual([7, 6]);
		expect(state.joined).toBeUndefined();
		expect(state.dice[0].by).toBeUndefined();
	});

	it("leaves alone a group that comes to more than a d12", () => {
		const pack = changePack(horde(), ally("Actor.anne", "Anne", [{ faces: 8, label: "Mace" }]));
		const { dice, over } = packDice(pack, [1, 1], joinedLabel);
		expect(over).toEqual([1]);
		expect(dice.map((die) => die.faces)).toEqual([8, 8, 6]);
	});
});

describe("what the dice window says a Pack will roll (p11, p56)", () => {
	const joinedLabel = (dice) => `Joined ${dice}`;
	// The Horde Knight's Spear d8, and a Warband ally's d4, against a Warband, which only a Blast or a large-scale Attack harms.
	const warbandAlly = (faces) => changePack(horde(), ally("Actor.raiders", "Raiders", [{ faces, label: "Spears" }], { melee: true, largeScale: true }));

	it("names whose each die will be, leaving out the steed's trample", () => {
		const { dice } = packPreview(warbandAlly(4), [0, 0], joinedLabel, {});
		expect(dice).toEqual([
			{ faces: 8, owner: "Horde", joined: false, barred: null },
			{ faces: 4, owner: "Raiders", joined: false, barred: null }
		]);
	});

	it("says a die joined into one of somebody's who can't harm the target can't harm it either", () => {
		const { dice } = packPreview(warbandAlly(4), [1, 1], joinedLabel, { warband: true });
		expect(dice).toEqual([{ faces: 12, owner: "Horde", joined: true, barred: "warband" }]);
	});

	it("says a die joined into the ally's, who brought more of it, can harm it", () => {
		const pack = changePack(
			newPack({ attackId: "a", attacker: "Actor.horde", attackerName: "Horde", targets: [], share: { made: { melee: true }, dice: [{ faces: 4, label: "Knife" }] } }),
			ally("Actor.raiders", "Raiders", [{ faces: 8, label: "Spears" }], { melee: true, largeScale: true })
		);
		expect(packPreview(pack, [1, 1], joinedLabel, { warband: true }).dice).toEqual([{ faces: 12, owner: "Raiders", joined: true, barred: null }]);
	});

	it("says which group comes to more than a d12", () => {
		expect(packPreview(warbandAlly(8), [1, 1], joinedLabel).over).toEqual([1]);
	});
});

describe("calling off, reopening and spending a Pack", () => {
	const spend = { items: ["spear", 5, ""], shatters: 1, abilities: ["pack"], keep: [{ faces: 6, label: "Bonus", extra: true }, { faces: "x" }] };

	it("keeps only what it's sure of in what a share uses up", () => {
		const pack = changePack(horde(), { ...ally("Actor.anne", "Anne", [{ faces: 4, label: "Dagger" }]), spend, combine: true });
		expect(pack.shares[1].spend).toEqual({ items: ["spear"], shatters: true, abilities: ["pack"], keep: [{ faces: 6, label: "Bonus" }] });
		expect(horde().shares[0].spend).toEqual({ items: [], shatters: false, abilities: [], keep: [] });
	});

	it("joins dice where anybody who joined has an Ability that does, once somebody else is there", () => {
		expect(packCombines(horde())).toBe(false);
		expect(packJoinsDice(horde())).toBe(false);
		const pack = changePack(horde(), { ...ally("Actor.anne", "Anne", [{ faces: 4, label: "Dagger" }]), combine: true });
		expect(packCombines(pack)).toBe(true);
		expect(packJoinsDice(pack)).toBe(true);
		const alone = newPack({ attackId: "a", attacker: "Actor.horde", attackerName: "Horde", targets: [], share: { made: {}, dice: [{ faces: 8, label: "Spear" }], combine: true } });
		expect(packJoinsDice(alone)).toBe(false);
	});

	it("calls off only while it's open, and takes nobody after", () => {
		const off = changePack(horde(), { type: "callOff" });
		expect(off.calledOff).toBe(true);
		expect(canJoinPack(off)).toBe(false);
		expect(changePack(off, ally("Actor.anne", "Anne", [{ faces: 4, label: "Dagger" }]))).toBeNull();
		expect(changePack(off, { type: "roll", shares: 1 })).toBeNull();
		expect(changePack(off, { type: "callOff" })).toBeNull();
	});

	it("opens again where the roll never reached the chat, but not once it did", () => {
		const rolled = changePack(horde(), { type: "roll", shares: 1 });
		expect(changePack(horde(), { type: "reopen" })).toBeNull();
		expect(canJoinPack(changePack(rolled, { type: "reopen" }))).toBe(true);
		expect(changePack(changePack(rolled, { type: "posted", message: "m" }), { type: "reopen" })).toBeNull();
	});

	it("spends each share once, and only once it's rolled into an Attack card", () => {
		const pack = changePack(horde(), ally("Actor.anne", "Anne", [{ faces: 4, label: "Dagger" }]));
		const rolled = changePack(pack, { type: "roll", shares: 2 });
		expect(unspentShares(rolled)).toEqual([]);
		expect(changePack(rolled, { type: "spent", share: 0 })).toBeNull();
		const posted = changePack(rolled, { type: "posted", message: "m" });
		expect(unspentShares(posted)).toEqual([0, 1]);
		const once = changePack(posted, { type: "spent", share: 1 });
		expect(unspentShares(once)).toEqual([0]);
		expect(changePack(once, { type: "spent", share: 1 })).toBeNull();
		expect(changePack(once, { type: "spent", share: 2 })).toBeNull();
	});
});
