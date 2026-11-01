import { beforeEach, describe, expect, it, vi } from "vitest";

/** Just enough of ApplicationV2: a render reads the context, and the window is open until closed. */
class FakeApplication {
	rendered = false;
	element = { querySelector: () => null, querySelectorAll: () => [] };

	constructor(options) {
		this.options = options;
	}

	async _prepareContext() {
		return {};
	}

	async render() {
		this.context = await this._prepareContext({});
		this.rendered = true;
		return this;
	}

	_onClose() {}
}
globalThis.foundry = { applications: { api: { ApplicationV2: FakeApplication, HandlebarsApplicationMixin: (Base) => class extends Base {} } } };

/** Hooks as Foundry runs them: every function on a name, called in turn. */
const hooks = new Map();
globalThis.Hooks = {
	on: (name, fn) => hooks.set(name, [...(hooks.get(name) ?? []), fn]),
	callAll: (name, ...args) => (hooks.get(name) ?? []).forEach((fn) => fn(...args))
};

// Invented, so no book text lives in the repository.
const table = (name) => ({ name, columns: ["Left", "Right"], rows: Array.from({ length: 12 }, (_, row) => [`${name}-a${row}`, `${name}-b${row}`]) });
const page = (key, number, prefix = key) => ({ key, name: `Page ${key}`, page: number, tables: Array.from({ length: 9 }, (_, index) => table(`${prefix}${index}`)) });

/** The art index Import PDF has written, as loadArtIndex reads it. */
let artIndex;
const ART_INDEX_HOOK = "test.artIndexChanged";

vi.mock("../../module/book-art/art-index.js", () => ({ ART_INDEX_HOOK: "test.artIndexChanged", loadArtIndex: vi.fn(async () => artIndex) }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => null), t: (key) => key }));
vi.mock("../../module/client-settings.js", () => ({ read: () => true, reducesMotion: () => true }));
vi.mock("../../module/actions/hex-names.js", () => ({ hexLabel: () => "here" }));
vi.mock("../../module/actions/company.js", () => ({ companyTokenHex: () => null }));
vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: () => false }));
vi.mock("../../module/actions/hex-lore.js", () => ({
	keepHexSparks: vi.fn(),
	keepTableRoll: vi.fn(),
	throwSparkDice: vi.fn(),
	wildernessHexTables: vi.fn(async () => null)
}));
vi.mock("../../module/actions/people.js", () => ({
	keepHexPerson: vi.fn(),
	namesForHex: () => ["Wren"],
	postPerson: vi.fn(async () => null),
	rollPersonTables: vi.fn(async () => ({ page: artIndex.spark[2], rolled: [], traits: [], roll: {} }))
}));
vi.mock("../../module/actions/referee-rolls.js", () => ({
	rollSpark: vi.fn(async () => ({ roll: {}, results: [{ roll: 1 }, { roll: 2 }], prompt: "a prompt" }))
}));
vi.mock("../../module/apps/places-hex.js", () => ({ placesChosenHex: () => null }));
vi.mock("../../module/apps/roll-spin.js", () => ({ spinTable: vi.fn(async () => {}) }));
vi.mock("../../module/apps/ui.js", () => ({ toggleShown: () => false }));

const { SparkTables } = await import("../../module/apps/SparkTables.js");
const { postCard } = await import("../../module/chat/cards.js");
const { postPerson } = await import("../../module/actions/people.js");
const { roll, rollPerson } = SparkTables.DEFAULT_OPTIONS.actions;

beforeEach(() => {
	artIndex = { spark: [page("nature", 22), page("civilisation", 23), page("people", 24), page("combat", 25)] };
	globalThis.canvas = { scene: null };
	globalThis.game = { user: { isGM: true } };
	vi.mocked(postCard).mockClear();
	vi.mocked(postPerson).mockClear();
});

describe("the Spark Tables window", () => {
	it("reads the tables again when Import PDF runs while it's open", async () => {
		artIndex = null;
		const app = await new SparkTables().render();
		expect(app.context.notice).toBe("spark.noIndex");
		expect(app.context.tables).toEqual([]);

		artIndex = { spark: [page("nature", 22)] };
		Hooks.callAll(ART_INDEX_HOOK);
		await vi.waitFor(() => expect(app.context.notice).toBeNull());
		expect(app.context.tables).toHaveLength(9);
	});

	it("reads them again on its next opening when Import PDF ran while it was closed", async () => {
		const app = new SparkTables();
		await app.render();
		app.rendered = false;
		artIndex = { spark: [page("nature", 22, "reread")] };
		Hooks.callAll(ART_INDEX_HOOK);
		await app.render();
		expect(app.context.tables[0].name).toBe("reread0");
	});

	it("says only that the tables weren't read, where the index holds none", async () => {
		artIndex = { spark: [] };
		const app = await new SparkTables().render();
		expect(app.context.notice).toBe("spark.noText");
		expect(app.context.empty).toBe(false);
	});

	it("still says a page wasn't read beside pages that were", async () => {
		artIndex = { spark: [page("civilisation", 23)] };
		const app = await new SparkTables().render();
		expect(app.context.notice).toBeNull();
		expect(app.context.empty).toBe(true);
	});
});

describe("rolls made in the window", () => {
	it("whisper a table's prompt to the Referee, as every other Spark roll does", async () => {
		const app = await new SparkTables().render();
		await roll.call(app, null, { dataset: { table: "0" } });
		expect(postCard).toHaveBeenCalledOnce();
		expect(vi.mocked(postCard).mock.calls[0][3]).toMatchObject({ mode: "gm" });
	});

	it("whisper a person rolled on the People page to the Referee", async () => {
		const app = await new SparkTables().render();
		await rollPerson.call(app);
		expect(postPerson).toHaveBeenCalledOnce();
		expect(vi.mocked(postPerson).mock.calls[0][1]).toMatchObject({ mode: "gm" });
	});
});
