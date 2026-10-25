import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The Toolkit's own workings, with the Realm, the art index and the dice stood in for.
vi.mock("../../module/actions/realm.js", async (original) => ({
	...(await original()),
	isRealmScene: (scene) => Boolean(scene?.realm),
	getRealm: (scene) => (scene?.realm ? { realm: scene.realm } : null),
	sceneGeometry: () => ({ cols: 12, rows: 12 })
}));
vi.mock("../../module/actions/solo.js", async (original) => ({
	...(await original()),
	realmKnown: (realm) => realm,
	secretsKeptOn: () => false,
	mythKeptFromMe: () => false
}));
vi.mock("../../module/actions/omens.js", () => ({ markMythOmen: vi.fn() }));
vi.mock("../../module/actions/myth-resolve.js", () => ({ replaceMyth: vi.fn(), resolveMyth: vi.fn(), unresolveMyth: vi.fn() }));
vi.mock("../../module/actions/myth-notes.js", async (original) => ({ ...(await original()), getMythNotes: () => ({ myths: {} }) }));
vi.mock("../../module/actions/myth-cast.js", async (original) => ({ ...(await original()), castActors: () => [] }));
vi.mock("../../module/actions/city-quest.js", async (original) => ({ ...(await original()), cityOmensSeen: () => [] }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollMythTable: vi.fn(async () => ({ roll: {}, results: [{ index: 0, roll: 2 }], prompt: "" })) }));
vi.mock("../../module/apps/roll-spin.js", () => ({ spinTable: vi.fn(async () => {}) }));
vi.mock("../../module/apps/ui.js", async (original) => ({ ...(await original()), renderWhenIdle: vi.fn() }));
vi.mock("../../module/chat/cards.js", async (original) => ({ ...(await original()), t: (key) => key, statLabels: () => ({}), postCard: vi.fn(async () => null) }));
vi.mock("../../module/book-art/art-index.js", async (original) => ({
	...(await original()),
	loadArtIndex: async () => null,
	// Every Myth has a two-column table, named for its roll.
	mythLookup: (_index, myth) => ({ name: `Myth ${myth.d6}-${myth.d12}`, page: 30, entry: { omens: [], table: { name: "T", columns: ["A", "B"], rows: [["a1", "b1"], ["a2", "b2"]] } } })
}));
vi.mock("../../module/book-art/myth-tables.js", async (original) => ({ ...(await original()), peekVerseForEntry: () => null, peekTable: () => null, canReadTablesFromRulebook: () => false }));
vi.mock("../../module/sheets/timeline-tab.js", () => ({ TimelineTabMixin: (Base) => class extends Base { _drawsTimelineOnly() { return false; } } }));

const { markMythOmen } = await import("../../module/actions/omens.js");
const { replaceMyth } = await import("../../module/actions/myth-resolve.js");
const { renderWhenIdle } = await import("../../module/apps/ui.js");

let GmToolkitSheet;

const myth = (number, d6, d12) => ({ number, d6, d12, omen: 0, hex: null, revealed: true });
const realmScene = (id, myths) => ({ id, name: id, realm: { myths } });

/** Scenes as game.scenes keeps them. */
function sceneList(...scenes) {
	return Object.assign(scenes, { get: (id) => scenes.find((scene) => scene.id === id) });
}

/** A control on Myth `number`'s card, as a click hands it to an action. */
const onMyth = (number, dataset = {}) => ({ dataset, closest: (selector) => (selector === "[data-number]" ? { dataset: { number: String(number) }, querySelector: () => null } : null) });

const ALL = ["header", "myths", "places", "time", "timeline", "notes", "settings"];

/** @returns {Promise<object>} The Myths page as drawn now. */
async function drawMyths(sheet, parts = ALL) {
	const context = await sheet._prepareContext({ parts });
	return sheet._preparePartContext("myths", context, { parts });
}

/** @returns {boolean[]} Whether each cell of a drawn Myth's table is marked rolled, row by row. */
const rolled = (page, number) => page.myths.find((entry) => entry.number === number).table.rows.flatMap((row) => row.entries.map((entry) => entry.rolled));

/** A sheet as it is once opened, with the hooks it listens on. */
async function openSheet() {
	const sheet = new GmToolkitSheet();
	sheet.actor = { system: { notes: "" } };
	sheet.element = { addEventListener: () => {} };
	sheet.rendered = true;
	sheet.render = vi.fn();
	await sheet._onFirstRender({}, {});
	return sheet;
}

let hooks;
let A;
let B;

beforeAll(async () => {
	globalThis.foundry = {
		utils: { deepClone: structuredClone },
		applications: {
			api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (Base) => class extends Base {}, DialogV2: {} },
			apps: { ImagePopout: class {} },
			sheets: {
				ActorSheetV2: class {
					async _prepareContext() { return {}; }
					async _preparePartContext(_partId, context) { return context; }
					async _onFirstRender() {}
					_onClose() {}
				}
			}
		}
	};
	({ GmToolkitSheet } = await import("../../module/sheets/GmToolkitSheet.js"));
});

beforeEach(() => {
	hooks = new Map();
	let id = 0;
	globalThis.Hooks = {
		on: (name, fn) => {
			hooks.set(name, fn);
			return ++id;
		},
		off: () => {}
	};
	A = realmScene("A", [myth(3, 1, 1)]);
	B = realmScene("B", [myth(3, 1, 1)]);
	globalThis.game = { scenes: sceneList(A, B), journal: [], actors: [], user: { isGM: true } };
	globalThis.canvas = { scene: A };
});

afterEach(() => {
	vi.clearAllMocks();
	delete globalThis.game;
	delete globalThis.canvas;
	delete globalThis.Hooks;
});

describe("the Referee Toolkit's Realm", () => {
	it("acts on the Realm it was drawn from, whatever the canvas shows since", async () => {
		const sheet = await openSheet();
		await drawMyths(sheet);
		canvas.scene = B;
		expect(sheet.scene).toBe(A);
		await GmToolkitSheet.DEFAULT_OPTIONS.actions.markOmen.call(sheet, {}, onMyth(3, { omen: "2" }));
		expect(markMythOmen).toHaveBeenCalledWith(A, 3, 2);
		await GmToolkitSheet.DEFAULT_OPTIONS.actions.newMyth.call(sheet, {}, onMyth(3));
		expect(replaceMyth).toHaveBeenCalledWith(A, A.realm.myths[0], null);
	});

	it("keeps to that Realm through a draw of one page", async () => {
		const sheet = await openSheet();
		await drawMyths(sheet);
		canvas.scene = B;
		await sheet._prepareContext({ parts: ["places"] });
		expect(sheet.sceneId).toBe("A");
	});

	it("follows the canvas to another Realm until one is chosen, every page at once", async () => {
		const sheet = await openSheet();
		await drawMyths(sheet);
		canvas.scene = B;
		hooks.get("canvasReady")(canvas);
		expect(renderWhenIdle).toHaveBeenCalledWith(sheet, expect.objectContaining({ parts: ["header", "myths", "places", "time"] }));
		// A draw of one page meanwhile stays with the Realm the rest show.
		await sheet._prepareContext({ parts: ["places"] });
		expect(sheet.sceneId).toBe("A");
		await sheet._prepareContext({ parts: ["header", "myths", "places", "time"] });
		expect(sheet.sceneId).toBe("B");
	});

	it("stays on a Realm chosen by hand when the canvas moves", async () => {
		const sheet = await openSheet();
		await drawMyths(sheet);
		await sheet._onChangeForm({}, { target: { dataset: { toolkitField: "realm" }, value: "B" } });
		canvas.scene = A;
		hooks.get("canvasReady")(canvas);
		expect(renderWhenIdle).not.toHaveBeenCalled();
		await drawMyths(sheet);
		expect(sheet.sceneId).toBe("B");
	});

	it("still follows the canvas after showing a Myth asked for from another window", async () => {
		const sheet = await openSheet();
		sheet.element.querySelector = () => null;
		await sheet.showMyth(B, 3);
		await drawMyths(sheet);
		expect(sheet.sceneId).toBe("B");
		canvas.scene = A;
		hooks.get("canvasReady")(canvas);
		expect(renderWhenIdle).toHaveBeenCalled();
		await drawMyths(sheet);
		expect(sheet.sceneId).toBe("A");
	});

	it("doesn't mark an Omen for a click between its linked Scenes", async () => {
		const sheet = await openSheet();
		await drawMyths(sheet);
		const between = { target: { closest: (selector) => (selector === ".bastionland-omen-scenes" ? {} : null) } };
		await GmToolkitSheet.DEFAULT_OPTIONS.actions.markOmen.call(sheet, between, onMyth(3, { omen: "2" }));
		expect(markMythOmen).not.toHaveBeenCalled();
	});

	it("leaves a Scene that isn't a Realm alone", async () => {
		const sheet = await openSheet();
		await drawMyths(sheet);
		canvas.scene = { id: "battle" };
		hooks.get("canvasReady")(canvas);
		expect(renderWhenIdle).not.toHaveBeenCalled();
		await drawMyths(sheet);
		expect(sheet.sceneId).toBe("A");
	});
});

describe("a Myth table's rolled rows", () => {
	it("stay with the Myth rolled, not its number or another Realm's", async () => {
		const sheet = await openSheet();
		await drawMyths(sheet);
		await GmToolkitSheet.DEFAULT_OPTIONS.actions.rollMythTable.call(sheet, {}, onMyth(3));
		expect(rolled(await drawMyths(sheet), 3)).toEqual([false, false, true, false]);

		// The same Myth in another Realm hasn't been rolled there.
		await sheet._onChangeForm({}, { target: { dataset: { toolkitField: "realm" }, value: "B" } });
		expect(rolled(await drawMyths(sheet), 3)).toEqual([false, false, false, false]);

		// Back in the first, a new Myth rolled under the same number starts afresh.
		await sheet._onChangeForm({}, { target: { dataset: { toolkitField: "realm" }, value: "A" } });
		expect(rolled(await drawMyths(sheet), 3)).toEqual([false, false, true, false]);
		A.realm.myths[0] = myth(3, 2, 5);
		expect(rolled(await drawMyths(sheet), 3)).toEqual([false, false, false, false]);
	});
});
