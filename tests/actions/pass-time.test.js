import { beforeEach, describe, expect, it, vi } from "vitest";

/** passTime runs once the calendar has moved on: what the turn brings is dated the Season that ended, beside the turn's own row. */

// Each actor written on its own, so a test reads what each was given.
vi.mock("../../module/actions/actor-updates.js", () => import("../mocks/actor-updates.js"));
vi.mock("../../module/apps/ui.js", () => ({ chooseDialog: vi.fn(), inputDialog: vi.fn() }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null, mythEntry: () => null }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => null), t: (key) => key }));
vi.mock("../../module/actions/calendar.js", () => ({ calendarLabel: () => "", getCalendar: () => ({ age: 1, year: 1, season: "winter" }), setCalendar: vi.fn() }));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: () => ({}) }));
vi.mock("../../module/actions/glory.js", () => ({ adjustGlory: vi.fn(), gloryLines: () => [], recordRankReached: vi.fn(async () => null) }));
vi.mock("../../module/actions/scars.js", () => ({ settleScars: vi.fn(async (actor, items, guardMax) => ({ rolls: [], lines: items.map(() => "settled"), guardMax })) }));
vi.mock("../../module/actions/squires.js", () => ({ knightSquire: vi.fn() }));
vi.mock("../../module/actions/succession.js", () => ({ chooseSuccessor: vi.fn(), heirOf: () => null }));
vi.mock("../../module/actions/fallen.js", () => ({ announceFallenKnight: vi.fn(async () => null) }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineAged: vi.fn(), timelineSeasonTurn: vi.fn() }));

const { passTime } = await import("../../module/actions/time.js");
const { recordRankReached } = await import("../../module/actions/glory.js");
const { settleScars } = await import("../../module/actions/scars.js");
const { announceFallenKnight } = await import("../../module/actions/fallen.js");
const { chooseSuccessor } = await import("../../module/actions/succession.js");
const { knightSquire } = await import("../../module/actions/squires.js");
const { adjustGlory } = await import("../../module/actions/glory.js");

const virtue = { value: 1, max: 10 };

/** A Knight one Glory short of a new Rank, with a Scar whose GD waits on the next Season. */
const knight = () => ({
	id: "k1",
	name: "Sir a",
	items: [{ type: "scar", system: { roll: 10, resolved: false } }],
	system: { virtues: { vig: virtue, cla: virtue, spi: virtue }, glory: 2, gainsGlory: true, age: "young", guard: { max: 6 } },
	update: vi.fn(async () => {})
});

beforeEach(() => vi.clearAllMocks());

describe("passTime", () => {
	it("dates the Scars it settles and the Rank it reaches in the Season that ended", async () => {
		const actor = knight();
		await passTime([{ actor, pursuit: null }], { newAge: true, before: { age: 1, year: 1, season: "harvest" } });
		const [, due, , options] = vi.mocked(settleScars).mock.calls[0];
		expect(due).toHaveLength(1);
		expect(options).toEqual({ when: "1-harvest" });
		expect(vi.mocked(recordRankReached).mock.calls[0][2]).toEqual({ when: "1-harvest" });
	});

	it("lets an Old Knight taken to VIG 0 die peacefully: Slain, with their fate written (p17)", async () => {
		const actor = knight();
		actor.type = "knight";
		actor.system.age = "old";
		actor.system.fate = "";
		actor.system.virtues = { vig: { value: 3, max: 3 }, cla: virtue, spi: virtue };
		globalThis.Roll = class {
			async evaluate() {
				this.total = 5;
				return this;
			}
		};
		const { entries } = await passTime([{ actor, pursuit: null }], { newAge: true, before: { age: 1, year: 1, season: "winter" } });
		expect(actor.update).toHaveBeenCalledWith(expect.objectContaining({ "system.virtues.vig.max": 0, "system.slain": true, "system.fate": "time.fateOldAge" }), {});
		expect(entries[0].lines).toContain("time.diesPeacefully");
		expect(announceFallenKnight).toHaveBeenCalledWith(actor, "slain");
	});

	it("keeps a fate already written", async () => {
		const actor = knight();
		actor.type = "knight";
		actor.system.age = "old";
		actor.system.fate = "Lost at sea";
		actor.system.virtues = { vig: { value: 2, max: 2 }, cla: virtue, spi: virtue };
		await passTime([{ actor, pursuit: null }], { newAge: true, before: { age: 1, year: 1, season: "winter" } });
		expect(actor.update.mock.calls[0][0]).not.toHaveProperty("system.fate");
	});
});

describe("Legacy to a Squire", () => {
	/** A Knight with 8 Glory choosing Legacy, so 4 passes on, and the Squire they name. */
	const legacy = async (knighted) => {
		const actor = knight();
		actor.items = [];
		actor.system.glory = 8;
		actor.system.gainsGlory = false;
		const heir = { name: "Ned", isOwner: true, system: { isSquire: true } };
		vi.mocked(chooseSuccessor).mockResolvedValue(heir);
		vi.mocked(knightSquire).mockResolvedValue(knighted);
		vi.mocked(adjustGlory).mockResolvedValue(["glory"]);
		const { entries } = await passTime([{ actor, pursuit: "legacy" }], { newAge: true, before: { age: 1, year: 1, season: "winter" } });
		return { heir, lines: entries[0].lines };
	};

	it("offers Knighting first, saying why, as a Squire gains no Glory (p7)", async () => {
		const { heir, lines } = await legacy({});
		expect(knightSquire).toHaveBeenCalledWith(heir, { note: "successor.legacySquire" });
		expect(adjustGlory).toHaveBeenCalledWith(heir, 4);
		expect(lines).toContain("successor.knighted");
	});

	it("says the Glory is lost when they stay a Squire", async () => {
		const { lines } = await legacy(null);
		expect(adjustGlory).not.toHaveBeenCalled();
		expect(lines).toContain("successor.legacyLost");
	});
});
