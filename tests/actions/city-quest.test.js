import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/apps/ui.js", () => ({ confirmDialog: vi.fn() }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => ({ cityQuest: { omens: Array.from({ length: 24 }, (_, index) => `Omen text ${index + 1}`) } }) }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => {}), t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));

const { cityOmensSeen, cityQuestSetWorthy, resetCityQuest, rollCityOmen, setCityQuestWorthy } = await import("../../module/actions/city-quest.js");
const { confirmDialog } = await import("../../module/apps/ui.js");
const { postCard } = await import("../../module/chat/cards.js");

/** What the world setting holds, and the d12 the next Roll shows. */
let kept;
let d12;

beforeEach(() => {
	vi.clearAllMocks();
	kept = { seen: [] };
	d12 = 5;
	globalThis.game = {
		user: { isGM: true },
		settings: {
			get: () => kept,
			set: vi.fn(async (_system, _key, value) => {
				kept = value;
			})
		}
	};
	globalThis.ui = { notifications: { info: vi.fn() } };
	globalThis.Roll = class {
		async evaluate() {
			this.total = d12;
			return this;
		}
	};
});

describe("rolling an Omen of the City (p172)", () => {
	it("adds the Omens already met to the d12, keeps it, and whispers its text to the Referees", async () => {
		kept = { seen: [3, 6] };
		expect(await rollCityOmen()).toEqual({ omen: 7, ends: false });
		expect(kept.seen).toEqual([3, 6, 7]);
		const [[, kind, context, options]] = vi.mocked(postCard).mock.calls;
		expect(kind).toBe("omen");
		expect(context.text).toBe("Omen text 7");
		expect(context.hint).toBeNull();
		expect(options.mode).toBe("gm");
	});

	it("takes the next Omen down for one already met", async () => {
		kept = { seen: [3, 6] };
		d12 = 1;
		// 1 + 2 met is 3, already met, so 4.
		expect(await rollCityOmen()).toEqual({ omen: 4, ends: false });
	});

	it("says when the Omen ends the Quest", async () => {
		kept = { seen: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
		d12 = 6;
		// 6 + 12 met is 18, which ends the Quest.
		expect(await rollCityOmen()).toEqual({ omen: 18, ends: true });
		expect(vi.mocked(postCard).mock.calls[0][2].hint).toBe("cityQuest.ends");
	});

	it("rolls nothing once the Quest has ended, or for a player", async () => {
		kept = { seen: [19] };
		expect(await rollCityOmen()).toBeNull();
		expect(ui.notifications.info).toHaveBeenCalledWith("cityQuest.over");
		game.user.isGM = false;
		kept = { seen: [] };
		expect(await rollCityOmen()).toBeNull();
		expect(game.settings.set).not.toHaveBeenCalled();
	});

	it("reads only Omens of the list from the setting, whatever else it holds", () => {
		kept = { seen: [2, 0, 25, "4", 7.5, 9] };
		expect(cityOmensSeen()).toEqual([2, 9]);
		kept = null;
		expect(cityOmensSeen()).toEqual([]);
	});
});

describe("starting the City Quest over", () => {
	it("forgets every Omen met once the Referee agrees, and nothing if they don't", async () => {
		kept = { seen: [4, 9] };
		vi.mocked(confirmDialog).mockResolvedValueOnce(false);
		expect(await resetCityQuest()).toBe(false);
		expect(kept.seen).toEqual([4, 9]);
		vi.mocked(confirmDialog).mockResolvedValueOnce(true);
		expect(await resetCityQuest()).toBe(true);
		expect(kept.seen).toEqual([]);
	});
});

describe("the Referee's say on whether the Company is worthy (p172)", () => {
	it("leaves it to the Knights until the Referee says otherwise, and keeps what they say", async () => {
		kept = null;
		expect(cityQuestSetWorthy()).toBe("auto");
		expect(await setCityQuestWorthy("worthy")).toBe(true);
		expect(game.settings.set).toHaveBeenCalledWith(expect.any(String), "cityQuestWorthy", "worthy");
		expect(cityQuestSetWorthy()).toBe("worthy");
		// The same again writes nothing; anything unknown is Automatic.
		expect(await setCityQuestWorthy("worthy")).toBe(false);
		expect(await setCityQuestWorthy("nonsense")).toBe(true);
		expect(cityQuestSetWorthy()).toBe("auto");
	});

	it("is the Referee's alone to set", async () => {
		game.user.isGM = false;
		expect(await setCityQuestWorthy("unworthy")).toBe(false);
		expect(game.settings.set).not.toHaveBeenCalled();
	});
});
