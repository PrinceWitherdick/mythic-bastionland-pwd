import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The Knight's, the Squire's and the Domain's Timeline page is a part of the
 * sheet's own, put into the slot the sheet's page keeps for it: a write on the
 * Timeline draws only the page, and the sheet's other redraws leave it be.
 */

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

let TimelineTabMixin;

beforeAll(async () => {
	globalThis.foundry = { utils: { debounce: (fn) => fn } };
	({ TimelineTabMixin } = await import("../../module/sheets/timeline-tab.js"));
});

afterAll(() => {
	delete globalThis.foundry;
});

/** As much of a Handlebars actor sheet as the mixin leans on. */
class FakeSheet {
	static PARTS = { sheet: {}, timeline: {} };
	actor = { id: "k1" };
	document = { documentName: "Actor" };
	tabGroups = { primary: "knight" };
	tabs = [{ id: "knight" }, { id: "timeline" }];
	parts = {};
	synced = [];

	_getTabsConfig() {
		return { tabs: this.tabs };
	}

	_configureRenderParts() {
		return { ...this.constructor.PARTS };
	}

	_configureRenderOptions(options) {
		options.parts ??= Object.keys(this._configureRenderParts(options));
	}

	_syncPartState(partId) {
		this.synced.push(partId);
	}
}

const sheet = (drawn = true) => {
	const Sheet = TimelineTabMixin(FakeSheet);
	const made = new Sheet();
	if (drawn) made.parts = { sheet: { isConnected: true }, timeline: { isConnected: true } };
	return made;
};

/** @returns {string[]} The parts a render with these options draws. */
const drawn = (app, options = {}) => {
	app._configureRenderOptions(options);
	return options.parts;
};

describe("a sheet's Timeline part", () => {
	it("is drawn with the sheet the first time, and when the page isn't on the sheet", () => {
		expect(drawn(sheet(false))).toEqual(["sheet", "timeline"]);
		const app = sheet();
		app.parts.timeline.isConnected = false;
		expect(drawn(app)).toEqual(["sheet", "timeline"]);
	});

	it("is left be by the sheet's other redraws, such as a Virtue changing", () => {
		expect(drawn(sheet(), { renderContext: "updateActor", renderData: { system: { virtues: { vig: 3 } } } })).toEqual(["sheet"]);
		expect(drawn(sheet())).toEqual(["sheet"]);
		expect(drawn(sheet(), { renderContext: "updateItem", renderData: { name: "Sword" } })).toEqual(["sheet"]);
	});

	it("is drawn again when the actor is renamed, since the thread is named after them", () => {
		expect(drawn(sheet(), { renderContext: "updateActor", renderData: { name: "Eve" } })).toEqual(["sheet", "timeline"]);
	});

	it("is drawn when asked for, alone, or when the sheet is opened on a page", () => {
		expect(drawn(sheet(), { parts: ["timeline"] })).toEqual(["timeline"]);
		expect(drawn(sheet(), { tab: "knight" })).toEqual(["sheet", "timeline"]);
	});

	it("isn't a part at all on a sheet without the page", () => {
		const app = sheet();
		app.tabs = [{ id: "knight" }];
		expect(Object.keys(app._configureRenderParts({}))).toEqual(["sheet"]);
		expect(drawn(app, { parts: ["timeline"] })).toEqual([]);
	});

	it("is put back into the slot of a sheet part drawn afresh, before that part's scroll is", () => {
		const app = sheet();
		const page = app.parts.timeline;
		const slot = { replaceWith: vi.fn() };
		const fresh = { querySelector: (selector) => (selector === "[data-timeline-slot]" ? slot : null) };
		app._syncPartState("sheet", fresh, {}, {});
		expect(slot.replaceWith).toHaveBeenCalledWith(page);
		expect(app.synced).toEqual(["sheet"]);
		slot.replaceWith.mockClear();
		app._syncPartState("timeline", fresh, {}, {});
		expect(slot.replaceWith).not.toHaveBeenCalled();
	});
});

describe("the sheets' templates", () => {
	it("keep a slot for the page, where they drew it inline", () => {
		for (const file of ["knight-sheet.hbs", "squire-sheet.hbs", "domain-sheet.hbs"]) {
			const template = read(`templates/actor/${file}`);
			expect(template, file).toContain("{{#if tabs.timeline}}<div data-timeline-slot hidden></div>{{/if}}");
			expect(template, file).not.toContain('{{> "bastionland.timeline-tab"}}');
		}
	});

	it("draw it as a part of the Knight's and the Domain's own", () => {
		for (const file of ["KnightSheet.js", "DomainSheet.js"]) {
			expect(read(`module/sheets/${file}`), file).toMatch(/timeline: \{ template: templatePath\("actor\/parts\/timeline-tab\.hbs"\) \}/);
		}
	});
});
