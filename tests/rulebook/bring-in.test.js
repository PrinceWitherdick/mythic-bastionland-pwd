import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/book-art/importer.js", () => ({
	chooseRulebookPdf: vi.fn(async () => null),
	importBookArt: vi.fn(async () => ({ imported: true }))
}));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: vi.fn(async () => ({ version: 1 })) }));
vi.mock("../../module/rules/book-art.js", () => ({ INDEX_VERSION: 16 }));
vi.mock("../../module/rulebook/BookReader.js", () => ({ openReader: vi.fn(() => ({ reload: vi.fn() })) }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/rulebook/store.js", () => ({
	keepRulebook: vi.fn(async () => "book/rulebook.pdf"),
	fetchRulebook: vi.fn(async () => new File(["%PDF"], "kept.pdf", { type: "application/pdf" })),
	foundRulebook: vi.fn(() => "pending"),
	hasRulebook: vi.fn(() => true),
	importedVersion: vi.fn(() => 0),
	setFoundRulebook: vi.fn(async () => {}),
	fetchKeptRulebook: vi.fn(async () => ({ file: new File(["%PDF"], "kept.pdf", { type: "application/pdf" }), missing: false })),
	rulebookPath: vi.fn(() => "book/rulebook.pdf"),
	missingRulebook: vi.fn(() => ""),
	setMissingRulebook: vi.fn(async () => {}),
	rereadingBy: vi.fn(() => ({})),
	setRereadingBy: vi.fn(async () => {})
}));

const { chooseRulebookPdf, importBookArt } = await import("../../module/book-art/importer.js");
const { openReader } = await import("../../module/rulebook/BookReader.js");
const { loadArtIndex } = await import("../../module/book-art/art-index.js");
const {
	fetchKeptRulebook,
	foundRulebook,
	hasRulebook,
	importedVersion,
	keepRulebook,
	missingRulebook,
	rereadingBy,
	setFoundRulebook,
	setMissingRulebook,
	setRereadingBy
} = await import("../../module/rulebook/store.js");
const { adoptKeptRulebook, bringInRulebook, importFoundRulebook, rereadOldImport } = await import("../../module/rulebook/bring-in.js");

const pdf = () => new File(["%PDF"], "rulebook.pdf", { type: "application/pdf" });

afterEach(() => vi.clearAllMocks());

describe("bringInRulebook", () => {
	it("keeps the copy to read before importing the art and tables", async () => {
		const file = pdf();
		await expect(bringInRulebook(file)).resolves.toEqual({ imported: true });
		expect(keepRulebook).toHaveBeenCalledWith(file);
		expect(importBookArt).toHaveBeenCalledWith(file);
		expect(keepRulebook.mock.invocationCallOrder[0]).toBeLessThan(importBookArt.mock.invocationCallOrder[0]);
		expect(openReader).toHaveBeenCalled();
		expect(chooseRulebookPdf).not.toHaveBeenCalled();
	});

	it("asks for the PDF when it's given none", async () => {
		const file = pdf();
		chooseRulebookPdf.mockResolvedValueOnce(file);
		await bringInRulebook();
		expect(keepRulebook).toHaveBeenCalledWith(file);
		expect(importBookArt).toHaveBeenCalledWith(file);
	});

	it("does nothing at all when the GM backs out", async () => {
		await expect(bringInRulebook()).resolves.toBeNull();
		expect(keepRulebook).not.toHaveBeenCalled();
		expect(importBookArt).not.toHaveBeenCalled();
	});

	it("imports even when the copy couldn't be kept, leaving the reader as it was", async () => {
		keepRulebook.mockResolvedValueOnce(null);
		await bringInRulebook(pdf());
		expect(openReader).not.toHaveBeenCalled();
		expect(importBookArt).toHaveBeenCalled();
	});
});

describe("importFoundRulebook", () => {
	it("marks the found book done once it's imported", async () => {
		await expect(importFoundRulebook()).resolves.toEqual({ imported: true });
		expect(setFoundRulebook).toHaveBeenCalledWith("done");
	});

	it("gives up on it, rather than trying every load, when nothing could be read", async () => {
		importBookArt.mockResolvedValueOnce(null);
		await expect(importFoundRulebook()).resolves.toBeNull();
		expect(setFoundRulebook).toHaveBeenCalledWith("");
	});

	it("leaves it pending, to try again next load, when the import throws", async () => {
		importBookArt.mockRejectedValueOnce(new Error("unreadable"));
		await expect(importFoundRulebook()).rejects.toThrow("unreadable");
		expect(setFoundRulebook).not.toHaveBeenCalled();
	});

	it("runs once when called again while it runs, as the Welcome and a load can", async () => {
		const first = importFoundRulebook();
		const second = importFoundRulebook();
		expect(second).toBe(first);
		await first;
		expect(importBookArt).toHaveBeenCalledTimes(1);
		await importFoundRulebook();
		expect(importBookArt).toHaveBeenCalledTimes(2);
	});
});

describe("adoptKeptRulebook", () => {
	let activeGM;

	beforeEach(() => {
		activeGM = { isSelf: true };
		globalThis.game = { user: { isGM: true }, users: { get activeGM() { return activeGM; } } };
		globalThis.ui = { notifications: { info: vi.fn() } };
	});

	afterEach(() => {
		delete globalThis.game;
		delete globalThis.ui;
	});

	it("imports the kept book in a world the Welcome no longer greets", async () => {
		await expect(adoptKeptRulebook(() => false)).resolves.toBe(true);
		expect(ui.notifications.info).toHaveBeenCalledWith("rulebook.adopted");
		expect(importBookArt).toHaveBeenCalled();
		expect(setFoundRulebook).toHaveBeenCalledWith("done");
	});

	it("leaves the import to the Welcome in a world it greets", async () => {
		await adoptKeptRulebook(() => true);
		expect(importBookArt).not.toHaveBeenCalled();
	});

	it("says nothing when the world has no book to import, as after a Forget", async () => {
		hasRulebook.mockReturnValueOnce(false);
		await adoptKeptRulebook(() => false);
		expect(ui.notifications.info).not.toHaveBeenCalled();
		expect(importBookArt).not.toHaveBeenCalled();
	});

	it("logs a failed import rather than throwing it into the load", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		importBookArt.mockRejectedValueOnce(new Error("unreadable"));
		await expect(adoptKeptRulebook(() => false)).resolves.toBe(true);
		expect(error).toHaveBeenCalled();
		expect(setFoundRulebook).not.toHaveBeenCalled();
		error.mockRestore();
	});

	it("does nothing more when no book was found", async () => {
		foundRulebook.mockReturnValueOnce("");
		await expect(adoptKeptRulebook(() => false)).resolves.toBe(false);
		expect(importBookArt).not.toHaveBeenCalled();
		expect(ui.notifications.info).not.toHaveBeenCalled();
	});

	it("is left to the active GM", async () => {
		activeGM = { isSelf: false };
		await adoptKeptRulebook(() => false);
		globalThis.game.user.isGM = false;
		activeGM = { isSelf: true };
		await adoptKeptRulebook(() => false);
		expect(ui.notifications.info).not.toHaveBeenCalled();
		expect(importBookArt).not.toHaveBeenCalled();
	});
});

describe("rereadOldImport", () => {
	let activeGM;

	beforeEach(() => {
		activeGM = { isSelf: true };
		globalThis.game = { user: { id: "me", isGM: true }, users: { get activeGM() { return activeGM; } }, time: { serverTime: 1_000_000_000 } };
		globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
		foundRulebook.mockReturnValue("");
	});

	afterEach(() => {
		foundRulebook.mockReturnValue("pending");
		delete globalThis.game;
		delete globalThis.ui;
	});

	it("reads the kept book again for a world an older Import PDF last read it for", async () => {
		importedVersion.mockReturnValueOnce(15);
		await rereadOldImport(() => false);
		expect(ui.notifications.info).toHaveBeenCalledWith("rulebook.reread");
		expect(importBookArt).toHaveBeenCalledWith(expect.any(File), { again: true });
	});

	it("reads it again for a world that imported before the version was kept", async () => {
		await rereadOldImport(() => false);
		expect(importBookArt).toHaveBeenCalled();
	});

	it("leaves a world this version already read it for", async () => {
		importedVersion.mockReturnValueOnce(16);
		await rereadOldImport(() => false);
		expect(importBookArt).not.toHaveBeenCalled();
		expect(ui.notifications.info).not.toHaveBeenCalled();
	});

	it("leaves a book no import has read, rather than importing one the Referee only reads", async () => {
		loadArtIndex.mockResolvedValueOnce(null);
		await rereadOldImport(() => false);
		expect(importBookArt).not.toHaveBeenCalled();
	});

	it("leaves a world with no book, a found book still pending, and one the Welcome greets", async () => {
		hasRulebook.mockReturnValueOnce(false);
		await rereadOldImport(() => false);
		foundRulebook.mockReturnValueOnce("pending");
		await rereadOldImport(() => false);
		await rereadOldImport(() => true);
		expect(importBookArt).not.toHaveBeenCalled();
	});

	it("is left to the active GM", async () => {
		activeGM = { isSelf: false };
		await rereadOldImport(() => false);
		expect(importBookArt).not.toHaveBeenCalled();
	});

	it("logs a failed import rather than throwing it into the load", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		importBookArt.mockRejectedValueOnce(new Error("unreadable"));
		await expect(rereadOldImport(() => false)).resolves.toBeUndefined();
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});

	it("marks the world as being read again by this Referee, and clears the mark after", async () => {
		rereadingBy.mockReturnValueOnce({}).mockReturnValueOnce({ user: "me", at: 1 });
		await rereadOldImport(() => false);
		expect(setRereadingBy).toHaveBeenNthCalledWith(1, { user: "me", at: 1_000_000_000 });
		expect(setRereadingBy).toHaveBeenLastCalledWith({});
	});

	it("leaves it to another Referee already reading it, as one who became the active GM since", async () => {
		rereadingBy.mockReturnValueOnce({ user: "assistant", at: 1_000_000_000 - 60_000 });
		await rereadOldImport(() => false);
		expect(importBookArt).not.toHaveBeenCalled();
		expect(setRereadingBy).not.toHaveBeenCalled();
	});

	it("takes over from a re-read that has long gone quiet", async () => {
		rereadingBy.mockReturnValueOnce({ user: "assistant", at: 1_000_000_000 - 60 * 60_000 });
		await rereadOldImport(() => false);
		expect(importBookArt).toHaveBeenCalled();
	});

	it("says once that the kept book is gone, without saying it's reading it, and doesn't look again", async () => {
		fetchKeptRulebook.mockResolvedValueOnce({ file: null, missing: true });
		await rereadOldImport(() => false);
		expect(ui.notifications.warn).toHaveBeenCalledWith("rulebook.rereadMissing");
		expect(ui.notifications.info).not.toHaveBeenCalled();
		expect(setMissingRulebook).toHaveBeenCalledWith("book/rulebook.pdf");
		missingRulebook.mockReturnValueOnce("book/rulebook.pdf");
		await rereadOldImport(() => false);
		expect(fetchKeptRulebook).toHaveBeenCalledTimes(1);
		expect(importBookArt).not.toHaveBeenCalled();
	});

	it("looks again next load when the book couldn't be fetched just now", async () => {
		fetchKeptRulebook.mockResolvedValueOnce({ file: null, missing: false });
		await rereadOldImport(() => false);
		expect(ui.notifications.warn).not.toHaveBeenCalled();
		expect(ui.notifications.info).not.toHaveBeenCalled();
		expect(setMissingRulebook).not.toHaveBeenCalled();
	});
});
