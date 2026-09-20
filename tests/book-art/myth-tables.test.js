import { beforeEach, describe, expect, it, vi } from "vitest";

const book = vi.hoisted(() => ({ path: "mythic-bastionland-art/mythic-bastionland.pdf", reads: 0 }));

vi.mock("../../module/rulebook/store.js", () => ({ rulebookPath: () => book.path }));
vi.mock("../../module/book-art/pdf.js", () => ({
	openPdfUrl: async () => ({
		destroy: () => {},
		getPage: async () => {
			book.reads++;
			return { getTextContent: async () => ({ items: [] }) };
		}
	})
}));

const { peekTable, tableForEntry } = await import("../../module/book-art/myth-tables.js");

describe("tableForEntry", () => {
	beforeEach(() => {
		book.reads = 0;
	});

	it("gives the index's own table without opening the rulebook", async () => {
		const table = { name: "Laws of the Lich", columns: ["A", "B"], rows: [] };
		await expect(tableForEntry({ version: 1 }, { page: 29, table })).resolves.toBe(table);
		expect(book.reads).toBe(0);
	});

	it("leaves an index at the version floor alone", async () => {
		await expect(tableForEntry({ version: 10 }, { page: 31 }, { versionFloor: 10 })).resolves.toBeNull();
		expect(book.reads).toBe(0);
		expect(peekTable(31)).toBeUndefined();
	});

	it("reads each page from the rulebook once, and peeks at it only once read", async () => {
		const reading = tableForEntry({ version: 9 }, { page: 33 }, { versionFloor: 10 });
		expect(peekTable(33)).toBeUndefined();
		await expect(reading).resolves.toBeNull();
		expect(peekTable(33)).toBeNull();
		// With no entry, the page is given on its own; whatever the version, without a floor.
		await tableForEntry({ version: 10 }, null, { page: 33 });
		expect(book.reads).toBe(1);
	});
});
