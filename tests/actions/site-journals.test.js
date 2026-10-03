import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptySite, normaliseSite } from "../../module/rules/sites.js";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/chat/cards.js", () => ({
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key),
	warn: vi.fn()
}));

const { deleteSiteJournals, siteJournalEntry, syncSiteJournal } = await import("../../module/actions/site-journals.js");

// Invented words, so no book text lives in the repository.
const SECRET = "Eels in the nave";

/** A Journal entry whose writes land on it. */
function fakeEntry(data) {
	const getFlag = (source) => (scope, key) => source.flags?.[scope]?.[key];
	const entry = {
		...data,
		id: data.id ?? `e${game.journal.length}`,
		ownership: { ...data.ownership },
		pages: (data.pages ?? []).map((page, index) => ({ ...page, id: `p${index}`, text: { ...page.text }, getFlag: getFlag(page) })),
		getFlag: getFlag(data),
		update: vi.fn(async (changes) => {
			for (const [path, value] of Object.entries(changes)) foundry.utils.setProperty(entry, path, value);
		}),
		createEmbeddedDocuments: vi.fn(),
		updateEmbeddedDocuments: vi.fn(async (_type, updates) => {
			for (const { _id, text } of updates) Object.assign(entry.pages.find((page) => page.id === _id).text, text);
		})
	};
	return entry;
}

/** A Site's own entry, as New Site makes it. */
const siteEntry = (site) => fakeEntry({ id: "site1", name: "The Chapel", flags: { [SYSTEM_ID]: { site } } });

const drawn = () => normaliseSite({ points: { centre: { kind: "danger", number: 1, text: SECRET } } });

beforeEach(() => {
	const folders = [];
	const journal = [];
	journal.has = (id) => journal.some((entry) => entry.id === id);
	globalThis.game = {
		user: { isGM: true },
		users: { activeGM: { isSelf: true } },
		settings: { get: () => true },
		journal,
		folders
	};
	folders.find = Array.prototype.find.bind(folders);
	globalThis.foundry = {
		utils: {
			setProperty: (object, path, value) => {
				const keys = path.split(".");
				const last = keys.pop();
				let target = object;
				for (const key of keys) target = target[key] ??= {};
				target[last] = value;
			},
			getDocumentClass: (name) => (name === "Folder"
				? { create: vi.fn(async (data) => {
					const folder = { ...data, id: "f1", getFlag: (scope, key) => data.flags?.[scope]?.[key] };
					folders.push(folder);
					return folder;
				}),
				deleteDocuments: vi.fn(async (ids) => {
					for (const id of ids) folders.splice(folders.findIndex((folder) => folder.id === id), 1);
				}) }
				: {
					create: vi.fn(async (data) => {
						const entry = fakeEntry(data);
						game.journal.push(entry);
						return entry;
					}),
					deleteDocuments: vi.fn(async (ids) => {
						for (const id of ids) game.journal.splice(game.journal.findIndex((entry) => entry.id === id), 1);
					})
				})
		}
	};
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.foundry;
	vi.clearAllMocks();
});

describe("syncSiteJournal", () => {
	it("makes nothing for a blank Site", async () => {
		const site = siteEntry(emptySite());
		game.journal.push(site);
		await syncSiteJournal(site);
		expect(game.journal).toHaveLength(1);
	});

	it("makes a hidden entry for a Site with something drawn, in its folder", async () => {
		const site = siteEntry(drawn());
		game.journal.push(site);
		await syncSiteJournal(site);
		const entry = siteJournalEntry(site);
		expect(entry).toBeTruthy();
		expect(entry.name).toBe("The Chapel");
		expect(entry.folder).toBe("f1");
		expect(entry.ownership.default).toBe(0);
		expect(entry.flags[SYSTEM_ID].siteJournal).toEqual({ site: "site1" });
		const [whole, found, notes] = entry.pages;
		expect(whole.text.markdown).toContain(SECRET);
		expect(found.text.markdown).not.toContain(SECRET);
		expect(found.ownership.default).toBe(2);
		expect(notes.text.markdown).toBe("");
	});

	it("writes nothing the second time, then only what changed, and follows a rename", async () => {
		const site = siteEntry(drawn());
		game.journal.push(site);
		await syncSiteJournal(site);
		const entry = siteJournalEntry(site);
		await syncSiteJournal(site);
		expect(entry.update).not.toHaveBeenCalled();
		expect(entry.updateEmbeddedDocuments).not.toHaveBeenCalled();

		site.flags[SYSTEM_ID].site = normaliseSite({ points: { centre: { kind: "danger", number: 1, text: SECRET, found: true } } });
		site.name = "The Sunken Chapel";
		await syncSiteJournal(site);
		expect(entry.update).toHaveBeenCalledWith({ name: "The Sunken Chapel" });
		expect(entry.updateEmbeddedDocuments.mock.calls[0][1].map((update) => update._id)).toEqual(["p0", "p1"]);
		expect(entry.pages[1].text.markdown).toContain("sites.map.point");
	});

	it("leaves it to the active GM, and to worlds that want entries", async () => {
		const site = siteEntry(drawn());
		game.journal.push(site);
		game.users.activeGM = { isSelf: false };
		await syncSiteJournal(site);
		expect(game.journal).toHaveLength(1);
		game.users.activeGM = { isSelf: true };
		game.settings.get = () => false;
		await syncSiteJournal(site);
		expect(game.journal).toHaveLength(1);
	});
});

describe("deleteSiteJournals", () => {
	it("keeps a journal the GM has written Notes in, when asked to", async () => {
		const site = siteEntry(drawn());
		game.journal.push(site);
		await syncSiteJournal(site);
		const entry = siteJournalEntry(site);
		entry.pages[2].text.markdown = "Remember the eels.";
		expect(await deleteSiteJournals(["site1"], { keepNotes: true })).toBe(0);
		entry.pages[2].text.markdown = "";
		expect(await deleteSiteJournals(["site1"], { keepNotes: true })).toBe(1);
		expect(siteJournalEntry(site)).toBeNull();
		// Nothing is left in the folder, so it goes too.
		expect(game.folders).toHaveLength(0);
	});
});
