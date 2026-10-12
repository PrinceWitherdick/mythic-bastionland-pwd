import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/book-art/importer.js", () => ({
	chooseRulebookPdf: vi.fn(async () => null),
	importBookArt: vi.fn(async () => ({ imported: true }))
}));
vi.mock("../../module/rulebook/BookReader.js", () => ({ openReader: vi.fn(() => ({ reload: vi.fn() })) }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/rulebook/store.js", () => ({
	keepRulebook: vi.fn(async () => "book/rulebook.pdf"),
	fetchRulebook: vi.fn(async () => new File(["%PDF"], "kept.pdf", { type: "application/pdf" })),
	foundRulebook: vi.fn(() => "pending"),
	hasRulebook: vi.fn(() => true),
	setFoundRulebook: vi.fn(async () => {})
}));

const { chooseRulebookPdf, importBookArt } = await import("../../module/book-art/importer.js");
const { openReader } = await import("../../module/rulebook/BookReader.js");
const { foundRulebook, hasRulebook, keepRulebook, setFoundRulebook } = await import("../../module/rulebook/store.js");
const { adoptKeptRulebook, bringInRulebook, importFoundRulebook } = await import("../../module/rulebook/bring-in.js");

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

	it("gives up on it, rather than trying every load, when the import fails", async () => {
		importBookArt.mockRejectedValueOnce(new Error("unreadable"));
		await expect(importFoundRulebook()).rejects.toThrow("unreadable");
		expect(setFoundRulebook).toHaveBeenCalledWith("");
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
		await adoptKeptRulebook(() => false);
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
		await expect(adoptKeptRulebook(() => false)).resolves.toBeUndefined();
		expect(error).toHaveBeenCalled();
		expect(setFoundRulebook).toHaveBeenCalledWith("");
		error.mockRestore();
	});

	it("does nothing more when no book was found", async () => {
		foundRulebook.mockReturnValueOnce("");
		await adoptKeptRulebook(() => false);
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
