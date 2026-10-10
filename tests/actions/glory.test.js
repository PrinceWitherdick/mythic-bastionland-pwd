import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(), t: (key) => key }));
vi.mock("../../module/actions/calendar.js", () => ({ calendarLabel: () => "", getCalendar: () => ({}) }));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: () => ({}) }));
vi.mock("../../module/actions/time.js", () => ({ chooseCompany: vi.fn() }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineRank: vi.fn(async () => null) }));

const { adjustGlory } = await import("../../module/actions/glory.js");
const { timelineRank } = await import("../../module/actions/timeline-events.js");

const knight = (glory) => ({ system: { glory, gainsGlory: true }, update: vi.fn(async () => {}) });

beforeEach(() => vi.mocked(timelineRank).mockClear());

describe("adjustGlory", () => {
	it("writes a Rank reached on the Timeline, but not one fallen to", async () => {
		await adjustGlory(knight(2), 1);
		expect(timelineRank).toHaveBeenCalledTimes(1);
		vi.mocked(timelineRank).mockClear();
		await adjustGlory(knight(3), -1);
		expect(timelineRank).not.toHaveBeenCalled();
	});
});
