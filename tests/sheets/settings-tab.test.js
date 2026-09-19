import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTING_GROUPS } from "../../module/rules/settings-tab.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const root = join(import.meta.dirname, "../..");
const partial = readFileSync(join(root, "templates/actor/parts/settings-tab.hbs"), "utf8");

let tab;
let values;

/** A setting registered under the system. */
const setting = (key, config) => [`${SYSTEM_ID}.${key}`, { key, namespace: SYSTEM_ID, scope: "client", ...config }];

beforeEach(async () => {
	vi.resetModules();
	values = { textSize: 1.2, contrast: "normal", noItalics: false, rulebookForPlayers: true };
	globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
	globalThis.game = {
		user: { id: "player", isGM: false, character: null },
		settings: {
			settings: new Map([
				setting("textSize", { name: "Text Size", type: Number, range: { min: 0.9, max: 1.4, step: 0.05 }, default: 1 }),
				setting("contrast", { name: "Contrast", type: String, choices: { normal: "Parchment", high: "High" }, default: "normal" }),
				setting("noItalics", { name: "No Italics", type: Boolean, default: false }),
				setting("rulebookForPlayers", { name: "Players read", type: Boolean, scope: "world", default: false }),
				setting("calendar", { type: Object, scope: "world", config: false })
			]),
			menus: new Map([[`${SYSTEM_ID}.welcome`, { label: "Open the Welcome", hint: "hi", icon: "fa-solid fa-chess-rook", type: class {} }]]),
			get: vi.fn((_namespace, key) => values[key]),
			set: vi.fn(async (_namespace, key, value) => {
				values[key] = value;
			})
		}
	};
	tab = await import("../../module/sheets/settings-tab.js");
});

afterEach(() => {
	delete globalThis.CONST;
	delete globalThis.game;
});

const knight = (ownership = {}) => ({ id: "k1", type: "knight", ownership });

describe("isOwnCharacter", () => {
	it("counts the Knights a player owns by name or plays", () => {
		expect(tab.isOwnCharacter(knight({ player: 3 }), game.user)).toBe(true);
		expect(tab.isOwnCharacter(knight({ default: 3 }), game.user)).toBe(false);
		expect(tab.isOwnCharacter(knight({ player: 2 }), game.user)).toBe(false);
		expect(tab.isOwnCharacter(knight(), { ...game.user, character: { id: "k1" } })).toBe(true);
	});

	it("counts for a GM only the Knight they play", () => {
		const gm = { id: "gm", isGM: true, character: null };
		// Foundry makes whoever creates a Knight its owner.
		expect(tab.isOwnCharacter(knight({ gm: 3 }), gm)).toBe(false);
		expect(tab.isOwnCharacter(knight({ gm: 3 }), { ...gm, character: { id: "k1" } })).toBe(true);
	});

	it("counts nothing without an actor or a reader", () => {
		expect(tab.isOwnCharacter({ type: "knight", ownership: { player: 3 } }, game.user)).toBe(false);
		expect(tab.isOwnCharacter(knight({ player: 3 }), null)).toBe(false);
	});
});

describe("settingGroupsView", () => {
	it("draws a player's own settings with their current values, leaving out what isn't registered", () => {
		const groups = tab.settingGroupsView(game.user);
		expect(groups.map((group) => group.id)).toEqual(["reading"]);
		expect(groups[0].rows.map((row) => row.key)).toEqual(["textSize", "contrast", "noItalics"]);
		expect(groups[0].rows[0]).toMatchObject({ isRange: true, value: 1.2, display: "1.20", forTable: false });
	});

	it("gives a GM the Referee's settings too, marking one that changes the game for everyone", () => {
		const referee = tab.settingGroupsView({ isGM: true }).find((group) => group.id === "referee");
		expect(referee.rows).toEqual([expect.objectContaining({ key: "rulebookForPlayers", checked: true, forTable: true })]);
		expect(referee.menus).toEqual([{ id: "welcome", label: "Open the Welcome", hint: "hi", icon: "fa-solid fa-chess-rook" }]);
	});
});

describe("changeSetting", () => {
	it("writes a control's value as its setting stores it", async () => {
		expect(await tab.changeSetting("textSize", "1.35")).toBe(true);
		expect(game.settings.set).toHaveBeenCalledWith(SYSTEM_ID, "textSize", 1.35);
		expect(await tab.changeSetting("contrast", "high")).toBe(true);
		expect(values.contrast).toBe("high");
	});

	it("refuses what the page doesn't offer this person", async () => {
		expect(await tab.changeSetting("rulebookForPlayers", false)).toBe(false);
		expect(await tab.changeSetting("calendar", "{}")).toBe(false);
		expect(await tab.changeSetting("contrast", "loud")).toBe(false);
		expect(game.settings.set).not.toHaveBeenCalled();
		game.user.isGM = true;
		expect(await tab.changeSetting("rulebookForPlayers", false)).toBe(true);
	});
});

describe("openSystemSettings", () => {
	it("opens Foundry's settings window on this system's settings", async () => {
		game.settings.sheet = { tabGroups: {}, render: vi.fn() };
		await tab.openSystemSettings();
		expect(game.settings.sheet.tabGroups.categories).toBe("system");
		expect(game.settings.sheet.render).toHaveBeenCalledWith({ force: true });
	});
});

describe("SettingsTabMixin", () => {
	/** Just enough of ApplicationV2's tabs and form for the mixin. */
	class Base {
		static DEFAULT_OPTIONS = {};
		static TABS = {
			primary: {
				initial: "knight",
				tabs: [{ id: "knight" }, { id: "chronicle" }, { id: "settings" }]
			}
		};

		tabGroups = { primary: null };

		/** Fields the sheet's own form was sent. */
		submitted = [];

		_getTabsConfig(group) {
			return this.constructor.TABS[group];
		}

		_prepareTabs(group) {
			const { tabs, initial } = this._getTabsConfig(group);
			this.tabGroups[group] ??= initial;
			return Object.fromEntries(tabs.map(({ id }) => [id, { id, active: this.tabGroups[group] === id }]));
		}

		async _prepareContext() {
			return { tabs: this._prepareTabs("primary") };
		}

		_onChangeForm(_formConfig, event) {
			this.submitted.push(event.target);
		}
	}

	/** A sheet that shows the page on the reader's own character, as the Knight sheet does. */
	const sheetFor = (document) => {
		const OwnSheet = class extends tab.SettingsTabMixin(Base) {
			_showsSettingsTab(user) {
				return tab.isOwnCharacter(this.document, user);
			}
		};
		const sheet = new OwnSheet();
		sheet.document = document;
		return sheet;
	};

	it("draws the page on the reader's own Knight", async () => {
		const context = await sheetFor(knight({ player: 3 }))._prepareContext();
		expect(Object.keys(context.tabs)).toEqual(["knight", "chronicle", "settings"]);
		expect(context.settingGroups.map((group) => group.id)).toEqual(["reading"]);
	});

	it("leaves it off someone else's, even one left open on the page", async () => {
		const sheet = sheetFor(knight({ someoneElse: 3 }));
		sheet.tabGroups.primary = "settings";
		const context = await sheet._prepareContext();
		expect(Object.keys(context.tabs)).toEqual(["knight", "chronicle"]);
		expect(context.tabs.knight.active).toBe(true);
		expect(context.settingGroups).toEqual([]);
	});

	it("shows the page on no sheet that doesn't ask for it", async () => {
		const sheet = new (tab.SettingsTabMixin(Base))();
		sheet.document = knight({ player: 3 });
		const context = await sheet._prepareContext();
		expect(Object.keys(context.tabs)).toEqual(["knight", "chronicle"]);
	});

	it("writes a setting from the page, and sends nothing to the Actor", () => {
		const sheet = sheetFor(knight({ player: 3 }));
		sheet._onChangeForm({}, { target: { type: "checkbox", checked: true, dataset: { setting: "noItalics" } } });
		expect(game.settings.set).toHaveBeenCalledWith(SYSTEM_ID, "noItalics", true);
		expect(sheet.submitted).toEqual([]);
	});

	it("leaves every other field to the sheet", () => {
		const sheet = sheetFor(knight({ player: 3 }));
		const field = { type: "text", value: "Sir Ose", dataset: {} };
		sheet._onChangeForm({}, { target: field });
		expect(sheet.submitted).toEqual([field]);
		expect(game.settings.set).not.toHaveBeenCalled();
	});

	it("opens the system's settings windows and Foundry's", () => {
		expect(Object.keys(tab.SettingsTabMixin(Base).DEFAULT_OPTIONS.actions)).toEqual(["openSettingsMenu", "openAllSettings"]);
	});
});

describe("the Settings page's template", () => {
	const controls = [...partial.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((match) => match[0]);

	it("sends nothing to the Actor: every control names its setting, and none has a name", () => {
		expect(controls.length).toBeGreaterThan(0);
		for (const control of controls) {
			expect(control).not.toMatch(/\sname=/);
			expect(control).toMatch(/\sdata-setting="\{\{key\}\}"/);
		}
	});

	it("only asks for actions the mixin has", () => {
		const actions = [...partial.matchAll(/data-action="(\w+)"/g)].map((match) => match[1]);
		const known = Object.keys(tab.SettingsTabMixin(class {}).DEFAULT_OPTIONS.actions);
		for (const action of actions) expect(known).toContain(action);
	});

	it("stays live on a sheet the reader can only view", () => {
		expect(partial).toMatch(/<div class="bastionland-settings" data-viewable>/);
	});

	it("is drawn by both sheets that list the page", () => {
		expect(readFileSync(join(root, "templates/actor/knight-sheet.hbs"), "utf8")).toContain('{{> "bastionland.settings-tab"}}');
		expect(readFileSync(join(root, "templates/actor/gm-toolkit/settings.hbs"), "utf8")).toContain('{{> "bastionland.settings-tab"}}');
	});
});

describe("the settings the page offers", () => {
	const sources = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sources(path);
		return entry.name.endsWith(".js") ? [readFileSync(path, "utf8")] : [];
	});
	const elsewhere = sources(join(root, "module")).filter((source) => !source.includes("export const SETTING_GROUPS"));

	// Named as a string, or as a key in a table of settings such as module/client-settings.js's.
	it.each(SETTING_GROUPS.flatMap((group) => [...group.keys, ...(group.menus ?? [])]))("%s is registered somewhere", (key) => {
		const named = new RegExp(`"${key}"|^\\s*${key}: \\{`, "m");
		expect(elsewhere.some((source) => named.test(source))).toBe(true);
	});
});
