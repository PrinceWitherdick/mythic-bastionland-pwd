import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/actions/realm.js", () => ({ newRealm: vi.fn() }));
vi.mock("../../module/book-art/importer.js", () => ({ importBookArt: vi.fn() }));
vi.mock("../../module/rulebook/BookReader.js", () => ({ openReader: vi.fn() }));
vi.mock("../../module/rulebook/store.js", () => ({ hasRulebook: vi.fn(() => false), keepRulebook: vi.fn(async () => false) }));

const { newRealm } = await import("../../module/actions/realm.js");
const { hasRulebook } = await import("../../module/rulebook/store.js");
const { RECOMMENDED_MODULES, WELCOME_CARDS, postFxMasterCard, postWelcomeCards, registerWelcomeCards } = await import("../../module/chat/welcome-cards.js");

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
	it("whispers the GMs an Import PDF card, a Create a Realm card, then a Recommended Modules card", async () => {
		await postWelcomeCards(() => true);
		expect(created.map((data) => data.flags[SYSTEM_ID].welcomeCard)).toEqual(WELCOME_CARDS);
		expect(WELCOME_CARDS).toEqual(["import", "realm", "modules"]);
		expect(created.map((data) => data.mode)).toEqual(["gm", "gm", "gm"]);
		expect(created[0].speaker).toEqual({ alias: "Mythic Bastionland" });
	});

	it("doesn't ask for the PDF when the world already has its rulebook", async () => {
		hasRulebook.mockReturnValueOnce(true);
		await postWelcomeCards(() => true);
		expect(created.map((data) => data.flags[SYSTEM_ID].welcomeCard)).toEqual(["realm", "modules"]);
	});

	it("lists every recommended module on the modules card, linked to its package page", async () => {
		await postWelcomeCards(() => true);
		const context = foundry.applications.handlebars.renderTemplate.mock.calls.find(([, data]) => data.card === "modules")[1];
		expect(context.modules.map((module) => module.url)).toEqual(RECOMMENDED_MODULES.map((module) => module.url));
		expect(context.modules[0].name).toBe("bastionland.welcome.chat.modules.list.diceSoNice.name");
	});

	it("leaves the modules card out when every recommended module is on", async () => {
		const on = new Set(["dice-so-nice", "sequencer", "JB2A_DnD5e", "soundfxlibrary", "fxmaster", "vtta-tokenizer"]);
		game.modules = { get: (id) => (on.has(id) ? { active: true } : undefined) };
		await postWelcomeCards(() => true);
		expect(created.map((data) => data.flags[SYSTEM_ID].welcomeCard)).toEqual(["import", "realm"]);
	});

	it("still posts it while Sequencer is on without JB2A", async () => {
		const on = new Set(["dice-so-nice", "sequencer", "soundfxlibrary", "fxmaster"]);
		game.modules = { get: (id) => (on.has(id) ? { active: true } : undefined) };
		await postWelcomeCards(() => true);
		expect(created.map((data) => data.flags[SYSTEM_ID].welcomeCard)).toContain("modules");
	});

	it("posts nothing to a world already in play", async () => {
		await postWelcomeCards(() => false);
		expect(created).toEqual([]);
	});
});

describe("postFxMasterCard", () => {
	it("whispers a world in play one card about the weather on the map, with the modules card's button", async () => {
		await postFxMasterCard(() => false);
		expect(created).toHaveLength(1);
		expect(created[0]).toMatchObject({ mode: "gm", flags: { [SYSTEM_ID]: { welcomeCard: "fxmaster" } } });
		const [[, context]] = foundry.applications.handlebars.renderTemplate.mock.calls;
		expect(context.card).toBe("modules");
		expect(context.modules.map((module) => module.url)).toEqual(["https://foundryvtt.com/packages/fxmaster"]);
		expect(context.more).toHaveLength(2);
	});

	it("says nothing where FXMaster, or FXMaster+, is on already", async () => {
		for (const id of ["fxmaster", "fxmaster-plus"]) {
			game.modules = { get: (candidate) => (candidate === id ? { active: true } : undefined) };
			await postFxMasterCard(() => false);
		}
		expect(created).toEqual([]);
	});

	it("says nothing to a new world, whose modules card names FXMaster already", async () => {
		await postFxMasterCard(() => true);
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

	it("opens Manage Modules for a GM", () => {
		const render = vi.fn();
		foundry.applications.sidebar = { apps: { ModuleManagement: class { render = render; } } };
		renderCard("modules").click();
		expect(render).toHaveBeenCalledWith({ force: true });
	});

	it("does nothing for a player", () => {
		game.user.isGM = false;
		renderCard("realm").click();
		expect(newRealm).not.toHaveBeenCalled();
	});
});
