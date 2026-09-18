import { beforeEach, describe, expect, it, vi } from "vitest";

let BastionlandItemSheet;
let actor;
let renders;

/**
 * Just enough of Foundry for the item sheet to load and open. The stub sheet
 * stands in for Foundry's, which is what turns a submitted form into either an
 * update or a creation.
 */
function installFoundryStubs() {
	class ItemSheetV2 {
		constructor(options = {}) {
			this.options = options;
			this.document = options.document;
		}

		get item() {
			return this.document;
		}

		render(options) {
			renders.push({ sheet: this, options });
			return this;
		}

		_prepareSubmitData(_event, _form, formData) {
			return { ...formData };
		}
	}

	globalThis.foundry = {
		applications: {
			api: { HandlebarsApplicationMixin: (Base) => class extends Base {} },
			sheets: { ItemSheetV2 },
			ux: { TextEditor: { implementation: { enrichHTML: async (html) => html ?? "" } } }
		}
	};
	globalThis.game = { i18n: { localize: (key) => key } };
	globalThis.Item = {
		implementation: class Item {
			static defaultName({ type }) {
				return `New ${type}`;
			}

			constructor(data, { parent } = {}) {
				Object.assign(this, data);
				this.parent = parent;
				this.system = {};
			}
		}
	};
}

beforeEach(async () => {
	renders = [];
	actor = { name: "Ser Test", createEmbeddedDocuments: vi.fn() };
	installFoundryStubs();
	vi.resetModules();
	({ BastionlandItemSheet } = await import("../../module/sheets/BastionlandItemSheet.js"));
});

describe("adding an item from a + button", () => {
	it("opens a sheet without putting anything on the actor", () => {
		const sheet = BastionlandItemSheet.openNew(actor, "weapon");

		expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
		expect(renders).toHaveLength(1);
		expect(renders[0].sheet).toBe(sheet);
		expect(sheet.item.type).toBe("weapon");
		expect(sheet.item.name).toBe("New weapon");
		expect(sheet.item.parent).toBe(actor);
		expect(sheet.isNew).toBe(true);
	});

	it("waits for a save rather than writing every keystroke", () => {
		const { options } = BastionlandItemSheet.openNew(actor, "armour");

		expect(options.canCreate).toBe(true);
		expect(options.form.submitOnChange).toBe(false);
		expect(options.form.closeOnSubmit).toBe(true);
	});

	it("submits the item's type, which the form has no field for", () => {
		const sheet = BastionlandItemSheet.openNew(actor, "gear");

		expect(sheet._prepareSubmitData(null, null, { name: "Rope" })).toEqual({ name: "Rope", type: "gear" });
	});

	it("leaves the type out when saving an item the actor already has", () => {
		const sheet = new BastionlandItemSheet({ document: { id: "abc123", type: "weapon" } });

		expect(sheet.isNew).toBe(false);
		expect(sheet._prepareSubmitData(null, null, { name: "Polished mace" })).toEqual({ name: "Polished mace" });
	});
});
