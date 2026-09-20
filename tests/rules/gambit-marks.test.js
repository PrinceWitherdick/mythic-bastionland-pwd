import { describe, expect, it } from "vitest";
import {
	attackMarks,
	comparePlaces,
	lapsePlace,
	MARK_GAMBITS,
	markLapsed,
	nextTurn
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
		const marks = attackMarks(attack([gambit("impair"), gambit("trap")], { place }), { ownTurn: 4, attackerTurn: 2 });
		expect(marks[0]).toMatchObject({ key: "impair", combat: "Combat.a", lapse: { round: 1, turn: 5 } });
		expect(marks[1]).toMatchObject({ key: "trap", combat: "Combat.a", lapse: { round: 2, turn: 2 } });
	});

	it("reads a card rolled before attackers were named", () => {
		expect(attackMarks({ gambits: [gambit("stop")] })[0].by).toBeNull();
	});
});
