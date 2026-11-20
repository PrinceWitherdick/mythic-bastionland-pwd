import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { hexAt, hexTopLeft, realmGeometry } from "../../module/rules/realm-geometry.js";
import { generateRealm } from "../../module/rules/realm-generator.js";
import { realmSceneData, realmTextures } from "../../module/rules/realm-documents.js";
import { EXPANDING_FLAG, REALM_GROWTH_FLAG, growRealm, growthOffset, shiftHex } from "../../module/rules/realm-growth.js";

vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	t: (key) => key,
	warn: vi.fn()
}));

vi.mock("../../module/actions/hex-journals.js", () => ({ syncHexJournals: vi.fn(async () => {}) }));
vi.mock("../../module/canvas/hex-prompt.js", () => ({ forgetHexArrivals: vi.fn() }));
vi.mock("../../module/actions/time-capture.js", () => ({ writeAdvanceRecords: vi.fn(async () => {}) }));

const { expandRealm, getRealm, resumeExpansion, forgetRealm, sceneGeometry } = await import("../../module/actions/realm.js");
const { warn } = await import("../../module/chat/cards.js");
const { writeAdvanceRecords } = await import("../../module/actions/time-capture.js");
const { syncHexJournals } = await import("../../module/actions/hex-journals.js");

/** Set a dotted path, reading v13's `-=` and `==` keys as Foundry does. */
function applyPath(target, path, value) {
	const parts = path.split(".");
	const last = parts.pop();
	let at = target;
	for (const part of parts) at = at[part] ??= {};
	if (last.startsWith("-=")) delete at[last.slice(2)];
	else if (last.startsWith("==")) at[last.slice(2)] = structuredClone(value);
	else if (value && typeof value === "object" && !Array.isArray(value) && at[last] && typeof at[last] === "object") applyNested(at[last], value);
	else at[last] = structuredClone(value);
}

function applyNested(target, changes) {
	for (const [key, value] of Object.entries(changes)) applyPath(target, key, value);
}

/** An embedded document whose source is its data. */
function fakeDocument(source, scene) {
	const document = {
		get id() { return source._id; },
		_source: source,
		get flags() { return source.flags ?? {}; },
		get hidden() { return source.hidden; },
		getFlag: (scope, key) => source.flags?.[scope]?.[key],
		getCenterPoint: () => {
			const g = sceneGeometry(scene);
			return { x: source.x + g.hexWidth / 2, y: source.y + g.hexHeight / 2 };
		},
		update: vi.fn(async (changes) => {
			scene.log.push(["update Token", changes]);
			applyNested(source, changes);
			forgetRealm(scene.id);
		})
	};
	return document;
}

function collection(scene, list) {
	const documents = list.map((source) => fakeDocument(source, scene));
	return Object.assign(documents, {
		get: (id) => documents.find((document) => document.id === id),
		get contents() { return documents; }
	});
}

const COLLECTIONS = { Tile: "tiles", Drawing: "drawings", Token: "tokens" };

/** A Realm Scene held in memory, its writes landing on it and logged in order. */
function fakeScene({ realm, g }) {
	const data = realmSceneData({ name: "The Vale", realm, geometry: g, textures: realmTextures() });
	const scene = {
		id: "vale",
		name: "The Vale",
		log: [],
		flags: structuredClone(data.flags),
		_source: { initial: { ...data.initial }, grid: { ...data.grid } },
		width: data.width,
		height: data.height,
		grid: { ...data.grid },
		getFlag: (scope, key) => scene.flags[scope]?.[key],
		unsetFlag: vi.fn(async (scope, key) => {
			scene.log.push(["unset", key]);
			delete scene.flags[scope][key];
		}),
		update: vi.fn(async (changes, options) => {
			scene.log.push(["scene", changes, options]);
			for (const [path, value] of Object.entries(changes)) {
				if (path.startsWith("initial.")) applyPath(scene._source, path, value);
				else applyPath(scene, path, value);
			}
			forgetRealm(scene.id);
		}),
		getEmbeddedDocument: (type, id) => scene[COLLECTIONS[type]].get(id),
		updateEmbeddedDocuments: vi.fn(async (type, updates) => {
			scene.log.push([`update ${type}`, updates]);
			for (const { _id, ...changes } of updates) applyNested(scene[COLLECTIONS[type]].get(_id)._source, changes);
			forgetRealm(scene.id);
		}),
		createEmbeddedDocuments: vi.fn(async (type, made) => {
			scene.log.push([`create ${type}`, made]);
			for (const source of made) scene[COLLECTIONS[type]].push(fakeDocument({ _id: source._id ?? `new${scene.log.length}-${Math.random()}`, ...structuredClone(source) }, scene));
			forgetRealm(scene.id);
		}),
		deleteEmbeddedDocuments: vi.fn(async (type, ids) => {
			scene.log.push([`delete ${type}`, ids]);
			const list = scene[COLLECTIONS[type]];
			for (const id of ids) list.splice(list.findIndex((document) => document.id === id), 1);
			forgetRealm(scene.id);
		}),
		createThumbnail: async () => ({ thumb: null })
	};
	scene.tiles = collection(scene, data.tiles.map((tile, index) => ({ _id: `tile${index}`, ...structuredClone(tile) })));
	scene.drawings = collection(scene, data.drawings.map((drawing, index) => ({ _id: `drawing${index}`, ...structuredClone(drawing) })));
	const corner = hexTopLeft(g, { col: 4, row: 5 });
	scene.tokens = collection(scene, [
		{ _id: "company", x: Math.round(corner.x), y: Math.round(corner.y), flags: { [SYSTEM_ID]: { company: true } } },
		{ _id: "stranger", x: 10, y: 20, flags: {} }
	]);
	scene.flags[SYSTEM_ID].hexNames = { version: 1, hexes: { "4,5": { name: "Mossford" } } };
	scene.flags[SYSTEM_ID].companyMoves = [{ id: "m1" }];
	return scene;
}

const settings = new Map();
let scene;
let realm;
const g = realmGeometry();

beforeEach(() => {
	settings.clear();
	settings.set("hexJournals", false);
	realm = generateRealm({ seed: "expand", geometry: g });
	scene = fakeScene({ realm, g });
	const entry = { id: "j1", flags: { [SYSTEM_ID]: { hexJournal: { scene: "vale", hex: "4,5" } } } };
	entry.getFlag = (scope, key) => entry.flags[scope]?.[key];
	const journal = Object.assign([entry], {
		get: (id) => journal.find((entry) => entry.id === id)
	});
	globalThis.game = {
		user: { id: "gm", isGM: true },
		users: { activeGM: { isSelf: true }, get: () => ({ active: false }) },
		journal,
		actors: [],
		scenes: [scene],
		time: { serverTime: 1000 },
		settings: { get: (_scope, key) => settings.get(key), set: vi.fn(async (_scope, key, value) => settings.set(key, value)) }
	};
	globalThis.canvas = { scene: null };
	globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
	globalThis.Hooks = { callAll: vi.fn(), once: vi.fn(), on: vi.fn() };
	globalThis.foundry = {
		utils: {
			isEmpty: (value) => !value || Object.keys(value).length === 0,
			flattenObject: (object, prefix = "") => Object.fromEntries(Object.entries(object).flatMap(([key, value]) => (value && typeof value === "object" && !Array.isArray(value)
				? Object.entries(globalThis.foundry.utils.flattenObject(value, `${prefix}${key}.`))
				: [[`${prefix}${key}`, value]])))
		}
	};
	globalThis.CONFIG = { JournalEntry: { documentClass: { updateDocuments: vi.fn(async (updates) => {
		for (const { _id, ...changes } of updates) applyNested(journal.get(_id), changes);
	}) } } };
	forgetRealm();
	vi.mocked(warn).mockClear();
});

afterEach(() => {
	for (const key of ["game", "canvas", "ui", "Hooks", "foundry", "CONFIG"]) delete globalThis[key];
});

const growth = { west: 3, north: 1, east: 1, south: 2 };
const withoutIds = (list) => list.map(({ id: _id, ...rest }) => rest);

describe("expandRealm", () => {
	it("grows the map with every hex holding what it held, and its Tiles keeping their ids", async () => {
		const before = getRealm(scene).realm;
		const holdingIds = before.holdings.map((holding) => holding.id);
		expect(await expandRealm(scene, growth)).toBe(true);
		const after = getRealm(scene).realm;
		const expected = growRealm(before, g, growth);
		expect(after.terrain).toEqual(expected.terrain);
		expect(after.rivers).toEqual(expected.rivers);
		expect(after.holdings).toEqual(expected.holdings);
		expect(after.holdings.map((holding) => holding.id)).toEqual(holdingIds);
		expect(withoutIds(after.myths)).toEqual(withoutIds(expected.myths));
		expect(withoutIds(after.landmarks)).toEqual(withoutIds(expected.landmarks));
		expect(after.barriers.map((barrier) => barrier.edge).sort()).toEqual(expected.barriers.map((barrier) => barrier.edge).sort());
		expect([scene.width, scene.height]).toEqual([sceneGeometry(scene).width, sceneGeometry(scene).height]);
		expect(scene.flags[SYSTEM_ID][REALM_FLAG]).toMatchObject({ cols: 16, rows: 15, layout: "oddColumns" });
	});

	it("keeps the Barrier lines' Drawings, and deletes none of the Realm's Tiles that held something", async () => {
		const drawingIds = scene.drawings.map((drawing) => drawing.id).sort();
		const kindOf = new Map(scene.tiles.map((tile) => [tile.id, tile._source.flags[SYSTEM_ID][REALM_FLAG].kind]));
		await expandRealm(scene, growth);
		expect(scene.drawings.map((drawing) => drawing.id).sort()).toEqual(drawingIds);
		const deleted = scene.log.filter(([what]) => what === "delete Tile").flatMap(([, ids]) => ids);
		expect(deleted.filter((id) => ["holding", "myth", "landmark", "terrain", "river"].includes(kindOf.get(id)))).toEqual([]);
		expect(scene.log.some(([what]) => what === "delete Drawing")).toBe(false);
	});

	it("re-keys what's kept for each hex, inside the Scene and out, and clears the Company's moves", async () => {
		await expandRealm(scene, growth);
		expect(scene.flags[SYSTEM_ID].hexNames).toEqual({ version: 1, hexes: { "7,6": { name: "Mossford" } } });
		expect(scene.flags[SYSTEM_ID].companyMoves).toBeUndefined();
		expect(game.journal.get("j1").flags[SYSTEM_ID].hexJournal.hex).toBe("7,6");
		expect(game.journal.get("j1").sort).toBe(7006);
		expect(writeAdvanceRecords).toHaveBeenCalledWith([]);
		expect(syncHexJournals).toHaveBeenCalledWith(scene);
	});

	it("stands the Company in its hex, and moves every other Token as far as the land", async () => {
		const stranger = { ...scene.tokens.get("stranger")._source };
		await expandRealm(scene, growth);
		const company = scene.tokens.get("company");
		expect(hexAt(sceneGeometry(scene), company.getCenterPoint())).toEqual(shiftHex({ col: 4, row: 5 }, growthOffset(growth)));
		const moved = scene.tokens.get("stranger")._source;
		expect(moved.x - stranger.x).toBe(Math.round(1.5 * g.radius * 3));
		expect(moved.y - stranger.y).toBe(160);
	});

	it("moves the Scene's documents before its size, marks the Scene throughout, and logs the growth", async () => {
		await expandRealm(scene, growth);
		const order = scene.log.map(([what, changes]) => (what === "scene" && "width" in changes ? "size" : what === "scene" && Object.keys(changes).some((key) => key.includes(EXPANDING_FLAG)) ? "mark" : what));
		expect(order.indexOf("mark")).toBeLessThan(order.indexOf("update Tile"));
		expect(order.indexOf("update Tile")).toBeLessThan(order.indexOf("size"));
		expect(order.indexOf("size")).toBeLessThan(order.indexOf("update Token"));
		expect(order.lastIndexOf("unset")).toBeGreaterThan(order.indexOf("size"));
		expect(scene.flags[SYSTEM_ID][EXPANDING_FLAG]).toBeUndefined();
		expect(scene.flags[SYSTEM_ID][REALM_GROWTH_FLAG]).toEqual({ log: [{ when: 1000, ...growth }], origin: { cols: 3, rows: 1 } });
		const sized = scene.log.find(([what, changes]) => what === "scene" && "width" in changes);
		expect(sized[2][SYSTEM_ID].realmExpanded).toMatchObject({ cols: 3, rows: 1 });
	});

	it("numbers the map from 1 again when asked", async () => {
		await expandRealm(scene, growth, { keepNumbers: false });
		expect(scene.flags[SYSTEM_ID][REALM_GROWTH_FLAG].origin).toEqual({ cols: 0, rows: 0 });
	});

	it("refuses a growth past the limits, or nothing at all, writing nothing", async () => {
		expect(await expandRealm(scene, { east: 0 })).toBe(false);
		expect(await expandRealm(scene, { east: 60 })).toBe(false);
		expect(warn).toHaveBeenCalledTimes(2);
		expect(scene.log).toEqual([]);
	});

	it("stops before writing anything when the backup can't be kept", async () => {
		const backup = vi.fn(async () => false);
		expect(await expandRealm(scene, growth, { backup })).toBe(false);
		expect(backup).toHaveBeenCalledOnce();
		expect(scene.log.some(([what, changes]) => what === "scene" && Object.keys(changes).some((key) => key.includes(EXPANDING_FLAG)))).toBe(false);
		expect(scene.log.some(([what]) => what === "update Tile")).toBe(false);
	});
});

describe("resumeExpansion", () => {
	it("finishes an expansion cut short where it would have landed", async () => {
		const whole = fakeScene({ realm, g });
		game.scenes.push(whole);
		const id = whole.id;
		whole.id = "whole";
		await expandRealm(whole, growth);
		whole.id = id;

		// Cut short just after the Tiles moved: the plan is on the Scene, the rest unwritten.
		const realUpdate = scene.updateEmbeddedDocuments.getMockImplementation();
		let cut = false;
		scene.updateEmbeddedDocuments.mockImplementation(async (type, updates) => {
			await realUpdate(type, updates);
			if (type === "Tile" && !cut) {
				cut = true;
				throw new Error("closed");
			}
		});
		await expect(expandRealm(scene, growth)).rejects.toThrow("closed");
		expect(scene.flags[SYSTEM_ID][EXPANDING_FLAG]).toBeTruthy();
		scene.updateEmbeddedDocuments.mockImplementation(realUpdate);

		expect(await resumeExpansion(scene)).toBe(true);
		expect(scene.flags[SYSTEM_ID][EXPANDING_FLAG]).toBeUndefined();
		forgetRealm();
		const read = (target) => getRealm(target).realm;
		expect(read(scene).terrain).toEqual(read(whole).terrain);
		expect(read(scene).holdings).toEqual(read(whole).holdings);
		expect(read(scene).barriers.map((barrier) => barrier.edge).sort()).toEqual(read(whole).barriers.map((barrier) => barrier.edge).sort());
		expect(scene.tokens.get("stranger")._source).toEqual(whole.tokens.get("stranger")._source);
		expect(scene.flags[SYSTEM_ID].hexNames).toEqual(whole.flags[SYSTEM_ID].hexNames);
	});

	it("leaves one still being written by another Referee whose browser is open", async () => {
		scene.flags[SYSTEM_ID][EXPANDING_FLAG] = { by: "other", growth, embedded: {}, tokens: [] };
		game.users.get = () => ({ active: true });
		expect(await resumeExpansion(scene)).toBe(false);
	});
});
