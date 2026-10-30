import { beforeEach, describe, expect, it, vi } from "vitest";

/** The game actions that write the new automatic Timeline rows beside what they do. */

vi.mock("../../module/apps/ui.js", () => ({ chooseDialog: vi.fn(), confirmDialog: vi.fn(), inputDialog: vi.fn() }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => null), t: (key) => key }));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ age: 1, year: 1, season: "spring", day: 1, phase: "morning" }) }));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: () => ({}) }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollSpark: vi.fn() }));
vi.mock("../../module/actions/court.js", () => ({ knightsBesidesRuler: () => [] }));
vi.mock("../../module/actions/succession.js", () => ({ heirOf: () => null }));
vi.mock("../../module/actions/knights.js", () => ({ worldKnights: () => [] }));
vi.mock("../../module/actions/timeline-events.js", () => ({
	timelineCrisisResolved: vi.fn(),
	timelineCrisisRoll: vi.fn(),
	timelineDrama: vi.fn(),
	timelineNewRuler: vi.fn(),
	timelineScar: vi.fn(),
	timelineScarSettled: vi.fn()
}));

const timeline = await import("../../module/actions/timeline-events.js");
const { dramaInCourt, resolveCrisis } = await import("../../module/actions/dominion.js");
const { patchUp, resolveScar } = await import("../../module/actions/scars.js");

/** The d6s the next rolls give, in order. */
let rolled;

beforeEach(() => {
	vi.clearAllMocks();
	rolled = [];
	globalThis.Roll = class {
		async evaluate() {
			this.total = rolled.shift() ?? 1;
			return this;
		}
	};
	globalThis.foundry = { utils: { isEmpty: (value) => !Object.keys(value ?? {}).length } };
});

const actor = (system) => ({ system, isOwner: true, update: vi.fn(async () => {}) });

describe("a Domain", () => {
	it("writes a Crisis resolved", async () => {
		const domain = actor({ crises: ["famine", "plague"] });
		expect(await resolveCrisis(domain, 1)).toBe("plague");
		expect(timeline.timelineCrisisResolved).toHaveBeenCalledWith(domain, "plague", "domain.crises.plague.name");
	});

	it("writes Drama in Court, with the courtier at its heart and what they hold over the ruler", async () => {
		rolled = [4, 1];
		globalThis.game = { user: { isGM: true } };
		const domain = actor({ court: { c1: { role: "courtier", name: "Wren", leverage: "Letters", note: "", at: 1 } } });
		await dramaInCourt(domain);
		const [[written, drama]] = vi.mocked(timeline.timelineDrama).mock.calls;
		expect(written).toBe(domain);
		expect(drama.who).toBe("timeline.auto.courtier");
		expect(drama.leverage).toBe("domain.court.holdsLeverage");
		delete globalThis.game;
	});
});

describe("a Scar", () => {
	it("writes one settled from the sheet, which revenge goes through too", async () => {
		const knight = actor({ guard: { max: 6 }, mortalWound: false });
		const item = { type: "scar", name: "Humiliation", system: { roll: 12, resolved: false, foeName: "Hugh" }, update: vi.fn(async () => {}) };
		await resolveScar(knight, item);
		expect(timeline.timelineScarSettled).toHaveBeenCalledWith(knight, item, expect.any(String), undefined);
	});

	it("writes a Gouge settled by being patched up, as from the sheet", async () => {
		const knight = { ...actor({ guard: { max: 6 }, mortalWound: false }), name: "Sir a", items: [] };
		const item = { type: "scar", name: "Gouge", system: { roll: 6, resolved: false }, update: vi.fn(async () => {}) };
		knight.items.push(item);
		await patchUp(knight);
		expect(timeline.timelineScarSettled).toHaveBeenCalledWith(knight, item, expect.any(String), undefined);
	});

	it("writes nothing for a Mortal Wound patched up with no Scar to settle", async () => {
		const knight = { ...actor({ guard: { max: 6 }, mortalWound: true }), name: "Sir a", items: [] };
		await patchUp(knight);
		expect(timeline.timelineScarSettled).not.toHaveBeenCalled();
	});
});
