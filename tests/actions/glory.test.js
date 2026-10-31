import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(), t: (key) => key }));
vi.mock("../../module/actions/calendar.js", () => ({ calendarLabel: () => "", getCalendar: () => ({}) }));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: () => ({}) }));
vi.mock("../../module/actions/time.js", () => ({ chooseCompany: vi.fn() }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineRank: vi.fn(async () => null), timelineGloryAwarded: vi.fn(async () => null) }));

const { adjustGlory, awardGloryTo, takeBackGlory } = await import("../../module/actions/glory.js");
const { postCard } = await import("../../module/chat/cards.js");
const { chooseCompany } = await import("../../module/actions/time.js");
const { timelineGloryAwarded, timelineRank } = await import("../../module/actions/timeline-events.js");

const knight = (glory) => ({ system: { glory, gainsGlory: true }, update: vi.fn(async () => {}) });

beforeEach(() => {
	vi.mocked(timelineRank).mockClear();
	vi.mocked(timelineGloryAwarded).mockClear();
	globalThis.game = { user: { isGM: true } };
	globalThis.ui = { notifications: { info: vi.fn() } };
});

describe("adjustGlory", () => {
	it("writes a Rank reached on the Timeline, but not one fallen to", async () => {
		await adjustGlory(knight(2), 1);
		expect(timelineRank).toHaveBeenCalledTimes(1);
		vi.mocked(timelineRank).mockClear();
		await adjustGlory(knight(3), -1);
		expect(timelineRank).not.toHaveBeenCalled();
	});
});

describe("awardGloryTo", () => {
	it("writes the award on the Timeline with each Knight's Glory lines", async () => {
		const actor = knight(4);
		vi.mocked(chooseCompany).mockResolvedValueOnce([{ actor }]);
		await awardGloryTo("battle");
		expect(timelineGloryAwarded).toHaveBeenCalledWith("battle", [{ actor, lines: ["time.glory"] }]);
	});

	it("writes nothing when nobody is given it", async () => {
		vi.mocked(chooseCompany).mockResolvedValueOnce(null);
		await awardGloryTo("battle");
		vi.mocked(chooseCompany).mockResolvedValueOnce([]);
		await awardGloryTo("tournament");
		expect(timelineGloryAwarded).not.toHaveBeenCalled();
	});
});

describe("takeBackGlory", () => {
	beforeEach(() => {
		vi.mocked(chooseCompany).mockReset();
		vi.mocked(postCard).mockClear();
	});

	it("asks with only those given it, ticked, and takes 1 Glory from each left ticked", async () => {
		const kept = knight(5);
		const lost = knight(5);
		vi.mocked(chooseCompany).mockResolvedValueOnce([{ actor: lost }]);
		expect(await takeBackGlory("myth", [kept, lost])).toEqual([lost]);
		expect(vi.mocked(chooseCompany).mock.calls[0][0]).toMatchObject({ present: [kept, lost], onlyGiven: true, knightsOnly: true });
		expect(lost.update).toHaveBeenCalledWith({ "system.glory": 4 }, {});
		expect(kept.update).not.toHaveBeenCalled();
		expect(postCard).toHaveBeenCalledTimes(1);
	});

	it("takes nothing back when the question is closed", async () => {
		const actor = knight(5);
		vi.mocked(chooseCompany).mockResolvedValueOnce(null);
		expect(await takeBackGlory("myth", [actor])).toEqual([]);
		expect(actor.update).not.toHaveBeenCalled();
		expect(postCard).not.toHaveBeenCalled();
	});

	it("asks nothing with nobody who can lose Glory, or of a player", async () => {
		expect(await takeBackGlory("myth", [{ system: { glory: 3, gainsGlory: false } }])).toEqual([]);
		globalThis.game.user.isGM = false;
		expect(await takeBackGlory("myth", [knight(3)])).toEqual([]);
		expect(chooseCompany).not.toHaveBeenCalled();
	});
});
