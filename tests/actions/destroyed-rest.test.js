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
const { restAfterCombat } = await import("../../module/actions/recovery.js");
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
