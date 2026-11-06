import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(), t: (key) => key }));
vi.mock("../../module/actions/calendar.js", () => ({ calendarLabel: () => "", getCalendar: () => ({}) }));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: () => ({}) }));
vi.mock("../../module/actions/time.js", () => ({ chooseCompany: vi.fn() }));
vi.mock("../../module/apps/actor-pick.js", () => ({ chooseOne: vi.fn() }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineRank: vi.fn(async () => null), timelineGloryAwarded: vi.fn(async () => null) }));

const { adjustGlory, awardGloryTo, takeBackGlory } = await import("../../module/actions/glory.js");
const { postCard } = await import("../../module/chat/cards.js");
const { chooseCompany } = await import("../../module/actions/time.js");
const { chooseOne } = await import("../../module/apps/actor-pick.js");
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
		await awardGloryTo("myth");
		// A tournament with no Knight to win it, or its window closed.
		await awardGloryTo("tournament");
		vi.mocked(chooseOne).mockResolvedValueOnce(null);
		game.actors = [{ ...knight(3), id: "k1", name: "Sir Ash", type: "knight" }];
		await awardGloryTo("tournament");
		expect(timelineGloryAwarded).not.toHaveBeenCalled();
	});

	describe("a tournament and a battle (p6)", () => {
		const named = (name, type, glory, system = {}) => ({ ...knight(glory), id: name, name, type, system: { glory, gainsGlory: true, rank: "gallant", ...system } });
		const ash = named("Sir Ash", "knight", 4);
		const tam = named("Tam", "knight", 0, { gainsGlory: false, isSquire: true });
		const fallen = named("Sir Fallen", "knight", 5, { slain: true });
		const rival = named("Sir Rival", "npcKnight", 7);
		const gone = named("Sir Gone", "npcKnight", 7, { slain: true });

		beforeEach(() => {
			vi.mocked(chooseOne).mockReset();
			vi.mocked(chooseCompany).mockReset();
			game.actors = [rival, ash, tam, fallen, gone];
		});

		it("asks a tournament for its one winner, none chosen to start, the Company's living Knights first and the NPC Knights after", async () => {
			vi.mocked(chooseOne).mockImplementationOnce(async (items) => items[1]);
			const { knights } = await awardGloryTo("tournament");
			const [items, ask] = vi.mocked(chooseOne).mock.calls[0];
			expect(items.map(({ name }) => name)).toEqual(["Sir Ash", "Sir Rival"]);
			expect(items[1].detail).toBe("glory.awards.npcKnightDetail");
			expect(ask.unchosen).toBe(true);
			expect(chooseCompany).not.toHaveBeenCalled();
			expect(knights).toEqual([rival]);
			expect(rival.update).toHaveBeenCalledWith({ "system.glory": 8 }, {});
		});

		it("ticks a battle's victors from the Company, and lists the living NPC Knights after them, leaving out Squires", async () => {
			vi.mocked(chooseCompany).mockResolvedValueOnce([{ actor: ash }, { actor: rival }]);
			const { knights } = await awardGloryTo("battle");
			const [options] = vi.mocked(chooseCompany).mock.calls[0];
			expect(options.later).toEqual([rival]);
			expect(options.gainsGlory).toBe(true);
			expect(knights).toEqual([ash, rival]);
		});
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
