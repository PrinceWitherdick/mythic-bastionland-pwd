import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key, warn: vi.fn() }));

const { tidyKeptJournals } = await import("../../module/actions/kept-journals.js");

/** A Journal entry whose page writes are only recorded. */
function fakeEntry(flags, pages) {
	return {
		flags: { [SYSTEM_ID]: flags },
		pages: pages.map(({ role, ...page }, index) => ({
			id: `p${index}`,
			name: "",
			...page,
			getFlag: (scope, key) => (scope === SYSTEM_ID && key === "role" ? role : undefined)
		})),
		updateEmbeddedDocuments: vi.fn(async () => {}),
		deleteEmbeddedDocuments: vi.fn(async () => {})
	};
}

beforeEach(() => {
	globalThis.foundry = {
		utils: { cleanHTML: (html) => html },
		applications: { sheets: { journal: { JournalEntryPageTextSheet: { _converter: { makeHtml: (markdown) => `<p>${markdown}</p>` } } } } }
	};
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.foundry;
});

describe("tidyKeptJournals", () => {
	it("takes a hex entry's Rolled page away, names its Notes the GM Notes, and gives a page with nothing to show its HTML", async () => {
		const entry = fakeEntry({ hexJournal: { scene: "realm", hex: "3,3" } }, [
			{ role: "rolled", text: { markdown: "old", content: "<p>old</p>" } },
			{ role: "known", text: { markdown: "seen" } },
			{ role: "notes", name: "hexJournal.pages.notesWas", text: { markdown: "mine", content: "<p>mine</p>" } }
		]);
		globalThis.game = { journal: [entry] };
		await tidyKeptJournals();
		expect(entry.deleteEmbeddedDocuments).toHaveBeenCalledWith("JournalEntryPage", ["p0"]);
		expect(entry.updateEmbeddedDocuments).toHaveBeenCalledWith("JournalEntryPage", [
			{ _id: "p1", "text.content": "<p>seen</p>" },
			{ _id: "p2", name: "hexJournal.pages.notes" }
		]);
	});

	it("leaves a Notes page the GM renamed, an empty page, and entries the system doesn't keep", async () => {
		const hex = fakeEntry({ hexJournal: { scene: "realm", hex: "3,3" } }, [
			{ role: "known", text: { markdown: "seen", content: "<p>seen</p>" } },
			{ role: "notes", name: "Rumours", text: { markdown: "" } }
		]);
		const site = fakeEntry({ siteJournal: { site: "s1" } }, [{ role: "rolled", text: { markdown: "a point" } }]);
		const other = fakeEntry({}, [{ role: "rolled", text: { markdown: "theirs" } }]);
		globalThis.game = { journal: [hex, site, other] };
		await tidyKeptJournals();
		expect(hex.updateEmbeddedDocuments).not.toHaveBeenCalled();
		expect(hex.deleteEmbeddedDocuments).not.toHaveBeenCalled();
		// Only a hex entry ever had a Rolled page; a Site's page of that name just gets its HTML.
		expect(site.deleteEmbeddedDocuments).not.toHaveBeenCalled();
		expect(site.updateEmbeddedDocuments).toHaveBeenCalledWith("JournalEntryPage", [{ _id: "p0", "text.content": "<p>a point</p>" }]);
		expect(other.updateEmbeddedDocuments).not.toHaveBeenCalled();
	});
});
