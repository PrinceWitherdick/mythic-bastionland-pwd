import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/actions/realm.js", () => ({ newRealm: vi.fn() }));
vi.mock("../../module/book-art/importer.js", () => ({ importBookArt: vi.fn() }));
vi.mock("../../module/rulebook/BookReader.js", () => ({ openReader: vi.fn() }));
vi.mock("../../module/rulebook/store.js", () => ({ hasRulebook: vi.fn(() => false), keepRulebook: vi.fn(async () => false) }));

const { newRealm } = await import("../../module/actions/realm.js");
const { hasRulebook } = await import("../../module/rulebook/store.js");
const { WELCOME_CARDS, postWelcomeCards, registerWelcomeCards } = await import("../../module/chat/welcome-cards.js");

let created;
let hooks;

beforeEach(() => {
	created = [];
	hooks = {};
	globalThis.game = {
		user: { isGM: true },
		system: { title: "Mythic Bastionland" },
		i18n: { localize: (key) => key }
	};
	globalThis.foundry = { applications: { handlebars: { renderTemplate: vi.fn(async (_path, data) => `<button data-welcome-card="${data.card}">${data.label}</button>`) } } };
	globalThis.ChatMessage = {
		implementation: {
			applyMode: (data, mode) => { data.mode = mode; },
			create: vi.fn(async (data) => created.push(data))
		}
	};
	globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; } };
});

afterEach(() => {
	for (const key of ["game", "foundry", "ChatMessage", "Hooks"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("postWelcomeCards", () => {
	it("whispers the GMs an Import PDF card, then a Create a Realm card", async () => {
		await postWelcomeCards(() => true);
		expect(created.map((data) => data.flags[SYSTEM_ID].welcomeCard)).toEqual(WELCOME_CARDS);
		expect(created.map((data) => data.mode)).toEqual(["gm", "gm"]);
		expect(created[0].speaker).toEqual({ alias: "Mythic Bastionland" });
	});

	it("doesn't ask for the PDF when the world already has its rulebook", async () => {
		hasRulebook.mockReturnValueOnce(true);
		await postWelcomeCards(() => true);
		expect(created.map((data) => data.flags[SYSTEM_ID].welcomeCard)).toEqual(["realm"]);
	});

	it("posts nothing to a world already in play", async () => {
		await postWelcomeCards(() => false);
		expect(created).toEqual([]);
	});
});

describe("the cards' buttons", () => {
	/** A rendered card, and a click on its button. */
	function renderCard(card) {
		registerWelcomeCards();
		const button = { dataset: { welcomeCard: card }, disabled: false, closest: () => button };
		let listener = null;
		const html = { querySelector: () => button, addEventListener: (_type, fn) => { listener = fn; } };
		hooks.renderChatMessageHTML({}, html);
		return { click: () => listener?.({ target: button, preventDefault() {} }) };
	}

	it("opens New Realm for a GM", () => {
		renderCard("realm").click();
		expect(newRealm).toHaveBeenCalledOnce();
	});

	it("does nothing for a player", () => {
		game.user.isGM = false;
		renderCard("realm").click();
		expect(newRealm).not.toHaveBeenCalled();
	});
});
