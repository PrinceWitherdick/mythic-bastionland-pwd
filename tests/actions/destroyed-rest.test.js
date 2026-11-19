import { beforeEach, describe, expect, it, vi } from "vitest";

// What comes back to a ship, structure or creature that counts as one once it's
// destroyed at 0GD (p11): a day of repairs, asked about first, and no short rest.
vi.mock("../../module/apps/ui.js", () => ({ confirmDialog: vi.fn(async () => true), inputDialog: vi.fn() }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => ({})), registerCardButtons: vi.fn(), t: (key) => key, warn: vi.fn() }));
vi.mock("../../module/actions/actor-updates.js", () => import("../mocks/actor-updates.js"));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: () => ({}) }));
vi.mock("../../module/actions/saves.js", () => ({ acceptAfterTelling: vi.fn() }));
vi.mock("../../module/actions/time.js", () => ({ advancePhase: vi.fn(async () => null), chooseCompany: vi.fn(async () => null) }));
vi.mock("../../module/actions/ask-referee.js", () => ({ askReferee: vi.fn(async () => null) }));
vi.mock("../../module/actions/damage.js", () => ({ takeDamage: vi.fn() }));
vi.mock("../../module/book-art/goods-folders.js", () => ({ GOODS_PACKS: {} }));

const { confirmDialog } = await import("../../module/apps/ui.js");
const { postCard, warn } = await import("../../module/chat/cards.js");
const { acceptRestAfterCombat, restAfterCombat } = await import("../../module/actions/recovery.js");
const { repair } = await import("../../module/actions/structures.js");

const fighter = (name, system = {}) => ({
	name,
	type: "npc",
	items: { contents: [] },
	system: { guard: { value: 0, max: 6 }, fatigued: false, exposed: false, ...system },
	update: vi.fn(async () => {})
});

beforeEach(() => {
	vi.clearAllMocks();
	globalThis.game = { users: { activeGM: { isSelf: true } }, user: { isGM: true } };
	globalThis.foundry = { utils: { escapeHTML: (text) => text } };
});

describe("restAfterCombat", () => {
	it("gives no short rest to a creature destroyed at 0GD, whose GD comes back by repair (p11)", async () => {
		const colossus = fighter("Colossus", { structure: true, destroyed: true });
		const boar = fighter("Boar");
		const rested = await restAfterCombat({ started: true, combatants: [{ actor: colossus }, { actor: boar }] });
		expect(rested).toEqual([boar]);
		expect(colossus.update).not.toHaveBeenCalled();
	});

	it("offers the rest on a card for the Referee to accept, with no window and nothing restored yet", async () => {
		const boar = { ...fighter("Boar", { fatigued: true }), uuid: "Actor.boar" };
		expect(await restAfterCombat({ started: true, combatants: [{ actor: boar }] })).toEqual([boar]);
		expect(confirmDialog).not.toHaveBeenCalled();
		expect(boar.update).not.toHaveBeenCalled();
		const [, kind, context, options] = postCard.mock.calls[0];
		expect(kind).toBe("note");
		expect(context.action).toMatchObject({ data: "rest-after-combat", label: "sheet.accept" });
		expect(options.mode).toBe("gm");
		expect(Object.values(options.flags)[0]).toEqual({ restAfterCombat: ["Actor.boar"] });
	});

	it("rests whoever of them still needs it once accepted, and says so when nobody does", async () => {
		const boar = { ...fighter("Boar", { fatigued: true }), uuid: "Actor.boar" };
		const fresh = { ...fighter("Fresh", { guard: { value: 6, max: 6 } }), uuid: "Actor.fresh" };
		const dead = { ...fighter("Dead", { slain: true }), uuid: "Actor.dead" };
		const all = { "Actor.boar": boar, "Actor.fresh": fresh, "Actor.dead": dead };
		globalThis.fromUuidSync = (uuid) => all[uuid] ?? null;
		expect(await acceptRestAfterCombat(["Actor.boar", "Actor.fresh", "Actor.dead", "Actor.gone"])).toEqual([boar]);
		expect(postCard).toHaveBeenCalledOnce();
		expect(await acceptRestAfterCombat(["Actor.fresh", "Actor.dead"])).toBeNull();
		expect(warn).toHaveBeenCalledWith("recovery.afterCombatNobody");
		delete globalThis.fromUuidSync;
	});

	it("passes over a Knight sworn to a quest whose only lack is GD, which the oath holds back (p94)", async () => {
		const oath = { type: "ability", system: { oath: true, inEffect: true } };
		const sworn = { ...fighter("Sworn Knight"), items: { contents: [oath] } };
		const tired = { ...fighter("Tired Knight", { fatigued: true }), items: { contents: [oath] } };
		expect(await restAfterCombat({ started: true, combatants: [{ actor: sworn }] })).toBeNull();
		expect(await restAfterCombat({ started: true, combatants: [{ actor: sworn }, { actor: tired }] })).toEqual([tired]);
	});
});

describe("repair", () => {
	const ship = (value) => ({ name: "Longship", system: { guard: { value, max: 7 } }, update: vi.fn(async () => {}) });

	it("asks first about one destroyed at 0GD, and leaves it be if told not to", async () => {
		const wreck = ship(0);
		confirmDialog.mockResolvedValueOnce(false);
		expect(await repair(wreck)).toBe(false);
		expect(wreck.update).not.toHaveBeenCalled();
		expect(await repair(wreck)).toBe(true);
		expect(wreck.update).toHaveBeenCalledWith({ "system.guard.value": 7 });
	});

	it("repairs one still standing without asking", async () => {
		const hulled = ship(3);
		expect(await repair(hulled)).toBe(true);
		expect(confirmDialog).not.toHaveBeenCalled();
	});
});
