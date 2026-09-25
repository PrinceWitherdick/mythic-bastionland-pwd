import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../module/system-id.js";

const root = join(import.meta.dirname, "..");

/**
 * Just enough of Foundry's globals for the entry module and everything it
 * imports to load and run `init`. Fields record their options so the schema
 * can be inspected.
 */
function installFoundryStubs() {
	class Field {
		constructor(fieldsOrOptions = {}, options = {}) {
			this.fields = fieldsOrOptions;
			this.options = { ...fieldsOrOptions, ...options };
		}
	}
	class TypeDataModel {
		prepareDerivedData() {}
	}
	const hooks = {};

	globalThis.foundry = {
		abstract: { TypeDataModel },
		data: {
			fields: {
				ArrayField: Field,
				BooleanField: Field,
				HTMLField: Field,
				NumberField: Field,
				SchemaField: Field,
				StringField: Field
			}
		},
		applications: {
			api: { ApplicationV2: class {}, DocumentSheetV2: class {}, HandlebarsApplicationMixin: (Base) => class extends Base {}, DialogV2: {} },
			apps: { DocumentSheetConfig: { registerSheet: vi.fn() }, ImagePopout: class {} },
			handlebars: { loadTemplates: vi.fn(), renderTemplate: vi.fn() },
			sheets: { ActorSheetV2: class {}, ItemSheetV2: class {} },
			ux: { TextEditor: { implementation: {} } }
		},
		documents: { JournalEntry: class JournalEntry {} },
		canvas: {
			placeables: { Token: class Token {} },
			layers: {
				InteractionLayer: class {
					static get layerOptions() {
						return { name: "", zIndex: 0 };
					}
				}
			}
		}
	};
	globalThis.CONFIG = { Actor: { dataModels: {} }, Item: { dataModels: {} }, Canvas: { layers: {} }, Token: {}, fontDefinitions: {}, queries: {} };
	globalThis.canvas = { scene: null };
	globalThis.game = { settings: { register: vi.fn(), registerMenu: vi.fn(), get: vi.fn() }, keybindings: { register: vi.fn() }, system: {}, user: { isGM: false, getFlag: () => undefined } };
	globalThis.Hooks = {
		once: (name, callback) => { hooks[name] = callback; },
		on: (name, callback) => { hooks[name] = callback; }
	};
	globalThis.Actor = class Actor {};
	globalThis.Item = class Item {};
	globalThis.window = { addEventListener: vi.fn() };
	globalThis.document = {
		body: { append: vi.fn() },
		createElement: () => ({ innerHTML: "", firstElementChild: {} }),
		addEventListener: vi.fn()
	};
	return hooks;
}

/** Map a served template path back to the file in this repository. */
const fileForTemplate = (path) => join(root, path.replace(/^systems\/[^/]+\//, ""));

describe("system boot", () => {
	let hooks;
	let entry;

	beforeAll(async () => {
		hooks = installFoundryStubs();
		entry = await import("../mythic-bastionland.js");
		hooks.init();
	});

	it("loads the entry module and registers an init hook", () => {
		expect(entry).toBeDefined();
		expect(hooks.init).toBeTypeOf("function");
	});

	it("registers Reopen Sheets on Reload for each browser and follows open sheets", () => {
		expect(game.settings.register).toHaveBeenCalledWith(SYSTEM_ID, "restoreOpenSheets", expect.objectContaining({
			scope: "client",
			config: true,
			type: Boolean,
			default: true
		}));
		expect(hooks.renderActorSheetV2).toBeTypeOf("function");
		expect(window.addEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
	});

	it("puts the shield's clip paths on the page", () => {
		expect(document.body.append).toHaveBeenCalledOnce();
	});

	it("listens for a dropdown anywhere on the page, so every select drops the system's own list", () => {
		for (const press of ["mousedown", "keydown"]) {
			expect(document.addEventListener).toHaveBeenCalledWith(press, expect.any(Function), true);
		}
	});

	it("offers the sheets' own faces from Foundry's font menus", () => {
		for (const family of ["Bastionland Display", "Bastionland Body", "Bastionland Caps"]) {
			expect(CONFIG.fontDefinitions[family]).toMatchObject({ editor: true });
			expect(CONFIG.fontDefinitions[family].fonts.length).toBeGreaterThan(0);
		}
	});

	it("registers a data model for every document type in system.json", async () => {
		const { default: manifest } = await import("../system.json", { with: { type: "json" } });
		expect(Object.keys(CONFIG.Actor.dataModels).sort()).toEqual(Object.keys(manifest.documentTypes.Actor).sort());
		expect(Object.keys(CONFIG.Item.dataModels).sort()).toEqual(Object.keys(manifest.documentTypes.Item).sort());
	});

	it("registers the Knight, NPC, Domain, Structure and item sheets as defaults", () => {
		const { registerSheet } = foundry.applications.apps.DocumentSheetConfig;
		const registered = (documentClass, type) => registerSheet.mock.calls
			.find(([registeredClass, , , options]) => registeredClass === documentClass && options.types.includes(type));
		const [, , knightSheet, knightOptions] = registered(Actor, "knight");
		const [, , npcSheet, npcOptions] = registered(Actor, "npc");
		const [, , domainSheet, domainOptions] = registered(Actor, "domain");
		const [, , structureSheet, structureOptions] = registered(Actor, "structure");
		const [, , itemSheet, itemOptions] = registered(Item, "weapon");

		expect(knightOptions).toMatchObject({ types: ["knight"], makeDefault: true });
		expect(npcOptions).toMatchObject({ types: ["npc"], makeDefault: true });
		expect(domainOptions).toMatchObject({ types: ["domain"], makeDefault: true });
		expect(structureOptions).toMatchObject({ types: ["structure"], makeDefault: true });
		expect(itemOptions.types.sort()).toEqual(Object.keys(CONFIG.Item.dataModels).sort());

		for (const sheet of [knightSheet, npcSheet, domainSheet, structureSheet, itemSheet]) {
			for (const part of Object.values(sheet.PARTS)) {
				expect(existsSync(fileForTemplate(part.template)), part.template).toBe(true);
			}
		}
	});

	it("gives the world one GM Toolkit, drawn on its own sheet with a page for each part of it", async () => {
		const { GM_TOOLKIT_TYPE } = await import("../module/actions/gm-toolkit.js");
		const { TOOLKIT_TABS } = await import("../module/rules/gm-toolkit.js");
		const { registerSheet } = foundry.applications.apps.DocumentSheetConfig;
		const [, , toolkitSheet, options] = registerSheet.mock.calls
			.find(([registeredClass, , , sheetOptions]) => registeredClass === Actor && sheetOptions.types.includes(GM_TOOLKIT_TYPE));
		expect(options).toMatchObject({ types: [GM_TOOLKIT_TYPE], makeDefault: true });
		for (const part of Object.values(toolkitSheet.PARTS)) {
			expect(existsSync(fileForTemplate(part.template)), part.template).toBe(true);
		}
		// Every page on the rail has a part to draw it, the GM's own Settings last.
		const tabs = toolkitSheet.TABS.primary.tabs.map((tab) => tab.id);
		expect(tabs).toEqual([...TOOLKIT_TABS, "settings"]);
		for (const tab of tabs) expect(toolkitSheet.PARTS[tab]).toBeDefined();

		// A second toolkit is refused, and the last one is kept.
		expect(hooks.preCreateActor).toBeTypeOf("function");
		expect(hooks.preDeleteActor).toBeTypeOf("function");
		expect(hooks.renderDialogV2).toBeTypeOf("function");
		expect(game.system.api.openGmToolkit).toBeTypeOf("function");
	});

	it("makes the GM Toolkit each GM's character, so core's own C opens it, and keeps their chat their own", () => {
		// Core's character sheet key does the opening, so the system adds no key of its own.
		expect(game.keybindings.register.mock.calls.map(([, name]) => name)).not.toContain("openGmToolkit");
		expect(hooks.createActor).toBeTypeOf("function");
		expect(hooks.preCreateChatMessage).toBeTypeOf("function");
		// A player never takes it.
		expect(hooks.createActor({ type: "gmToolkit", pack: null }, {}, "someone")).toBeUndefined();
	});

	it("opens a Site's Journal entry on its map, and offers the map to no other entry", async () => {
		const { SITE_SHEET_CLASS } = await import("../module/actions/sites.js");
		const { registerSheet } = foundry.applications.apps.DocumentSheetConfig;
		const [, scope, siteSheet, options] = registerSheet.mock.calls.find(([registeredClass]) => registeredClass === foundry.documents.JournalEntry);
		expect(options).toMatchObject({ makeDefault: false, canBeDefault: false, label: "bastionland.sites.sheet" });
		// Foundry knows a sheet by its scope and class name, and each Site's entry stores that name.
		expect(`${scope}.${siteSheet.name}`).toBe(SITE_SHEET_CLASS);
		for (const part of Object.values(siteSheet.PARTS)) {
			expect(existsSync(fileForTemplate(part.template)), part.template).toBe(true);
		}
		expect(hooks.renderJournalDirectory).toBeTypeOf("function");
	});

	it("preloads partials that exist on disk", () => {
		const [[partials]] = foundry.applications.handlebars.loadTemplates.mock.calls;
		expect(Object.keys(partials)).toEqual(expect.arrayContaining(["bastionland.item-row", "bastionland.add-item", "bastionland.save-result"]));
		for (const path of Object.values(partials)) {
			expect(existsSync(fileForTemplate(path)), path).toBe(true);
		}
	});

	it("wires up Attack cards and lets players ask the GM to record changes on them", () => {
		expect(hooks.renderChatMessageHTML).toBeTypeOf("function");
		expect(CONFIG.queries[`${SYSTEM_ID}.changeAttack`]).toBeTypeOf("function");
		expect(CONFIG.queries[`${SYSTEM_ID}.changeDuel`]).toBeTypeOf("function");
		expect(() => hooks.renderChatMessageHTML({ flags: {} }, { querySelector: () => null, querySelectorAll: () => [] })).not.toThrow();
	});

	it("follows combat turns, so a Warband's leader stops sharing its Damage", () => {
		expect(hooks.combatTurnChange).toBeTypeOf("function");
	});

	it("registers the hidden book art setting and hands the importer and choosers to macros", () => {
		expect(game.settings.register).toHaveBeenCalledWith(SYSTEM_ID, "bookArtMacroSeeded", expect.objectContaining({
			scope: "world",
			config: false,
			type: Boolean,
			default: false
		}));
		expect(game.system.api.importBookArt).toBeTypeOf("function");
		expect(game.system.api.openKnightChooser).toBeTypeOf("function");
		expect(game.system.api.newRealm).toBeTypeOf("function");
		expect(game.system.api.wildernessRoll).toBeTypeOf("function");
		expect(game.system.api.rollSurprise).toBeTypeOf("function");
		expect(game.system.api.openRefereeRolls).toBeTypeOf("function");
		expect(game.system.api.rollRefereeTable).toBeTypeOf("function");
		expect(game.system.api.rollLuck).toBeTypeOf("function");
		expect(game.system.api.openSparkTables).toBeTypeOf("function");
		expect(game.system.api.openHexLore).toBeTypeOf("function");
		expect(game.system.api.openTimePanel).toBeTypeOf("function");
		expect(game.system.api.openSessionEnd).toBeTypeOf("function");
		expect(game.system.api.newSite).toBeTypeOf("function");
		// The Myths window is the GM Toolkit's first page now, and macros that open it still do.
		expect(game.system.api.openMythsPanel).toBeTypeOf("function");
		// And the NPC chooser's macros open the NPCs compendium that replaced it.
		expect(game.system.api.openNpcChooser).toBeTypeOf("function");
		expect(game.system.api.rollCityOmen).toBeTypeOf("function");
		expect(game.system.api.awardGlory).toBeTypeOf("function");
		expect(game.system.api.getCalendar).toBeTypeOf("function");
		expect(Object.isFrozen(game.system.api)).toBe(true);
	});

	it("gives the rulebook a hotkey, its settings, and a way in for macros", () => {
		expect(game.keybindings.register).toHaveBeenCalledWith(SYSTEM_ID, "openRulebook", expect.objectContaining({
			editable: [{ key: "KeyB" }],
			onDown: expect.any(Function)
		}));
		expect(game.settings.register).toHaveBeenCalledWith(SYSTEM_ID, "rulebookPdf", expect.objectContaining({ scope: "world", config: false, type: String }));
		expect(game.settings.register).toHaveBeenCalledWith(SYSTEM_ID, "rulebookForPlayers", expect.objectContaining({ scope: "world", config: true, default: false }));
		expect(hooks.renderBookReader).toBeTypeOf("function");
		expect(CONFIG.queries[`${SYSTEM_ID}.showRulebookPage`]).toBeTypeOf("function");
		expect(hooks.renderJournalDirectory).toBeTypeOf("function");
		expect(game.system.api.openRulebook).toBeTypeOf("function");
		expect(game.system.api.openRulebookSetup).toBeTypeOf("function");
		expect(game.system.api.toggleRulebook).toBeTypeOf("function");
		expect(game.settings.register).toHaveBeenCalledWith(SYSTEM_ID, "worldSetupDone", expect.objectContaining({ scope: "world", config: false, type: Object }));
	});

	it("welcomes a new world's GM, who can open the Welcome again from the settings", () => {
		expect(game.settings.register).toHaveBeenCalledWith(SYSTEM_ID, "showWelcome", expect.objectContaining({ scope: "world", config: false, type: Boolean, default: true }));
		expect(game.settings.registerMenu).toHaveBeenCalledWith(SYSTEM_ID, "welcome", expect.objectContaining({ restricted: true }));
		expect(game.system.api.openWelcome).toBeTypeOf("function");
	});

	it("keeps a query from a player from opening the rulebook", async () => {
		const query = CONFIG.queries[`${SYSTEM_ID}.showRulebookPage`];
		await expect(query({ page: 12 }, { user: { isGM: false } })).resolves.toBe(false);
	});

	it("turns Token Automatic Rotation off by default once core registers it", () => {
		const autoRotate = { default: true };
		game.settings.settings = new Map([["core.tokenAutoRotate", autoRotate]]);
		hooks.setup();
		expect(autoRotate.default).toBe(false);
		delete game.settings.settings;
	});

	it("offers Roll Surprise to GMs in the Combat Tracker's encounter menu", () => {
		const options = [];
		const tracker = { viewed: { combatants: { size: 2 } } };
		hooks.getCombatContextOptions(tracker, options);
		expect(options).toHaveLength(1);
		expect(options[0].label).toBe("bastionland.surprise.title");

		game.user.isGM = true;
		expect(options[0].visible()).toBe(true);
		tracker.viewed = null;
		expect(options[0].visible()).toBe(false);
		game.user.isGM = false;
	});

	it("gives GMs the Realm tools, but only on a Realm Scene", async () => {
		const { REALM_BUTTONS, REALM_TOOLS } = await import("../module/rules/realm.js");
		const { realm } = CONFIG.Canvas.layers;
		expect(realm.group).toBe("interface");
		expect(realm.layerClass.layerOptions.name).toBe("realm");
		expect(hooks.canvasReady).toBeTypeOf("function");

		const realmScene = { flags: { [SYSTEM_ID]: { realm: { size: 160, cols: 12, rows: 12 } } } };
		game.user.isGM = true;
		canvas.scene = { flags: {} };
		expect(realm.layerClass.prepareSceneControls()).toBeNull();

		canvas.scene = realmScene;
		const control = realm.layerClass.prepareSceneControls();
		expect(control).toMatchObject({ name: "realm", layer: "realm", activeTool: "inspect" });
		expect(Object.keys(control.tools)).toEqual([...REALM_TOOLS]);
		for (const name of REALM_BUTTONS) expect(control.tools[name].button).toBe(true);

		game.user.isGM = false;
		expect(realm.layerClass.prepareSceneControls()).toBeNull();
		canvas.scene = null;
	});

	it("adds New Realm to the Scenes directory only for GMs, and checks Token moves on Realm Scenes", () => {
		const header = () => {
			const buttons = [];
			return { buttons, querySelector: () => null, append: (...added) => buttons.push(...added) };
		};
		const element = (actions) => ({ querySelector: (selector) => (selector === ".header-actions" ? actions : null) });

		const refused = header();
		game.user.isGM = false;
		hooks.renderSceneDirectory({}, element(refused));
		expect(refused.buttons).toHaveLength(0);

		const allowed = header();
		game.user.isGM = true;
		globalThis.document = {
			createElement: (tag) => ({ tag, append() {}, addEventListener() {} })
		};
		globalThis.game.i18n = { localize: (key) => key };
		hooks.renderSceneDirectory({}, element(allowed));
		expect(allowed.buttons.map((button) => button.className)).toEqual(["bastionland-new-realm"]);
		game.user.isGM = false;
		delete globalThis.document;

		expect(hooks.preMoveToken).toBeTypeOf("function");
		expect(hooks.preMoveToken({ parent: { flags: {} } }, {})).toBe(true);
	});

	it("lets each GM say what reaching a new hex should do", () => {
		expect(game.settings.register).toHaveBeenCalledWith(SYSTEM_ID, "hexLorePrompt", expect.objectContaining({
			scope: "client",
			config: true,
			type: String,
			default: "open",
			choices: {
				never: "bastionland.hexLore.settings.prompt.modes.never",
				open: "bastionland.hexLore.settings.prompt.modes.open"
			}
		}));
	});

	it("watches for a Company coming to rest somewhere new", () => {
		expect(hooks.moveToken).toBeTypeOf("function");
		// A Scene that is not a Realm is left alone, and the hook returns nothing to await.
		expect(hooks.moveToken({ parent: { flags: {} } }, {})).toBeUndefined();
	});

	it("keeps the world's calendar in a hidden world setting", () => {
		expect(game.settings.register).toHaveBeenCalledWith(SYSTEM_ID, "calendar", expect.objectContaining({
			scope: "world",
			config: false,
			type: Object,
			default: { age: 1, season: "spring", day: 1, phase: "morning" }
		}));
	});

	it("remembers the Omens of the City in a hidden world setting", () => {
		expect(game.settings.register).toHaveBeenCalledWith(SYSTEM_ID, "cityQuest", expect.objectContaining({
			scope: "world",
			config: false,
			type: Object,
			default: { seen: [] }
		}));
	});

	it("adds Referee Rolls, Spark Tables, Time, Sites and the GM Toolkit to the Roll Tables directory only for GMs", () => {
		const header = () => {
			const buttons = [];
			return { buttons, querySelector: () => null, append: (...added) => buttons.push(...added) };
		};
		const element = (actions) => ({ querySelector: (selector) => (selector === ".header-actions" ? actions : null) });

		const refused = header();
		game.user.isGM = false;
		hooks.renderRollTableDirectory({}, element(refused));
		expect(refused.buttons).toHaveLength(0);

		const allowed = header();
		game.user.isGM = true;
		globalThis.document = {
			createElement: (tag) => ({ tag, append() {}, addEventListener() {} })
		};
		globalThis.game.i18n = { localize: (key) => key };
		hooks.renderRollTableDirectory({}, element(allowed));
		expect(allowed.buttons.map((button) => button.className)).toEqual(["bastionland-referee-rolls", "bastionland-spark-tables", "bastionland-time", "bastionland-sites", "bastionland-gm-toolkit"]);
		game.user.isGM = false;
		delete globalThis.document;
	});

	it("adds no buttons to the Actors directory, and offers the Knight chooser when Create Actor makes a Knight", async () => {
		expect(hooks.renderActorDirectory).toBeUndefined();

		const { registerSheet } = foundry.applications.apps.DocumentSheetConfig;
		const sheetFor = (type) => registerSheet.mock.calls.find(([registeredClass, , , options]) => registeredClass === Actor && options.types.includes(type))[2];
		const chooseFromBook = (type) => Object.getOwnPropertyDescriptor(sheetFor(type).prototype, "_chooseFromBook");
		expect(chooseFromBook("knight")?.value).toBeTypeOf("function");
		// A new NPC is filled in by hand, as a Structure is; the book's are in the NPCs compendium.
		expect(chooseFromBook("npc")).toBeUndefined();
		expect(chooseFromBook("domain")).toBeUndefined();
		expect(chooseFromBook("structure")).toBeUndefined();

		// Only a sheet Create Actor opens offers its chooser, and only to someone who can edit it.
		const { ActorSheetV2 } = foundry.applications.sheets;
		ActorSheetV2.prototype._onFirstRender = async () => {};
		const offered = [];
		const sheetOpened = (renderContext, isEditable = true) => {
			// Made rather than fabricated, so the sheet's own fields are there to write.
			const sheet = Object.defineProperties(new (sheetFor("knight"))(), { isEditable: { value: isEditable }, element: { value: { addEventListener() {} } } });
			sheet._chooseFromBook = () => offered.push(renderContext);
			return sheet._onFirstRender({}, { renderContext });
		};
		try {
			await sheetOpened("updateActor");
			await sheetOpened("createActor", false);
			expect(offered).toEqual([]);
			await sheetOpened("createActor");
			expect(offered).toEqual(["createActor"]);
		} finally {
			delete ActorSheetV2.prototype._onFirstRender;
		}
	});

	it("leaves the Macro Directory alone for players when the world is ready", async () => {
		expect(hooks.ready).toBeTypeOf("function");
		// A world whose GM hasn't loaded since the Luck Roll macro shipped.
		globalThis.game.macros = { find: () => undefined };
		Object.assign(globalThis.game, { actors: [], users: [] });
		await expect(hooks.ready()).resolves.toBeUndefined();
	});
});

describe("KnightModel", () => {
	it("derives Rank, Armour and conditions from the Knight's state", () => {
		const { knight: KnightModel } = CONFIG.Actor.dataModels;
		const model = Object.assign(new KnightModel(), {
			glory: 7,
			fatigued: true,
			exposed: false,
			mortalWound: false,
			virtues: { vig: { value: 0 }, cla: { value: 4 }, spi: { value: 0 } },
			parent: { items: [{ system: { wornArmour: 1 } }, { system: { wornArmour: 2 } }, { system: {} }] }
		});

		model.prepareDerivedData();

		expect(model.rank).toBe("tenant");
		expect(model.nextRank).toEqual({ key: "dominant", needed: 2 });
		expect(model.armour).toBe(3);
		expect(model.conditions).toEqual({
			fatigued: true,
			exhausted: true,
			exposed: false,
			impaired: true,
			mortalWound: false
		});
		expect(model.knowsFeat("deny")).toBe(true);
	});

	it("is Exposed at CLA 0 even when not marked", () => {
		const { knight: KnightModel } = CONFIG.Actor.dataModels;
		const model = Object.assign(new KnightModel(), {
			glory: 0,
			exposed: false,
			virtues: { vig: { value: 5 }, cla: { value: 0 }, spi: { value: 5 } },
			parent: { items: [] }
		});

		model.prepareDerivedData();

		expect(model.conditions.exposed).toBe(true);
	});

	it("keeps painted heraldry as text that starts blank", () => {
		const schema = CONFIG.Actor.dataModels.knight.defineSchema();
		expect(schema.heraldry.options).toMatchObject({ blank: true, initial: "" });
	});

	it("caps Virtues at 19 in the schema", () => {
		const schema = CONFIG.Actor.dataModels.knight.defineSchema();
		const vig = schema.virtues.fields.vig.fields;
		expect(vig.value.options.max).toBe(19);
		expect(vig.max.options.max).toBe(19);
	});
});

describe("NpcModel", () => {
	const npc = (state) => {
		const { npc: NpcModel } = CONFIG.Actor.dataModels;
		const model = Object.assign(new NpcModel(), {
			scale: "individual",
			fatigued: false,
			exposed: false,
			mortalWound: false,
			virtues: { vig: { value: 10 }, cla: { value: 10 }, spi: { value: 10 } },
			feats: { smite: false, focus: false, deny: false },
			...state
		});
		model.prepareDerivedData();
		return model;
	};

	it("follows a Warband's rout, break and wipe-out from its Mortal Wound, SPI and VIG", () => {
		const warband = npc({ scale: "warband", mortalWound: true, virtues: { vig: { value: 0 }, cla: { value: 4 }, spi: { value: 0 } } });
		expect(warband.warband).toEqual({ routed: true, broken: true, wipedOut: true });
		expect(warband.conditions).toMatchObject({ exhausted: true, impaired: true, mortalWound: true });
		expect(npc({}).warband).toBeNull();
	});

	it("knows only the Feats it is marked with", () => {
		const model = npc({ feats: { smite: false, focus: true, deny: false } });
		expect(model.knowsFeat("focus")).toBe(true);
		expect(model.knowsFeat("smite")).toBe(false);
	});

	it("offers only the scales the rules have", () => {
		const schema = CONFIG.Actor.dataModels.npc.defineSchema();
		expect(schema.scale.options.choices).toEqual(["individual", "warband"]);
	});
});

describe("DomainModel", () => {
	it("musters by the Holding's standing and warns of misrule before it falls", () => {
		const { domain: DomainModel } = CONFIG.Actor.dataModels;
		const domain = (state) => {
			const model = Object.assign(new DomainModel(), { seat: false, crises: [], misrule: false, ...state });
			model.prepareDerivedData();
			return model;
		};

		expect(domain({ seat: true }).muster).toBe(3);
		expect(domain({}).muster).toBe(2);
		expect(domain({ crises: ["chaos", "debt", "panic"] }).misruleDue).toBe(true);
		expect(domain({ crises: ["chaos", "debt", "panic"], misrule: true }).misruleDue).toBe(false);
		expect(domain({ crises: ["chaos"] }).misruleDue).toBe(false);
	});
});

describe("ArmourModel", () => {
	it("only counts worn armour", () => {
		const { armour: ArmourModel } = CONFIG.Item.dataModels;
		expect(Object.assign(new ArmourModel(), { equipped: true, armour: 2 }).wornArmour).toBe(2);
		expect(Object.assign(new ArmourModel(), { equipped: false, armour: 2 }).wornArmour).toBe(0);
	});
});
