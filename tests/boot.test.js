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
				BooleanField: Field,
				HTMLField: Field,
				NumberField: Field,
				SchemaField: Field,
				StringField: Field
			}
		},
		applications: {
			api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (Base) => class extends Base {}, DialogV2: {} },
			apps: { DocumentSheetConfig: { registerSheet: vi.fn() } },
			handlebars: { loadTemplates: vi.fn(), renderTemplate: vi.fn() },
			sheets: { ActorSheetV2: class {}, ItemSheetV2: class {} },
			ux: { TextEditor: { implementation: {} } }
		},
		canvas: {
			layers: {
				InteractionLayer: class {
					static get layerOptions() {
						return { name: "", zIndex: 0 };
					}
				}
			}
		}
	};
	globalThis.CONFIG = { Actor: { dataModels: {} }, Item: { dataModels: {} }, Canvas: { layers: {} } };
	globalThis.canvas = { scene: null };
	globalThis.game = { settings: { register: vi.fn(), get: vi.fn() }, system: {}, user: { isGM: false } };
	globalThis.Hooks = {
		once: (name, callback) => { hooks[name] = callback; },
		on: (name, callback) => { hooks[name] = callback; }
	};
	globalThis.Actor = class Actor {};
	globalThis.Item = class Item {};
	globalThis.window = { addEventListener: vi.fn() };
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

	it("registers a data model for every document type in system.json", async () => {
		const { default: manifest } = await import("../system.json", { with: { type: "json" } });
		expect(Object.keys(CONFIG.Actor.dataModels).sort()).toEqual(Object.keys(manifest.documentTypes.Actor).sort());
		expect(Object.keys(CONFIG.Item.dataModels).sort()).toEqual(Object.keys(manifest.documentTypes.Item).sort());
	});

	it("registers the Knight, NPC and item sheets as defaults", () => {
		const { registerSheet } = foundry.applications.apps.DocumentSheetConfig;
		const registered = (documentClass, type) => registerSheet.mock.calls
			.find(([registeredClass, , , options]) => registeredClass === documentClass && options.types.includes(type));
		const [, , knightSheet, knightOptions] = registered(Actor, "knight");
		const [, , npcSheet, npcOptions] = registered(Actor, "npc");
		const [, , itemSheet, itemOptions] = registered(Item, "weapon");

		expect(knightOptions).toMatchObject({ types: ["knight"], makeDefault: true });
		expect(npcOptions).toMatchObject({ types: ["npc"], makeDefault: true });
		expect(itemOptions.types.sort()).toEqual(Object.keys(CONFIG.Item.dataModels).sort());

		for (const sheet of [knightSheet, npcSheet, itemSheet]) {
			for (const part of Object.values(sheet.PARTS)) {
				expect(existsSync(fileForTemplate(part.template)), part.template).toBe(true);
			}
		}
	});

	it("preloads partials that exist on disk", () => {
		const [[partials]] = foundry.applications.handlebars.loadTemplates.mock.calls;
		expect(Object.keys(partials)).toEqual(expect.arrayContaining(["bastionland.item-row", "bastionland.add-item", "bastionland.save-result"]));
		for (const path of Object.values(partials)) {
			expect(existsSync(fileForTemplate(path)), path).toBe(true);
		}
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
		expect(game.system.api.openNpcChooser).toBeTypeOf("function");
		expect(game.system.api.newRealm).toBeTypeOf("function");
		expect(game.system.api.wildernessRoll).toBeTypeOf("function");
		expect(game.system.api.openRefereeRolls).toBeTypeOf("function");
		expect(game.system.api.rollRefereeTable).toBeTypeOf("function");
		expect(game.system.api.openSparkTables).toBeTypeOf("function");
		expect(game.system.api.openTimePanel).toBeTypeOf("function");
		expect(game.system.api.awardGlory).toBeTypeOf("function");
		expect(game.system.api.getCalendar).toBeTypeOf("function");
		expect(Object.isFrozen(game.system.api)).toBe(true);
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

	it("keeps the world's calendar in a hidden world setting", () => {
		expect(game.settings.register).toHaveBeenCalledWith(SYSTEM_ID, "calendar", expect.objectContaining({
			scope: "world",
			config: false,
			type: Object,
			default: { age: 1, season: "spring", day: 1, phase: "morning" }
		}));
	});

	it("adds Referee Rolls, Spark Tables and Time to the Roll Tables directory only for GMs", () => {
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
		expect(allowed.buttons.map((button) => button.className)).toEqual(["bastionland-referee-rolls", "bastionland-spark-tables", "bastionland-time"]);
		game.user.isGM = false;
		delete globalThis.document;
	});

	it("adds New Knight and New NPC to the Actors directory only for users who can create actors", () => {
		const header = () => {
			const buttons = [];
			return { buttons, querySelector: () => null, append: (...added) => buttons.push(...added) };
		};
		const element = (actions) => ({ querySelector: (selector) => (selector === ".header-actions" ? actions : null) });

		const refused = header();
		game.user.can = () => false;
		hooks.renderActorDirectory({}, element(refused));
		expect(refused.buttons).toHaveLength(0);

		const allowed = header();
		game.user.can = (permission) => permission === "ACTOR_CREATE";
		globalThis.document = {
			createElement: (tag) => ({ tag, append() {}, addEventListener() {} })
		};
		globalThis.game.i18n = { localize: (key) => key };
		hooks.renderActorDirectory({}, element(allowed));
		expect(allowed.buttons.map((button) => button.className)).toEqual(["bastionland-new-knight", "bastionland-new-npc"]);
		delete globalThis.document;
	});

	it("leaves the Macro Directory alone for players when the world is ready", async () => {
		expect(hooks.ready).toBeTypeOf("function");
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

describe("ArmourModel", () => {
	it("only counts worn armour", () => {
		const { armour: ArmourModel } = CONFIG.Item.dataModels;
		expect(Object.assign(new ArmourModel(), { equipped: true, armour: 2 }).wornArmour).toBe(2);
		expect(Object.assign(new ArmourModel(), { equipped: false, armour: 2 }).wornArmour).toBe(0);
	});
});
