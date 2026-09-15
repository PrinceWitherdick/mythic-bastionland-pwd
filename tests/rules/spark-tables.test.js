import { describe, expect, it } from "vitest";
import { buildIndex } from "../../module/rules/book-art.js";
import { SPARK_PAGES, sparkPrompt, sparkTablesFromItems } from "../../module/rules/spark-tables.js";

// Table names and entries here are invented so no book text lives in the repository.

/** A pdf.js text item at a font size and baseline. */
const item = (str, size, x, y, width = str.length * size * 0.5) => ({ str, transform: [size, 0, 0, size, x, y], width });

/**
 * One table set the way the Spark Table pages set theirs: a title in capitals,
 * two column headings below it, then twelve numbered rows.
 * @param {string} title
 * @param {string[]} headings
 * @param {number} x Where the row numbers stand.
 * @param {number} y The title's baseline.
 * @param {object} [options]
 * @param {number} [options.skipRow] A row to leave out.
 */
function table(title, [left, right], x, y, { skipRow = null } = {}) {
	const items = [item(title, 10, x + 50, y), item(left, 10, x + 20, y - 12.4), item(right, 10, x + 85, y - 12.4)];
	for (let row = 1; row <= 12; row++) {
		if (row === skipRow) continue;
		const rowY = y - 12.4 * (row + 1);
		items.push(
			item(String(row), 10, row < 10 ? x : x - 3, rowY),
			item(`${left}${row}`, 10, x + 25, rowY + 0.1),
			item(`${right}${row}`, 10, x + 90, rowY + 0.1)
		);
	}
	return items;
}

const pageHeading = [
	item("22", 22, 21, 21),
	item("Musings", 54, 234, 678),
	item("Roll on a table and see what it suggests.", 11, 70, 655)
];

describe("sparkTablesFromItems", () => {
	it("reads every table on the page in reading order", () => {
		const page = sparkTablesFromItems([
			...pageHeading,
			...table("OLD HALL", ["Mood", "Sound"], 77, 432),
			...table("BRAMBLE", ["Kind", "Growth"], 236, 614),
			...table("GLOOM", ["Hue", "Shape"], 77, 614)
		]);

		expect(page.name).toBe("Musings");
		expect(page.unread).toEqual([]);
		expect(page.tables.map((spark) => spark.name)).toEqual(["Gloom", "Bramble", "Old Hall"]);

		const [gloom, , hall] = page.tables;
		expect(gloom.columns).toEqual(["Hue", "Shape"]);
		expect(gloom.rows).toHaveLength(12);
		expect(gloom.rows[0]).toEqual(["Hue1", "Shape1"]);
		expect(gloom.rows[11]).toEqual(["Hue12", "Shape12"]);
		expect(hall.rows[4]).toEqual(["Mood5", "Sound5"]);
	});

	it("leaves out a table with a row missing, and names it", () => {
		const page = sparkTablesFromItems([
			...pageHeading,
			...table("GLOOM", ["Hue", "Shape"], 77, 614),
			...table("BRAMBLE", ["Kind", "Growth"], 236, 614, { skipRow: 7 })
		]);
		expect(page.tables.map((spark) => spark.name)).toEqual(["Gloom"]);
		expect(page.unread).toEqual(["Bramble"]);
	});

	it("finds nothing on a page without tables", () => {
		expect(sparkTablesFromItems(pageHeading)).toEqual({ name: "Musings", tables: [], unread: [] });
		expect(sparkTablesFromItems([])).toEqual({ name: null, tables: [], unread: [] });
	});
});

describe("sparkPrompt", () => {
	it("takes one entry from each column", () => {
		const [gloom] = sparkTablesFromItems(table("GLOOM", ["Hue", "Shape"], 77, 614)).tables;
		expect(sparkPrompt(gloom, [3, 12])).toEqual([
			{ column: "Hue", roll: 3, entry: "Hue3" },
			{ column: "Shape", roll: 12, entry: "Shape12" }
		]);
	});
});

describe("Spark Tables in the art index", () => {
	it("are on pages 22 to 25", () => {
		expect(SPARK_PAGES.map(({ page }) => page)).toEqual([22, 23, 24, 25]);
	});

	it("are kept in the index, empty when none were read", () => {
		const base = { entries: [], pdfPages: 212, importedAt: "2026-01-01T00:00:00.000Z", systemVersion: "0.1.0" };
		const spark = [{ key: "nature", page: 22, name: "Musings", tables: [] }];
		expect(buildIndex({ ...base, spark }).spark).toEqual(spark);
		expect(buildIndex(base).spark).toEqual([]);
	});
});
