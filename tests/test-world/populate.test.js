import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

/**
 * The test world is only imported when its macro runs, so nothing else loads
 * it: this is what finds an import it names that the system no longer exports.
 * Just enough of Foundry's globals for its modules to load.
 */
function installFoundryStubs() {
	class Field {
		constructor(options = {}) {
			this.options = options;
		}
	}
	globalThis.foundry = {
		abstract: { TypeDataModel: class {} },
		data: { fields: { ArrayField: Field, BooleanField: Field, HTMLField: Field, NumberField: Field, ObjectField: Field, SchemaField: Field, StringField: Field } },
		applications: {
			api: { ApplicationV2: class {}, DocumentSheetV2: class {}, HandlebarsApplicationMixin: (Base) => class extends Base {}, DialogV2: {} },
			sheets: { ActorSheetV2: class {}, ItemSheetV2: class {} },
			ux: { TextEditor: { implementation: {} } }
		},
		documents: { JournalEntry: class {} },
		canvas: { placeables: { Token: class {} }, layers: { InteractionLayer: class {} } }
	};
	globalThis.game = { user: { isGM: false }, i18n: { localize: (key) => key } };
	globalThis.ui = { notifications: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } };
	globalThis.Hooks = { on: vi.fn(), once: vi.fn(), off: vi.fn() };
	globalThis.CONFIG = {};
}

/** @returns {object} A collection holding the documents given. */
const collection = (...documents) => ({ some: (test) => documents.some(test) });

describe("the test world", () => {
	let populate;

	beforeAll(async () => {
		installFoundryStubs();
		populate = await import("../../module/test-world/populate.js");
	});

	afterAll(() => {
		for (const key of ["foundry", "game", "ui", "Hooks", "CONFIG"]) delete globalThis[key];
	});

	it("loads, with every name it imports exported by the system", () => {
		expect(populate.populateTestWorld).toBeTypeOf("function");
		expect(populate.hasTestWorld).toBeTypeOf("function");
	});

	it("is left to GMs", async () => {
		await populate.populateTestWorld();
		expect(ui.notifications.warn).toHaveBeenCalledWith("Only a Referee can populate or remove the test world.");
	});

	it("knows a world holding any of its documents, or the toolkit's record of what it changed, has one", () => {
		const flagged = { flags: { [SYSTEM_ID]: { [populate.TEST_FLAG]: true } } };
		const plain = { flags: {} };
		const toolkit = (before) => ({ type: "gmToolkit", getFlag: (scope, key) => (scope === SYSTEM_ID && key === populate.BEFORE_FLAG ? before : undefined) });
		const world = ({ actors = [], messages = [], kit = toolkit(undefined) } = {}) => Object.assign(game, {
			actors: Object.assign(collection(...actors, kit), { filter: (test) => [...actors, kit].filter(test) }),
			scenes: collection(),
			journal: collection(),
			folders: collection(),
			messages: collection(...messages)
		});

		world({ actors: [plain] });
		expect(populate.hasTestWorld()).toBe(false);
		world({ actors: [plain, flagged] });
		expect(populate.hasTestWorld()).toBe(true);
		world({ messages: [flagged] });
		expect(populate.hasTestWorld()).toBe(true);
		world({ kit: toolkit({ calendar: {} }) });
		expect(populate.hasTestWorld()).toBe(true);
	});
});
