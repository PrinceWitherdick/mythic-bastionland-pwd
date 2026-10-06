import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Just enough of ApplicationV2: a render reads the context, and the window is open until closed. */
class FakeApplication {
	rendered = false;
	element = {};
	bringToFront = vi.fn();

	async _prepareContext() {
		return {};
	}

	async render() {
		this.context = await this._prepareContext({});
		this.rendered = true;
		return this;
	}

	async close() {
		this.rendered = false;
		this._onClose({});
	}

	_onClose() {}
}
globalThis.foundry = { applications: { api: { ApplicationV2: FakeApplication, HandlebarsApplicationMixin: (Base) => class extends Base {} } } };

// Invented, so no book text lives in the repository.
const page = {
	key: "people",
	page: 24,
	tables: [
		{ name: "P0", columns: ["Left", "Right"], rows: [["a1", "b1"], ["a2", "b2"]] },
		{ name: "P1", columns: ["Left", "Right"], rows: [["c1", "d1"], ["c2", "d2"]] }
	]
};

vi.mock("../../module/actions/hex-names.js", () => ({ hexLabel: (hex) => `${hex.col},${hex.row}` }));
vi.mock("../../module/actions/people.js", () => ({ peopleTables: vi.fn(async () => page), saveHexPerson: vi.fn(async () => ({ name: "Wren" })) }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/apps/SparkTables.js", () => ({
	animates: () => true,
	wireAnimateBox: vi.fn(),
	// Every column asked for lands on row 2.
	rollPicks: vi.fn(async (tables, taken, { table, column }) => {
		for (const [index, rows] of taken.entries()) {
			if (table !== undefined && Number(table) !== index) continue;
			for (const at of rows.keys()) if (column === undefined || Number(column) === at) rows[at] = 2;
		}
		return true;
	})
}));

const { RollPerson, openRollPerson } = await import("../../module/apps/RollPerson.js");
const { rollPicks } = await import("../../module/apps/SparkTables.js");
const { saveHexPerson } = await import("../../module/actions/people.js");

const scene = { id: "realm" };
const hex = { col: 3, row: 4 };
const { pickRow, rollPick, save } = RollPerson.DEFAULT_OPTIONS.actions;
const rolled = (app) => app.context.tables.map((table) => table.rows.map((row) => row.entries.map((entry) => entry.rolled)));

let app;
beforeEach(async () => {
	await app?.close();
	vi.mocked(rollPicks).mockClear();
	vi.mocked(saveHexPerson).mockClear();
	app = await openRollPerson({ scene, hex });
});

describe("Roll a Person", () => {
	it("opens on the People tables alone, every one rolled", () => {
		expect(rollPicks).toHaveBeenCalledOnce();
		const [tables, , which] = vi.mocked(rollPicks).mock.calls[0];
		expect(tables).toBe(page.tables);
		expect(which).toEqual({});
		expect(app.context.tables.map((table) => table.name)).toEqual(["P0", "P1"]);
		expect(rolled(app)).toEqual([[[false, false], [true, true]], [[false, false], [true, true]]]);
		expect(app.context.nothingTaken).toBe(false);
	});

	it("comes forward as it stands when opened again for the same hex, and starts afresh for another", async () => {
		await openRollPerson({ scene, hex });
		expect(rollPicks).toHaveBeenCalledOnce();
		expect(app.bringToFront).toHaveBeenCalledOnce();

		await pickRow.call(app, null, { dataset: { table: "0", column: "0", row: "1" } });
		await openRollPerson({ scene, hex: { col: 5, row: 5 } });
		expect(rollPicks).toHaveBeenCalledTimes(2);
		expect(rolled(app)[0][0]).toEqual([false, false]);
	});

	it("rolls one table or one column again, and takes an entry by hand or lets it go", async () => {
		await pickRow.call(app, null, { dataset: { table: "1", column: "1", row: "1" } });
		expect(rolled(app)[1].map((row) => row[1])).toEqual([true, false]);
		await pickRow.call(app, null, { dataset: { table: "1", column: "1", row: "1" } });
		expect(rolled(app)[1].map((row) => row[1])).toEqual([false, false]);

		await rollPick.call(app, null, { dataset: { table: "1", column: "1" } });
		expect(vi.mocked(rollPicks).mock.calls.at(-1)[2]).toMatchObject({ table: "1", column: "1" });
		expect(rolled(app)[1].map((row) => row[1])).toEqual([false, true]);
	});

	it("can't save with nothing taken", async () => {
		for (const table of ["0", "1"]) for (const column of ["0", "1"]) await pickRow.call(app, null, { dataset: { table, column, row: "2" } });
		expect(app.context.nothingTaken).toBe(true);
	});

	it("saves what's taken to the hex it was opened for, and closes", async () => {
		await pickRow.call(app, null, { dataset: { table: "0", column: "0", row: "1" } });
		await save.call(app);
		expect(saveHexPerson).toHaveBeenCalledWith({ scene, hex, page, taken: [[1, 2], [2, 2]] });
		expect(app.rendered).toBe(false);
	});

	it("opens from the Lay of the Land's Roll a Person", () => {
		const root = join(import.meta.dirname, "..", "..");
		expect(readFileSync(join(root, "module/apps/hex-gm-part.js"), "utf8")).toContain("rollPerson: ({ scene, hex }) => openRollPerson({ scene, hex }),");
		expect(readFileSync(join(root, "templates/apps/roll-person.hbs"), "utf8")).toContain('{{> "bastionland.spark-pick-tables"}}');
	});
});
