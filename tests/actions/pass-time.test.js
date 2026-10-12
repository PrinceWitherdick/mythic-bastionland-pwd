import { beforeEach, describe, expect, it, vi } from "vitest";

/** passTime runs once the calendar has moved on: what the turn brings is dated the Season that ended, beside the turn's own row. */

vi.mock("../../module/apps/ui.js", () => ({ chooseDialog: vi.fn(), inputDialog: vi.fn() }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null, mythEntry: () => null }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => null), t: (key) => key }));
vi.mock("../../module/actions/calendar.js", () => ({ calendarLabel: () => "", getCalendar: () => ({ age: 1, year: 1, season: "winter" }), setCalendar: vi.fn() }));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: () => ({}) }));
vi.mock("../../module/actions/glory.js", () => ({ adjustGlory: vi.fn(), gloryLines: () => [], recordRankReached: vi.fn(async () => null) }));
vi.mock("../../module/actions/scars.js", () => ({ settleScars: vi.fn(async (actor, items, guardMax) => ({ rolls: [], lines: items.map(() => "settled"), guardMax })) }));
vi.mock("../../module/actions/squires.js", () => ({ knightSquire: vi.fn() }));
vi.mock("../../module/actions/succession.js", () => ({ chooseSuccessor: vi.fn(), heirOf: () => null }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineAged: vi.fn(), timelineSeasonTurn: vi.fn() }));

const { passTime } = await import("../../module/actions/time.js");
const { recordRankReached } = await import("../../module/actions/glory.js");
const { settleScars } = await import("../../module/actions/scars.js");

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
});
