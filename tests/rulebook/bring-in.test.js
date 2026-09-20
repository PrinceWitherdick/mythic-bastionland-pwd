import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/book-art/importer.js", () => ({
	chooseRulebookPdf: vi.fn(async () => null),
	importBookArt: vi.fn(async () => ({ imported: true }))
}));
vi.mock("../../module/rulebook/BookReader.js", () => ({ openReader: vi.fn(() => ({ reload: vi.fn() })) }));
vi.mock("../../module/rulebook/store.js", () => ({ keepRulebook: vi.fn(async () => "book/rulebook.pdf") }));

const { chooseRulebookPdf, importBookArt } = await import("../../module/book-art/importer.js");
const { openReader } = await import("../../module/rulebook/BookReader.js");
const { keepRulebook } = await import("../../module/rulebook/store.js");
const { bringInRulebook } = await import("../../module/rulebook/bring-in.js");

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
