import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/apps/ui.js", () => ({ confirmDialog: vi.fn() }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => ({})), t: (key) => key }));
vi.mock("../../module/actions/actor-updates.js", () => import("../mocks/actor-updates.js"));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: () => ({}) }));
vi.mock("../../module/actions/saves.js", () => ({ acceptAfterTelling: vi.fn() }));
vi.mock("../../module/actions/time.js", () => ({ advancePhase: vi.fn(async () => null), chooseCompany: vi.fn(async () => company) }));
vi.mock("../../module/actions/ask-referee.js", () => ({ askReferee: vi.fn(async () => null) }));

const { advancePhase } = await import("../../module/actions/time.js");
const { useRemedy, warnDyingAfterCombat } = await import("../../module/actions/recovery.js");
const { postCard } = await import("../../module/chat/cards.js");
const { askReferee } = await import("../../module/actions/ask-referee.js");

/** Who the Referee ticks as present. */
let company;

const knight = (name) => ({ name, system: { virtues: { vig: { value: 2, max: 12 } } }, update: vi.fn(async () => {}) });
const sustenance = () => ({ name: "Sustenance", system: { remedy: "vig", quantity: { value: 1, max: 0 } }, delete: vi.fn(async () => {}), update: vi.fn() });

beforeEach(() => {
	vi.clearAllMocks();
	company = null;
	globalThis.game = { user: { isGM: true } };
});

describe("useRemedy", () => {
	it("restores the Virtue of all present, then offers the Phase it takes (p9)", async () => {
		const alys = knight("Alys");
		company = [{ actor: alys }];
		const item = sustenance();
		await useRemedy(alys, item);
		expect(alys.update).toHaveBeenCalledWith({ "system.virtues.vig.value": 12 }, {});
		expect(item.delete).toHaveBeenCalled();
		expect(advancePhase).toHaveBeenCalledTimes(1);
		expect(askReferee).not.toHaveBeenCalled();
	});

	it("has a player ask the Referee to move the Phase on", async () => {
		game.user.isGM = false;
		const alys = knight("Alys");
		company = [{ actor: alys }];
		await useRemedy(alys, sustenance());
		expect(advancePhase).not.toHaveBeenCalled();
		expect(askReferee).toHaveBeenCalledWith("roll", "phase", "remedy.passPhase");
	});

	it("spends no Phase when nobody used it", async () => {
		company = [];
		await useRemedy(knight("Alys"), sustenance());
		expect(advancePhase).not.toHaveBeenCalled();
	});
});

describe("warnDyingAfterCombat", () => {
	const actor = (name, system) => ({ name, system });
	const fight = (...actors) => ({ started: true, combatants: actors.map((each) => ({ actor: each })) });

	it("names to the Referee alone everybody the fight left dying (p8)", async () => {
		game.users = { activeGM: { isSelf: true } };
		const hal = actor("Hal", { mortalWound: true });
		const named = await warnDyingAfterCombat(fight(hal, hal, actor("Bandit", { mortalWound: false }), actor("Raiders", { mortalWound: true, scale: "warband" }), actor("Corpse", { slain: true, mortalWound: true })));
		expect(named).toEqual([hal]);
		expect(postCard).toHaveBeenCalledWith(null, "note", expect.objectContaining({ text: "recovery.dyingAfterCombat" }), { mode: "gm" });
	});

	it("says nothing when nobody is dying, on another client, or for a fight never begun", async () => {
		game.users = { activeGM: { isSelf: true } };
		expect(await warnDyingAfterCombat(fight(actor("Bandit", {})))).toEqual([]);
		expect(await warnDyingAfterCombat({ ...fight(actor("Hal", { mortalWound: true })), started: false })).toEqual([]);
		game.users = { activeGM: { isSelf: false } };
		expect(await warnDyingAfterCombat(fight(actor("Hal", { mortalWound: true })))).toEqual([]);
		expect(postCard).not.toHaveBeenCalled();
	});
});
