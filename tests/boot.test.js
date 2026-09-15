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
			api: { HandlebarsApplicationMixin: (Base) => class extends Base {}, DialogV2: {} },
			apps: { DocumentSheetConfig: { registerSheet: vi.fn() } },
			handlebars: { loadTemplates: vi.fn(), renderTemplate: vi.fn() },
			sheets: { ActorSheetV2: class {}, ItemSheetV2: class {} },
			ux: { TextEditor: { implementation: {} } }
		}
	};
	globalThis.CONFIG = { Actor: { dataModels: {} }, Item: { dataModels: {} } };
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

	it("registers the Knight and item sheets as defaults", () => {
		const { registerSheet } = foundry.applications.apps.DocumentSheetConfig;
		const [[actorClass, , knightSheet, knightOptions], [itemClass, , itemSheet, itemOptions]] = registerSheet.mock.calls;

		expect(actorClass).toBe(Actor);
		expect(knightOptions).toMatchObject({ types: ["knight"], makeDefault: true });
		expect(itemClass).toBe(Item);
		expect(itemOptions.types.sort()).toEqual(Object.keys(CONFIG.Item.dataModels).sort());

		for (const sheet of [knightSheet, itemSheet]) {
			for (const part of Object.values(sheet.PARTS)) {
				expect(existsSync(fileForTemplate(part.template)), part.template).toBe(true);
			}
		}
	});

	it("preloads chat partials that exist on disk", () => {
		const [[partials]] = foundry.applications.handlebars.loadTemplates.mock.calls;
		for (const path of Object.values(partials)) {
			expect(existsSync(fileForTemplate(path)), path).toBe(true);
		}
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

describe("ArmourModel", () => {
	it("only counts worn armour", () => {
		const { armour: ArmourModel } = CONFIG.Item.dataModels;
		expect(Object.assign(new ArmourModel(), { equipped: true, armour: 2 }).wornArmour).toBe(2);
		expect(Object.assign(new ArmourModel(), { equipped: false, armour: 2 }).wornArmour).toBe(0);
	});
});
