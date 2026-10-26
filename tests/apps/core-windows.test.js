import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	JOURNAL_CLASS,
	USER_CONFIG_CLASS,
	isKeptJournal,
	isSystemJournal,
	registerCoreWindowSkin,
	skinJournal,
	skinJournalPage,
	skinUserConfig,
	withDialogSkin
} from "../../module/apps/core-windows.js";
import { SYSTEM_ID as ID } from "../../module/system-id.js";

const entry = (flags) => ({ flags: { [ID]: flags } });
const hexJournal = entry({ hexJournal: { scene: "s", hex: "0101" } });
const siteJournal = entry({ siteJournal: { site: "x" } });
const timelineJournal = entry({ timelineJournal: true });

/** A stand-in element: a class list, and the children a selector finds. */
function element(children = {}) {
	const classes = new Set();
	return {
		classList: { add: (...names) => names.forEach((name) => classes.add(name)), contains: (name) => classes.has(name) },
		querySelector: (selector) => children[selector] ?? null,
		classes
	};
}

describe("withDialogSkin", () => {
	it("asks for the system's dialog class", () => {
		expect(withDialogSkin()).toEqual({ classes: ["bastionland-dialog"] });
	});

	it("keeps a caller's own options and classes", () => {
		expect(withDialogSkin({ types: ["knight"], classes: ["mine"] })).toEqual({ types: ["knight"], classes: ["mine", "bastionland-dialog"] });
	});

	it("asks only once", () => {
		const options = { classes: ["bastionland-dialog"] };
		expect(withDialogSkin(options)).toBe(options);
	});
});

describe("which journals are the system's", () => {
	it("knows the hex, Site and Timeline journals, which open in Foundry's journal window", () => {
		expect(isKeptJournal(hexJournal)).toBe(true);
		expect(isKeptJournal(siteJournal)).toBe(true);
		expect(isKeptJournal(timelineJournal)).toBe(true);
		expect(isKeptJournal(entry({ site: {} }))).toBe(false);
		expect(isKeptJournal({ flags: {} })).toBe(false);
		expect(isKeptJournal(null)).toBe(false);
	});

	it("counts Sites and written Myths among the system's entries too", () => {
		expect(isSystemJournal(hexJournal)).toBe(true);
		expect(isSystemJournal(timelineJournal)).toBe(true);
		expect(isSystemJournal(entry({ site: { name: "A" } }))).toBe(true);
		expect(isSystemJournal(entry({ ownMyth: { name: "B" } }))).toBe(true);
		expect(isSystemJournal({ flags: { other: { site: {} } } })).toBe(false);
	});
});

describe("User Configuration", () => {
	it("wears the dialog skin", () => {
		const root = element();
		skinUserConfig({}, root);
		expect([...root.classes]).toEqual(["bastionland-dialog", USER_CONFIG_CLASS]);
	});
});

describe("skinJournal", () => {
	it("dresses a hex journal and its page area", () => {
		const content = element();
		const root = element({ ".journal-entry-content": content });
		skinJournal({ document: hexJournal }, root);
		expect(root.classes.has(JOURNAL_CLASS)).toBe(true);
		expect(content.classes.has("bastionland-page")).toBe(true);
	});

	it("dresses the Timeline, which players read in the Journal sidebar", () => {
		const content = element();
		const root = element({ ".journal-entry-content": content });
		skinJournal({ document: timelineJournal }, root);
		expect(root.classes.has(JOURNAL_CLASS)).toBe(true);
		expect(content.classes.has("bastionland-page")).toBe(true);
	});

	it("leaves the Referee's other journals as Foundry draws them", () => {
		const content = element();
		const root = element({ ".journal-entry-content": content });
		skinJournal({ document: { flags: {} } }, root);
		expect(root.classes.size + content.classes.size).toBe(0);
	});

	// isSystemWindow would otherwise mark the Referee's words with rule popups and rolling dice.
	it("is a class the system's own window test passes by", () => {
		expect(JOURNAL_CLASS.startsWith("bastionland")).toBe(false);
	});
});

describe("skinJournalPage", () => {
	const page = (parent, isView) => ({ isView, document: { parent } });

	it("dresses the window a hex journal's page is edited in", () => {
		const content = element();
		const root = element({ ":scope > .window-content": content });
		skinJournalPage(page(siteJournal, false), root);
		expect(root.classes.has(JOURNAL_CLASS)).toBe(true);
		expect(content.classes.has("bastionland-page")).toBe(true);
	});

	it("leaves a page drawn inside its journal alone", () => {
		const root = element();
		skinJournalPage(page(hexJournal, true), root);
		expect(root.classes.size).toBe(0);
	});

	it("leaves a page of another journal alone", () => {
		const root = element();
		skinJournalPage(page({ flags: {} }, false), root);
		expect(root.classes.size).toBe(0);
	});
});

describe("registerCoreWindowSkin", () => {
	let calls;
	let hooks;

	beforeEach(() => {
		calls = {};
		hooks = {};
		const base = (name) => {
			const cls = class {
				constructor(flags = {}) {
					this.flags = flags;
				}
			};
			cls.createDialog = vi.fn(async (...args) => {
				calls[`${name}.create`] = args;
			});
			cls.prototype.deleteDialog = vi.fn(async function (...args) {
				calls[`${name}.delete`] = args;
			});
			return cls;
		};
		globalThis.Actor = base("Actor");
		globalThis.Item = base("Item");
		globalThis.foundry = { documents: { JournalEntry: base("JournalEntry"), JournalEntryPage: base("JournalEntryPage") } };
		globalThis.Hooks = { on: (name, fn) => (hooks[name] = fn) };
		registerCoreWindowSkin();
	});

	afterEach(() => {
		for (const key of ["Actor", "Item", "foundry", "Hooks"]) delete globalThis[key];
	});

	it("dresses Create Actor and Create Item", async () => {
		await Actor.createDialog({ folder: null }, {}, { types: ["knight"] });
		await Item.createDialog();
		expect(calls["Actor.create"]).toEqual([{ folder: null }, {}, { types: ["knight"], classes: ["bastionland-dialog"] }]);
		expect(calls["Item.create"]).toEqual([undefined, undefined, { classes: ["bastionland-dialog"] }]);
	});

	it("passes render options on", async () => {
		await Item.createDialog({}, { parent: "knight" }, {}, { focus: true });
		expect(calls["Item.create"]).toEqual([{}, { parent: "knight" }, { classes: ["bastionland-dialog"] }, { focus: true }]);
	});

	it("dresses the confirm before deleting an Actor or an Item", async () => {
		await new Actor().deleteDialog();
		await new Item().deleteDialog({ position: { width: 400 } }, { render: false });
		expect(calls["Actor.delete"]).toEqual([{ classes: ["bastionland-dialog"] }]);
		expect(calls["Item.delete"]).toEqual([{ position: { width: 400 }, classes: ["bastionland-dialog"] }, { render: false }]);
	});

	it("dresses the confirm only for the system's own journals", async () => {
		await new foundry.documents.JournalEntry(hexJournal.flags).deleteDialog();
		expect(calls["JournalEntry.delete"]).toEqual([{ classes: ["bastionland-dialog"] }]);
		await new foundry.documents.JournalEntry({}).deleteDialog({ content: "Sure?" });
		expect(calls["JournalEntry.delete"]).toEqual([{ content: "Sure?" }]);
	});

	it("dresses Add Page only in the system's own journals", async () => {
		const { JournalEntryPage } = foundry.documents;
		await JournalEntryPage.createDialog({ sort: 1 }, { parent: hexJournal }, { width: 320 });
		expect(calls["JournalEntryPage.create"]).toEqual([{ sort: 1 }, { parent: hexJournal }, { width: 320, classes: ["bastionland-dialog"] }]);
		await JournalEntryPage.createDialog({ sort: 1 }, { parent: { flags: {} } }, { width: 320 });
		expect(calls["JournalEntryPage.create"]).toEqual([{ sort: 1 }, { parent: { flags: {} } }, { width: 320 }]);
		await JournalEntryPage.createDialog();
		expect(calls["JournalEntryPage.create"]).toEqual([undefined, undefined, undefined]);
	});

	it("dresses Delete Page only in the system's own journals", async () => {
		const { JournalEntryPage } = foundry.documents;
		const page = (parent) => Object.assign(new JournalEntryPage(), { parent });
		await page(timelineJournal).deleteDialog({ position: { top: 10 } });
		expect(calls["JournalEntryPage.delete"]).toEqual([{ position: { top: 10 }, classes: ["bastionland-dialog"] }]);
		await page({ flags: {} }).deleteDialog({ position: { top: 10 } });
		expect(calls["JournalEntryPage.delete"]).toEqual([{ position: { top: 10 } }]);
	});

	it("listens for User Configuration and the journal windows", () => {
		expect(hooks.renderUserConfig).toBe(skinUserConfig);
		expect(hooks.renderJournalEntrySheet).toBe(skinJournal);
		expect(hooks.renderJournalEntryPageSheet).toBe(skinJournalPage);
	});
});
