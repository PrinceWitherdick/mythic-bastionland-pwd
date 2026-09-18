import { afterEach, describe, expect, it } from "vitest";
import { VIEWER_PATH, isPdfPath, looksLikeTheRulebook, pageReferences, readerPage, rulebookViewerUrl, zoomStepTarget } from "../../module/rules/rulebook.js";

describe("pageReferences", () => {
	it("finds a cited page and where it sits", () => {
		const text = "write them here (p16).";
		expect(pageReferences(text)).toEqual([{ index: 17, length: 3, page: 16 }]);
	});

	it("finds each of several, and takes a span's first page", () => {
		expect(pageReferences("Knighthood (pp6–7) and Glory (p6), Omens (p18-19)").map(({ page }) => page)).toEqual([6, 6, 18]);
		expect(pageReferences("(pp6–7)")[0].length).toBe(5);
	});

	it("leaves words and numbers past the book alone", () => {
		expect(pageReferences("top12 step3 p0 p999 map")).toEqual([]);
		expect(pageReferences(null)).toEqual([]);
	});
});

describe("rulebookViewerUrl", () => {
	afterEach(() => {
		delete globalThis.foundry;
	});

	it("is empty without a path", () => {
		expect(rulebookViewerUrl("")).toBe("");
		expect(rulebookViewerUrl("   ")).toBe("");
		expect(rulebookViewerUrl(null)).toBe("");
	});

	it("opens a Data path in Foundry's viewer", () => {
		expect(rulebookViewerUrl("mythic-bastionland-book/mythic-bastionland.pdf"))
			.toBe(`/${VIEWER_PATH}?file=%2Fmythic-bastionland-book%2Fmythic-bastionland.pdf`);
	});

	it("resolves both the viewer and the file against the route prefix", () => {
		globalThis.foundry = { utils: { getRoute: (path) => `/vtt/${path}` } };
		const url = new URL(rulebookViewerUrl("/books/mb.pdf"), "https://example.com");
		expect(url.pathname).toBe(`/vtt/${VIEWER_PATH}`);
		expect(url.searchParams.get("file")).toBe("/vtt/books/mb.pdf");
	});

	it("escapes a filename holding spaces and an ampersand", () => {
		const url = new URL(rulebookViewerUrl("books/Mythic Bastionland & Maps.pdf"), "https://example.com");
		expect(url.searchParams.get("file")).toBe("/books/Mythic Bastionland & Maps.pdf");
		expect([...url.searchParams.keys()]).toEqual(["file"]);
	});

	it("leaves a URL from elsewhere alone", () => {
		const url = new URL(rulebookViewerUrl("https://files.example.com/mb.pdf"), "https://example.com");
		expect(url.searchParams.get("file")).toBe("https://files.example.com/mb.pdf");
	});

	it("opens at a page in the hash", () => {
		expect(rulebookViewerUrl("mb.pdf", { page: 172 })).toMatch(/#page=172$/);
		expect(rulebookViewerUrl("mb.pdf", { page: 8.6 })).toMatch(/#page=8$/);
		expect(rulebookViewerUrl("mb.pdf", { page: 0 })).not.toContain("#");
	});
});

describe("readerPage", () => {
	it("takes whole pages from 1 up", () => {
		expect(readerPage(28)).toBe(28);
		expect(readerPage("31")).toBe(31);
		expect(readerPage(12.9)).toBe(12);
	});

	it("refuses anything else", () => {
		for (const page of [0, -3, NaN, "cover", undefined, null]) expect(readerPage(page)).toBeNull();
	});
});

describe("looksLikeTheRulebook", () => {
	it("matches the page count this system's page numbers come from", () => {
		expect(looksLikeTheRulebook(212)).toBe(true);
		expect(looksLikeTheRulebook(106)).toBe(false);
	});
});

describe("isPdfPath", () => {
	it("goes by the extension", () => {
		expect(isPdfPath("books/Mythic_Bastionland.PDF")).toBe(true);
		expect(isPdfPath("books/mb.pdf?v=2")).toBe(true);
		expect(isPdfPath("books/mb.pdf.txt")).toBe(false);
		expect(isPdfPath("")).toBe(false);
	});
});

describe("emptySlot", async () => {
	const { emptySlot } = await import("../../module/actions/hotbar-macro.js");

	it("takes the first empty slot on the first hotbar page", () => {
		expect(emptySlot({}, "rb")).toBe(1);
		expect(emptySlot({ 1: "a", 2: "b", 4: "c" }, "rb")).toBe(3);
	});

	it("leaves a hotbar alone when the macro is already on it or the first page is full", () => {
		expect(emptySlot({ 17: "rb" }, "rb")).toBeNull();
		const full = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, `m${index}`]));
		expect(emptySlot(full, "rb")).toBeNull();
	});
});

describe("zoomStepTarget", () => {
	it("steps ten points from a round scale", () => {
		expect(zoomStepTarget(1, 1)).toBe(1.1);
		expect(zoomStepTarget(1, -1)).toBe(0.9);
		expect(zoomStepTarget(1.3, 1)).toBe(1.4);
		expect(zoomStepTarget(0.7, -1)).toBe(0.6);
	});

	it("tidies a fitted scale onto the grid in the direction of travel", () => {
		expect(zoomStepTarget(0.63, 1)).toBe(0.7);
		expect(zoomStepTarget(0.63, -1)).toBe(0.6);
	});
});
