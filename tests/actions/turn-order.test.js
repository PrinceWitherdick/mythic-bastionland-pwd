import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Whether the world is played alone. */
let solo = false;
vi.mock("../../module/actions/solo.js", () => ({ isSolo: () => solo }));

const { OTHERS_AFTER, PLAYERS_FIRST, placeJoiningCombatant, registerTurnOrder, sideInitiative } = await import("../../module/actions/turn-order.js");

const knight = { hasPlayerOwner: true };
const boar = { hasPlayerOwner: false };

/** A Combatant as preCreateCombatant hands it over: its actor, and the source it may change. */
const joining = (actor) => ({ actor, updateSource: vi.fn() });

describe("sideInitiative", () => {
	it("puts the players' characters ahead of everybody else (p8)", () => {
		expect(sideInitiative(knight)).toBe(PLAYERS_FIRST);
		expect(sideInitiative(boar)).toBe(OTHERS_AFTER);
		expect(PLAYERS_FIRST).toBeGreaterThan(OTHERS_AFTER);
	});

	it("puts the Referee's own Knights first in solo play, and only then", () => {
		const played = { type: "knight", hasPlayerOwner: false };
		expect(sideInitiative(played)).toBe(OTHERS_AFTER);
		solo = true;
		expect(sideInitiative(played)).toBe(PLAYERS_FIRST);
		expect(sideInitiative({ type: "npc", hasPlayerOwner: false })).toBe(OTHERS_AFTER);
		// A Holding's ruler the Referee marked as one of their own Knights waits with the others.
		expect(sideInitiative({ ...played, getFlag: () => false })).toBe(OTHERS_AFTER);
		solo = false;
	});

	it("counts a Combatant with no actor among the others", () => {
		expect(sideInitiative(null)).toBe(OTHERS_AFTER);
	});
});

describe("placeJoiningCombatant", () => {
	it("places a joining Combatant by its side, so nobody rolls", () => {
		const combatant = joining(knight);
		placeJoiningCombatant(combatant, {});
		expect(combatant.updateSource).toHaveBeenCalledWith({ initiative: PLAYERS_FIRST });
		const foe = joining(boar);
		placeJoiningCombatant(foe, { initiative: null });
		expect(foe.updateSource).toHaveBeenCalledWith({ initiative: OTHERS_AFTER });
	});

	it("leaves an initiative already given alone", () => {
		const combatant = joining(boar);
		placeJoiningCombatant(combatant, { initiative: 7 });
		expect(combatant.updateSource).not.toHaveBeenCalled();
	});
});

describe("registerTurnOrder", () => {
	beforeEach(() => {
		globalThis.CONFIG = {
			Combatant: { documentClass: class Combatant { async _preCreate() { return undefined; } } },
			Combat: { documentClass: class Combat {} }
		};
	});

	afterEach(() => {
		delete globalThis.CONFIG;
	});

	it("places a Combatant by its side as it joins", async () => {
		registerTurnOrder();
		const combatant = new CONFIG.Combatant.documentClass();
		Object.defineProperty(combatant, "actor", { value: knight });
		combatant.updateSource = vi.fn();
		await combatant._preCreate({});
		expect(combatant.updateSource).toHaveBeenCalledWith({ initiative: PLAYERS_FIRST });
	});

	it("makes the tracker's Roll Initiative give each side's place, with no dice", async () => {
		registerTurnOrder();
		const combat = new CONFIG.Combat.documentClass();
		const combatants = { a: { id: "a", isOwner: true, actor: knight }, b: { id: "b", isOwner: true, actor: boar }, c: { id: "c", isOwner: false, actor: boar } };
		Object.assign(combat, { turn: 3, combatants: { get: (id) => combatants[id] }, updateEmbeddedDocuments: vi.fn() });
		await combat.rollInitiative(["a", "b", "c"]);
		expect(combat.updateEmbeddedDocuments).toHaveBeenCalledWith("Combatant", [{ _id: "a", initiative: PLAYERS_FIRST }, { _id: "b", initiative: OTHERS_AFTER }], { turnEvents: false });
		await combat.rollInitiative("b", { updateTurn: false });
		expect(combat.updateEmbeddedDocuments).toHaveBeenLastCalledWith("Combatant", [{ _id: "b", initiative: OTHERS_AFTER }], { turnEvents: false, combatTurn: 3 });
	});
});
