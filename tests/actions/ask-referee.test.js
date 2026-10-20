import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

let hooks;

vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	postCard: vi.fn(async (...args) => args),
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key)
}));
vi.mock("../../module/actions/exploration.js", () => ({ EXPLORATION_ACTS: { folklore: null, search: null, vantage: null }, takeExplorationAct: vi.fn() }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollRefereeTable: vi.fn() }));
vi.mock("../../module/actions/steeds.js", () => ({ gallop: vi.fn() }));
vi.mock("../../module/actions/wilderness.js", () => ({ wildernessRoll: vi.fn() }));

const { askReferee, askable, doFromRules, registerAskReferee } = await import("../../module/actions/ask-referee.js");
const { postCard } = await import("../../module/chat/cards.js");
const { takeExplorationAct } = await import("../../module/actions/exploration.js");
const { wildernessRoll } = await import("../../module/actions/wilderness.js");

const realm = { id: "s1" };

beforeEach(() => {
	hooks = {};
	globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; } };
	globalThis.canvas = { scene: realm };
	globalThis.CONFIG = { queries: {} };
	globalThis.game = { user: { isGM: false, name: "Ana", character: { name: "Tal" } }, scenes: { get: (id) => (id === "s1" ? realm : null) } };
	globalThis.ui = { notifications: { warn: vi.fn() } };
});

afterEach(() => {
	for (const key of ["Hooks", "canvas", "CONFIG", "game", "ui"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("asking the Referee", () => {
	it("lets a player ask for exploring, a gallop or the Wilderness Roll, and nothing else", () => {
		expect(askable("act", "search")).toBe(true);
		expect(askable("roll", "wilderness")).toBe(true);
		expect(askable("roll", "weather")).toBe(false);
		expect(askable("hardship", "night")).toBe(false);
	});

	it("whispers the Referee a card naming who asks, with the button that does it", async () => {
		await askReferee("act", "search", "Search the Hex");
		const [actor, template, context, options] = postCard.mock.calls[0];
		expect(actor).toBeNull();
		expect(template).toBe("note");
		expect(context.action).toMatchObject({ data: "ask-referee", label: "Search the Hex" });
		expect(context.text).toContain("\"name\":\"Tal\"");
		expect(options).toMatchObject({ mode: "gm", flags: { [SYSTEM_ID]: { askReferee: { kind: "act", key: "search", scene: "s1" } } } });
		expect(await askReferee("roll", "weather", "")).toBeNull();
	});

	it("does it where it was asked, from the Referee's card only", async () => {
		registerAskReferee();
		let clicked;
		const row = { querySelector: () => null, remove: vi.fn() };
		const asked = { closest: () => row, remove: vi.fn() };
		const html = { querySelector: () => ({}), querySelectorAll: () => [asked], addEventListener: (_type, fn) => { clicked = fn; } };
		const message = {
			isOwner: true,
			flags: { [SYSTEM_ID]: { askReferee: { kind: "roll", key: "wilderness", scene: "s1" } } },
			setFlag: vi.fn(async (scope, key, value) => {
				message.flags[scope][key] = value;
			})
		};
		hooks.renderChatMessageHTML(message, html);
		// The player who asked sees the card without the Referee's button.
		expect(clicked).toBeUndefined();
		expect(asked.remove).toHaveBeenCalled();
		expect(row.remove).toHaveBeenCalled();

		game.user.isGM = true;
		hooks.renderChatMessageHTML(message, html);
		wildernessRoll.mockResolvedValueOnce({});
		await clicked({ target: { closest: () => asked }, preventDefault() {} });
		expect(wildernessRoll).toHaveBeenCalledWith({ scene: realm });
		// Done once: pressed again, nothing more is rolled.
		await clicked({ target: { closest: () => asked }, preventDefault() {} });
		expect(wildernessRoll).toHaveBeenCalledTimes(1);
	});

	it("does nothing for a player pressing the panel's own buttons", () => {
		expect(doFromRules("act", "search")).toBeNull();
		game.user.isGM = true;
		doFromRules("act", "search");
		expect(takeExplorationAct).toHaveBeenCalledWith("search", { scene: realm });
	});
});
