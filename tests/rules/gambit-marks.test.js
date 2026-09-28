import { describe, expect, it } from "vitest";
import {
	attackMarks,
	comparePlaces,
	gambitPayer,
	impairedItem,
	impairsWhole,
	isImpairedWeapon,
	lapsePlace,
	MARK_GAMBITS,
	markLapsed,
	nextTurn,
	shownWeapons,
	weaponShown
} from "../../module/rules/gambit-marks.js";

const gambit = (key, extra = {}) => ({ key, die: 0, strong: null, bonus: null, save: null, dismissed: false, ...extra });

describe("MARK_GAMBITS", () => {
	it("holds only the three Gambits that outlast their Attack (p10)", () => {
		expect(MARK_GAMBITS).toEqual(["impair", "stop", "trap"]);
	});
});

describe("comparePlaces", () => {
	it("orders by round, then by turn", () => {
		expect(comparePlaces({ round: 1, turn: 5 }, { round: 2, turn: 0 })).toBeLessThan(0);
		expect(comparePlaces({ round: 2, turn: 3 }, { round: 2, turn: 1 })).toBeGreaterThan(0);
		expect(comparePlaces({ round: 2, turn: 1 }, { round: 2, turn: 1 })).toBe(0);
	});
});

describe("nextTurn", () => {
	it("comes this round for a combatant still to act, and next round otherwise", () => {
		expect(nextTurn({ round: 1, turn: 2 }, 4)).toEqual({ round: 1, turn: 4 });
		expect(nextTurn({ round: 1, turn: 2 }, 0)).toEqual({ round: 2, turn: 0 });
		// The attacker's own turn is the one they are taking, so theirs is next round.
		expect(nextTurn({ round: 1, turn: 2 }, 2)).toEqual({ round: 2, turn: 2 });
	});
});

describe("lapsePlace", () => {
	const laid = { round: 1, turn: 2 };

	it("holds an Impair through the foe's next turn, and no longer", () => {
		// The foe acts at 4 this round, so the mark is gone once the turn order passes them.
		expect(lapsePlace("impair", laid, { ownTurn: 4 })).toEqual({ round: 1, turn: 5 });
		expect(lapsePlace("stop", laid, { ownTurn: 0 })).toEqual({ round: 2, turn: 1 });
	});

	it("frees a Trapped shield as the attacker's next turn begins", () => {
		expect(lapsePlace("trap", laid, { attackerTurn: 2 })).toEqual({ round: 2, turn: 2 });
		expect(lapsePlace("trap", laid, { attackerTurn: 5 })).toEqual({ round: 1, turn: 5 });
	});

	it("can't say without a turn order, so the mark waits for a hand", () => {
		expect(lapsePlace("impair", null, { ownTurn: 4 })).toBeNull();
		expect(lapsePlace("impair", laid, { ownTurn: null })).toBeNull();
		expect(lapsePlace("trap", laid, { attackerTurn: null })).toBeNull();
		// The foe's place doesn't date a Trap, nor the attacker's an Impair.
		expect(lapsePlace("trap", laid, { ownTurn: 4 })).toBeNull();
		expect(lapsePlace("impair", laid, { attackerTurn: 4 })).toBeNull();
	});
});

describe("markLapsed", () => {
	const inCombat = { key: "impair", combat: "Combat.a", lapse: { round: 2, turn: 1 } };

	it("never lapses on its own when no Combat was running", () => {
		const byHand = { key: "impair", combat: null, lapse: null };
		expect(markLapsed(byHand, null)).toBe(false);
		expect(markLapsed(byHand, { combat: "Combat.a", round: 9, turn: 9 })).toBe(false);
	});

	it("lapses once the turn order reaches the place it was given", () => {
		expect(markLapsed(inCombat, { combat: "Combat.a", round: 1, turn: 4 })).toBe(false);
		expect(markLapsed(inCombat, { combat: "Combat.a", round: 2, turn: 0 })).toBe(false);
		expect(markLapsed(inCombat, { combat: "Combat.a", round: 2, turn: 1 })).toBe(true);
		expect(markLapsed(inCombat, { combat: "Combat.a", round: 3, turn: 0 })).toBe(true);
	});

	it("lapses when that fight ends, or another begins", () => {
		expect(markLapsed(inCombat, null)).toBe(true);
		expect(markLapsed(inCombat, { combat: "Combat.b", round: 1, turn: 0 })).toBe(true);
	});

	it("holds for the rest of a fight the marked foe isn't fighting in", () => {
		const offOrder = { key: "stop", combat: "Combat.a", lapse: null };
		expect(markLapsed(offOrder, { combat: "Combat.a", round: 9, turn: 9 })).toBe(false);
		expect(markLapsed(offOrder, null)).toBe(true);
	});
});

describe("attackMarks", () => {
	const attack = (gambits, extra = {}) => ({ gambits, attackerName: "Ser Aldric", place: null, ...extra });

	it("leaves a mark for each Gambit that outlasts the Attack", () => {
		const marks = attackMarks(attack([gambit("bolster"), gambit("impair"), gambit("dismount"), gambit("trap")]));
		expect(marks.map((mark) => mark.key)).toEqual(["impair", "trap"]);
		expect(marks[0]).toMatchObject({ index: 1, by: "Ser Aldric", combat: null, lapse: null });
	});

	it("leaves nothing for a Gambit Saved against or already cleared", () => {
		const saved = gambit("impair", { save: { by: "Grey Knight", total: 18, target: 12, passed: true } });
		const failed = gambit("stop", { save: { by: "Grey Knight", total: 4, target: 12, passed: false } });
		const cleared = gambit("trap", { dismissed: true });
		expect(attackMarks(attack([saved, failed, cleared])).map((mark) => mark.key)).toEqual(["stop"]);
	});

	it("dates each mark from where the Attack was rolled in the turn order", () => {
		const place = { combat: "Combat.a", round: 1, turn: 2 };
		const marks = attackMarks(attack([gambit("impair"), gambit("trap")], { place }), { ownTurn: 4, turnOf: () => 2 });
		expect(marks[0]).toMatchObject({ key: "impair", combat: "Combat.a", lapse: { round: 1, turn: 5 } });
		expect(marks[1]).toMatchObject({ key: "trap", combat: "Combat.a", lapse: { round: 2, turn: 2 } });
	});

	it("reads a card rolled before attackers were named", () => {
		expect(attackMarks({ gambits: [gambit("stop")] })[0].by).toBeNull();
	});

	it("carries the one weapon an Impair names, and none for the rest", () => {
		const jaw = { id: "jaw", name: "Jaws", actor: "Actor.croc" };
		const marks = attackMarks(attack([gambit("impair", { weapon: jaw }), gambit("impair"), gambit("trap")]));
		expect(marks.map((mark) => mark.weapon)).toEqual([jaw, null, null]);
	});
});

describe("a mark bought in a joint Attack", () => {
	// Moss rolled the Attack and Tal joined it; die 1 is Tal's, die 0 Moss's.
	const joint = (gambits) => ({
		attacker: "Actor.moss",
		attackerName: "Moss",
		place: { combat: "Combat.a", round: 1, turn: 2 },
		dice: [{ result: 8, actor: "Actor.moss" }, { result: 5, actor: "Actor.tal" }],
		joined: [{ actor: "Actor.tal", name: "Tal" }],
		gambits
	});
	const turns = { "Actor.moss": 2, "Actor.tal": 4 };
	const turnOf = (uuid) => turns[uuid] ?? null;

	it("is whoever's die paid for it, or whoever Focused (p10)", () => {
		const attack = joint([gambit("trap", { die: 1 }), gambit("trap", { die: 0 }), gambit("stop", { die: null, payer: "Actor.tal" })]);
		expect(attack.gambits.map((each) => gambitPayer(attack, each).name)).toEqual(["Tal", "Moss", "Tal"]);
		expect(gambitPayer({ attacker: "Actor.a", attackerName: "A", dice: [{ result: 6 }] }, gambit("trap"))).toEqual({ uuid: "Actor.a", name: "A" });
	});

	it("holds a Trap until its payer's next turn, not the attacker's", () => {
		const marks = attackMarks(joint([gambit("trap", { die: 1 }), gambit("trap", { die: 0 })]), { turnOf });
		expect(marks[0]).toMatchObject({ by: "Tal", lapse: { round: 1, turn: 4 } });
		expect(marks[1]).toMatchObject({ by: "Moss", lapse: { round: 2, turn: 2 } });
	});
});

describe("what a foe has shown", () => {
	const cards = [
		{ attacker: "Actor.croc", dice: [{ label: "Jaws" }, { label: "Bolt-guisarme, shot" }] },
		{ attacker: "Actor.moss", dice: [{ label: "Cudgel" }, { label: "Tail", actor: "Actor.croc" }] },
		{ attacker: "Actor.other", dice: [{ label: "Claws" }] }
	];

	const named = (name, id = "x") => ({ id, name });

	it("reads the dice a foe rolled, alone or into another's Attack", () => {
		expect([...shownWeapons(cards, "Actor.croc").labels].sort()).toEqual(["bolt-guisarme, shot", "jaws", "tail"]);
	});

	it("knows a weapon by the item its dice were rolled for, whatever they're labelled", () => {
		const rolled = [{ attacker: "Actor.croc", dice: [{ label: "Mâchoires", item: "jaw" }, { label: "Tail" }] }];
		const shown = shownWeapons(rolled, "Actor.croc");
		expect([...shown.ids]).toEqual(["jaw"]);
		expect([...shown.labels]).toEqual(["tail"]);
		expect(weaponShown(shown, named("Jaws", "jaw"))).toBe(true);
		expect(weaponShown(shown, named("Jaws", "bite"))).toBe(false);
		expect(weaponShown(shown, named("Tail"))).toBe(true);
	});

	it("knows a weapon on an older card by its name, or its name and how it was used", () => {
		const shown = shownWeapons(cards, "Actor.croc");
		expect(weaponShown(shown, named("Jaws"))).toBe(true);
		expect(weaponShown(shown, named("Bolt-guisarme"))).toBe(true);
		expect(weaponShown(shown, named("Claws"))).toBe(false);
		expect(weaponShown(shown, named("Bolt"))).toBe(false);
		expect(weaponShown(shown, named(""))).toBe(false);
	});
});

describe("Impairing one weapon (p186)", () => {
	const jaw = { key: "impair", weapon: { id: "jaw", name: "Jaws", actor: "Actor.croc" } };
	const tail = { id: "tail", name: "Tail" };

	it("finds the weapon by its id, or by its name on another copy of the foe's sheet", () => {
		expect(isImpairedWeapon(jaw.weapon, { id: "jaw", name: "Bite" })).toBe(true);
		expect(isImpairedWeapon(jaw.weapon, { id: "other", name: " jaws " })).toBe(true);
		expect(isImpairedWeapon(jaw.weapon, tail)).toBe(false);
	});

	it("Impairs an Attack made with that weapon, and leaves the others to fight", () => {
		expect(impairedItem([jaw], [tail, { id: "jaw", name: "Jaws" }])).toBe("Jaws");
		expect(impairedItem([jaw], [tail])).toBeNull();
		expect(impairsWhole([jaw])).toBe(false);
	});

	it("holds the whole next Attack when it names no weapon, as every Impair did before", () => {
		expect(impairsWhole([{ key: "impair", weapon: null }])).toBe(true);
		expect(impairsWhole([{ key: "trap", weapon: null }])).toBe(false);
		expect(impairedItem([{ key: "impair", weapon: null }], [tail])).toBeNull();
	});
});
