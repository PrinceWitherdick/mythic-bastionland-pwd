import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let hooks;
let settings;
let docs;
let unloadListeners;
let registerSheetRestore;
let restoreOpenSheets;
let registerRestorableWindow;

const fire = (hook, sheet) => (hooks[hook] ?? []).forEach((callback) => callback(sheet));
const unload = () => unloadListeners.forEach((listener) => listener());
const savedHere = () => settings.openSheets["world-a"];

/**
 * A sheet over a world document, positioned the way ApplicationV2 reports it.
 * @param {string} uuid
 */
function fakeSheet(uuid, { position = { left: 100, top: 50, width: 860, height: 920, zIndex: 101 }, pack = null, canSee = true } = {}) {
	const sheet = { position, minimized: false, render: vi.fn(async () => sheet), minimize: vi.fn() };
	sheet.document = { uuid, pack, sheet, testUserPermission: () => canSee };
	docs[uuid] = sheet.document;
	return sheet;
}

beforeEach(async () => {
	vi.useFakeTimers();
	hooks = {};
	settings = {};
	docs = {};
	unloadListeners = [];

	globalThis.Hooks = { on: (name, callback) => (hooks[name] ??= []).push(callback) };
	globalThis.window = {
		addEventListener: (type, listener) => {
			if (type === "beforeunload") unloadListeners.push(listener);
		}
	};
	globalThis.fromUuid = async (uuid) => docs[uuid] ?? null;
	globalThis.game = {
		world: { id: "world-a" },
		user: {},
		settings: {
			register: (_namespace, key, config) => { settings[key] = config.default; },
			get: (_namespace, key) => settings[key],
			set: async (_namespace, key, value) => { settings[key] = value; }
		}
	};

	// The list of open sheets lives in the module, so each test gets a fresh copy.
	vi.resetModules();
	({ registerRestorableWindow, registerSheetRestore, restoreOpenSheets } = await import("../../module/sheets/restore-open-sheets.js"));
	registerSheetRestore();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("saving open sheets", () => {
	it("saves where each Knight, item and journal sheet is, under this world", () => {
		fire("renderActorSheetV2", fakeSheet("Actor.knight"));
		fire("renderItemSheetV2", fakeSheet("Actor.knight.Item.sword", { position: { left: 5, top: 6, width: 480, height: 520, zIndex: 102 } }));
		fire("renderJournalEntrySheet", fakeSheet("JournalEntry.notes"));
		vi.advanceTimersByTime(500);

		expect(savedHere()).toEqual({
			"Actor.knight": { left: 100, top: 50, width: 860, height: 920, zIndex: 101 },
			"Actor.knight.Item.sword": { left: 5, top: 6, width: 480, height: 520, zIndex: 102 },
			"JournalEntry.notes": { left: 100, top: 50, width: 860, height: 920, zIndex: 101 }
		});
	});

	it("saves where a Site's map is, though its sheet isn't a JournalEntrySheet", () => {
		const sheet = fakeSheet("JournalEntry.site");
		fire("renderSiteSheet", sheet);
		vi.advanceTimersByTime(500);
		expect(savedHere()).toEqual({ "JournalEntry.site": { left: 100, top: 50, width: 860, height: 920, zIndex: 101 } });

		fire("closeSiteSheet", sheet);
		vi.advanceTimersByTime(500);
		expect(savedHere()).toEqual({});
	});

	it("forgets a sheet once it closes", () => {
		const sheet = fakeSheet("Actor.knight");
		fire("renderActorSheetV2", sheet);
		fire("closeActorSheetV2", sheet);
		vi.advanceTimersByTime(500);
		expect(savedHere()).toEqual({});
	});

	it("keeps the sheet that replaced another over the same document when the old one closes after", () => {
		const old = fakeSheet("Actor.knight");
		const replacement = fakeSheet("Actor.knight");
		fire("renderActorSheetV2", old);
		fire("renderActorSheetV2", replacement);
		fire("closeActorSheetV2", old);
		vi.advanceTimersByTime(500);
		expect(Object.keys(savedHere())).toEqual(["Actor.knight"]);
	});

	it("marks a minimized sheet and leaves out an automatic height", () => {
		const sheet = fakeSheet("Actor.knight", { position: { left: 1, top: 2, width: 300, height: "auto", zIndex: 3 } });
		sheet.minimized = true;
		fire("renderActorSheetV2", sheet);
		vi.advanceTimersByTime(500);
		expect(savedHere()["Actor.knight"]).toEqual({ left: 1, top: 2, width: 300, zIndex: 3, minimized: true });
	});

	it("saves where a sheet was dragged to as the page unloads", () => {
		const sheet = fakeSheet("Actor.knight");
		fire("renderActorSheetV2", sheet);
		// Dragging moves the window without rendering it again.
		sheet.position.left = 640;
		unload();
		expect(savedHere()["Actor.knight"].left).toBe(640);
	});

	it("saves the page each tab group is on, as the page unloads", () => {
		const sheet = fakeSheet("Actor.knight");
		sheet.tabGroups = { primary: "knight" };
		fire("renderActorSheetV2", sheet);
		// Picking a tab shows the page without rendering the sheet again.
		sheet.tabGroups.primary = "chronicle";
		unload();
		expect(savedHere()["Actor.knight"].tabs).toEqual({ primary: "chronicle" });
	});

	it("leaves out sheets over compendium entries", () => {
		fire("renderActorSheetV2", fakeSheet("Compendium.world.knights.Actor.k1", { pack: "world.knights" }));
		vi.advanceTimersByTime(500);
		unload();
		expect(savedHere()).toEqual({});
	});

	it("keeps the sheets other worlds in this browser saved", () => {
		settings.openSheets = { "world-b": { "Actor.theirs": { left: 1, top: 1 } } };
		fire("renderActorSheetV2", fakeSheet("Actor.mine"));
		vi.advanceTimersByTime(500);
		expect(settings.openSheets["world-b"]).toEqual({ "Actor.theirs": { left: 1, top: 1 } });
		expect(Object.keys(savedHere())).toEqual(["Actor.mine"]);
	});

	it("saves nothing while the setting is off", () => {
		settings.restoreOpenSheets = false;
		fire("renderActorSheetV2", fakeSheet("Actor.knight"));
		vi.advanceTimersByTime(500);
		unload();
		expect(settings.openSheets).toEqual({});
	});
});

describe("reopening sheets", () => {
	it("reopens each sheet where it was", async () => {
		const sheet = fakeSheet("Actor.knight");
		settings.openSheets = { "world-a": { "Actor.knight": { left: 10, top: 20, width: 700, height: 800, zIndex: 105 } } };
		await restoreOpenSheets();
		expect(sheet.render).toHaveBeenCalledWith({ force: true, position: { left: 10, top: 20, width: 700, height: 800 } });
		expect(sheet.minimize).not.toHaveBeenCalled();
	});

	it("opens the back-most sheet first, so the front one ends in front", async () => {
		const opened = [];
		for (const uuid of ["Actor.front", "Actor.back", "Actor.middle"]) {
			fakeSheet(uuid).render.mockImplementation(async () => opened.push(uuid));
		}
		settings.openSheets = {
			"world-a": {
				"Actor.front": { zIndex: 110 },
				"Actor.back": { zIndex: 101 },
				"Actor.middle": { zIndex: 105 }
			}
		};
		await restoreOpenSheets();
		expect(opened).toEqual(["Actor.back", "Actor.middle", "Actor.front"]);
	});

	it("reopens a sheet on the page it was showing", async () => {
		const sheet = fakeSheet("Actor.knight");
		sheet.tabGroups = {};
		sheet.render.mockImplementation(async () => expect(sheet.tabGroups.primary).toBe("seer"));
		settings.openSheets = { "world-a": { "Actor.knight": { left: 10, top: 20, tabs: { primary: "seer" } } } };
		await restoreOpenSheets();
		expect(sheet.render).toHaveBeenCalledWith({ force: true, position: { left: 10, top: 20 } });
	});

	it("opens on the default page when the saved one is gone", async () => {
		const sheet = fakeSheet("Actor.knight");
		sheet.tabGroups = {};
		sheet._getTabsConfig = () => ({ tabs: [{ id: "knight" }, { id: "chronicle" }] });
		settings.openSheets = { "world-a": { "Actor.knight": { tabs: { primary: "settings" } } } };
		await restoreOpenSheets();
		expect(sheet.tabGroups).toEqual({});
	});

	it("minimizes a sheet that was minimized", async () => {
		const sheet = fakeSheet("Actor.knight");
		settings.openSheets = { "world-a": { "Actor.knight": { left: 10, top: 20, minimized: true } } };
		await restoreOpenSheets();
		expect(sheet.render).toHaveBeenCalledWith({ force: true, position: { left: 10, top: 20 } });
		expect(sheet.minimize).toHaveBeenCalled();
	});

	it("leaves shut a sheet whose document is gone or that this user can no longer see", async () => {
		const hidden = fakeSheet("Actor.hidden", { canSee: false });
		const visible = fakeSheet("Actor.visible");
		settings.openSheets = { "world-a": { "Actor.deleted": {}, "Actor.hidden": {}, "Actor.visible": {} } };
		await restoreOpenSheets();
		expect(hidden.render).not.toHaveBeenCalled();
		expect(visible.render).toHaveBeenCalled();
	});

	it("carries on past a sheet that fails to render", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		fakeSheet("Actor.broken").render.mockRejectedValue(new Error("template missing"));
		const working = fakeSheet("Actor.working");
		settings.openSheets = { "world-a": { "Actor.broken": { zIndex: 1 }, "Actor.working": { zIndex: 2 } } };
		await restoreOpenSheets();
		expect(working.render).toHaveBeenCalled();
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("reopens nothing another world left open", async () => {
		const sheet = fakeSheet("Actor.theirs");
		settings.openSheets = { "world-b": { "Actor.theirs": { left: 10, top: 20 } } };
		await restoreOpenSheets();
		expect(sheet.render).not.toHaveBeenCalled();
	});

	it("reopens nothing while the setting is off", async () => {
		const sheet = fakeSheet("Actor.knight");
		settings.restoreOpenSheets = false;
		settings.openSheets = { "world-a": { "Actor.knight": { left: 10, top: 20 } } };
		await restoreOpenSheets();
		expect(sheet.render).not.toHaveBeenCalled();
	});

	it("keeps every saved sheet when the page unloads before they have all reopened", async () => {
		const saved = { "Actor.first": { left: 1, top: 1, zIndex: 1 }, "Actor.second": { left: 2, top: 2, zIndex: 2 } };
		settings.openSheets = { "world-a": saved };
		const first = fakeSheet("Actor.first");
		const second = fakeSheet("Actor.second");
		first.render.mockImplementation(async () => fire("renderActorSheetV2", first));
		let finishSecond;
		second.render.mockImplementation(() => new Promise((resolve) => {
			finishSecond = () => resolve(fire("renderActorSheetV2", second));
		}));

		const restoring = restoreOpenSheets();
		await vi.advanceTimersByTimeAsync(1000);
		unload();
		expect(savedHere()).toEqual(saved);

		finishSecond();
		await restoring;
		await vi.advanceTimersByTimeAsync(500);
		expect(Object.keys(savedHere())).toEqual(["Actor.first", "Actor.second"]);
	});
});

describe("windows that aren't sheets", () => {
	const fakeWindow = () => {
		const app = { position: { left: 40, top: 30, width: 900, height: 820, zIndex: 120 }, minimized: false, minimize: vi.fn() };
		app.render = vi.fn(async () => app);
		return app;
	};

	it("saves a registered window under its key while it's open", () => {
		registerRestorableWindow("rulebook", "BookReader", () => null);
		const app = fakeWindow();
		fire("renderBookReader", app);
		vi.advanceTimersByTime(500);
		expect(savedHere()).toEqual({ "window:rulebook": { left: 40, top: 30, width: 900, height: 820, zIndex: 120 } });
		fire("closeBookReader", app);
		vi.advanceTimersByTime(500);
		expect(savedHere()).toEqual({});
	});

	it("reopens it where it was, among the sheets in front-to-back order", async () => {
		const app = fakeWindow();
		const opened = [];
		app.render.mockImplementation(async () => opened.push("window:rulebook"));
		fakeSheet("Actor.front").render.mockImplementation(async () => opened.push("Actor.front"));
		registerRestorableWindow("rulebook", "BookReader", () => app);
		settings.openSheets = { "world-a": { "Actor.front": { zIndex: 110 }, "window:rulebook": { left: 7, top: 8, zIndex: 101 } } };
		await restoreOpenSheets();
		expect(app.render).toHaveBeenCalledWith({ force: true, position: { left: 7, top: 8 } });
		expect(opened).toEqual(["window:rulebook", "Actor.front"]);
	});

	it("leaves it shut when it says it can't open", async () => {
		registerRestorableWindow("rulebook", "BookReader", () => null);
		settings.openSheets = { "world-a": { "window:rulebook": { left: 7, top: 8 } } };
		await restoreOpenSheets();
		vi.advanceTimersByTime(500);
		expect(savedHere()).toEqual({});
	});
});
