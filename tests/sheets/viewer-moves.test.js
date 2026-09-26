import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const root = join(import.meta.dirname, "../..");
const lang = JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);

let BastionlandActorSheet;
let messages;

/** Just enough of Foundry for the actor sheet to load and a card to post. */
function installFoundryStubs() {
	class ActorSheetV2 {
		/** Foundry's own, which disables every control in the window. */
		_toggleDisabled(disabled) {
			for (const element of this.form.elements) element.disabled = disabled;
		}
	}

	globalThis.foundry = {
		applications: {
			api: { HandlebarsApplicationMixin: (Base) => class extends Base {} },
			sheets: { ActorSheetV2, ItemSheetV2: class {} },
			handlebars: { renderTemplate: vi.fn(async (_path, context) => context) }
		}
	};
	globalThis.game = {
		i18n: {
			localize: (key) => lookup(key) ?? key,
			format: (key, data) => Object.entries(data).reduce((text, [name, value]) => text.replace(`{${name}}`, value), lookup(key) ?? key)
		},
		settings: { get: () => "public" }
	};
	globalThis.ChatMessage = {
		implementation: {
			getSpeaker: ({ actor }) => ({ alias: actor.name }),
			applyMode: () => {},
			create: vi.fn(async (data) => messages.push(data))
		}
	};
}

/** A Knight who knows every Feat, with an update that records what it was asked. */
function knight() {
	return { name: "Sir Ose", update: vi.fn(), system: { fatigued: false, knowsFeat: () => true } };
}

beforeEach(async () => {
	messages = [];
	installFoundryStubs();
	vi.resetModules();
	({ BastionlandActorSheet } = await import("../../module/sheets/BastionlandActorSheet.js"));
});

afterEach(() => {
	delete globalThis.foundry;
	delete globalThis.game;
	delete globalThis.ChatMessage;
});

describe("buttons that only post to chat", () => {
	const templates = ["actor/parts/feat-list.hbs", "actor/parts/gambit-list.hbs", "actor/parts/item-row.hbs"];
	const buttons = templates.flatMap((file) =>
		readFileSync(join(root, "templates", file), "utf8").match(/<button\b[^>]*data-action="(?:performFeat|postGambit|postItem)"[^>]*>/g));

	it("are marked for viewers to keep", () => {
		// An item row has two: its own, and the one before a table's die sat inside the aside.
		expect(buttons).toHaveLength(4);
		for (const button of buttons) {
			expect(button).toContain("data-viewable");
			expect(button).not.toContain("disabled");
		}
	});
});

describe("a sheet the user can only view", () => {
	it("keeps the rows that post to chat live, and nothing else", () => {
		const viewable = { dataset: { viewable: "" }, disabled: false };
		const edit = { dataset: {}, disabled: false };
		const sheet = Object.create(BastionlandActorSheet.prototype);
		Object.defineProperty(sheet, "form", {
			value: { elements: [viewable, edit], querySelectorAll: () => [viewable] }
		});

		sheet._toggleDisabled(true);
		expect(viewable.disabled).toBe(false);
		expect(edit.disabled).toBe(true);
	});

	it("shows a Feat without making its Save", async () => {
		const actor = knight();
		const performFeat = BastionlandActorSheet.DEFAULT_OPTIONS.actions.performFeat;
		await performFeat.call({ isEditable: false, actor }, null, { dataset: { feat: "smite" } });

		expect(actor.update).not.toHaveBeenCalled();
		expect(messages).toHaveLength(1);
		expect(messages[0].rolls).toEqual([]);
		expect(messages[0].content.feat).toEqual({
			name: "Smite",
			tagline: lookup("bastionland.feats.smite.tagline"),
			use: lookup("bastionland.feats.smite.use"),
			cost: "VIG Save or become Fatigued."
		});
	});

	it("shows nothing for a Feat the actor can't perform", async () => {
		const actor = { ...knight(), system: { knowsFeat: (key) => key === "deny" } };
		const performFeat = BastionlandActorSheet.DEFAULT_OPTIONS.actions.performFeat;
		await performFeat.call({ isEditable: false, actor }, null, { dataset: { feat: "smite" } });
		expect(messages).toHaveLength(0);
	});
});
