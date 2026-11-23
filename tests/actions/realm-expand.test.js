import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { hexAt, hexTopLeft, realmGeometry } from "../../module/rules/realm-geometry.js";
import { generateRealm } from "../../module/rules/realm-generator.js";
import { realmSceneData, realmTextures } from "../../module/rules/realm-documents.js";
import { EXPANDING_FLAG, REALM_BACKUP_FLAG, REALM_GROWTH_FLAG, cardOffset, growRealm, growthOffset, shiftHex, shiftHexKey } from "../../module/rules/realm-growth.js";

vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	t: (key) => key,
	warn: vi.fn()
}));

vi.mock("../../module/actions/hex-journals.js", async () => {
	const { SYSTEM_ID: id } = await import("../../module/system-id.js");
	const { HEX_JOURNAL_FLAG } = await import("../../module/rules/hex-journal.js");
	return { syncHexJournals: vi.fn(async () => {}), hexJournalFlag: (entry) => entry?.flags?.[id]?.[HEX_JOURNAL_FLAG] ?? null };
});
vi.mock("../../module/canvas/hex-prompt.js", () => ({ forgetHexArrivals: vi.fn() }));
vi.mock("../../module/actions/time-capture.js", () => ({ writeAdvanceRecords: vi.fn(async () => {}) }));

const { expandRealm, getRealm, putRealmBack, resumeExpansion, forgetRealm, sceneGeometry } = await import("../../module/actions/realm.js");
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
		settings: { get: (_scope, key) => settings.get(key), set: vi.fn(async (_scope, key, value) => settings.set(key, value)) }
	};
	vi.spyOn(Date, "now").mockReturnValue(1000);
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
	vi.restoreAllMocks();
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

	it("keeps the backup before working out the plan, so nothing done while it's kept is lost", async () => {
		const backup = vi.fn(async (target) => {
			// A player moves a Token while the backup uploads, or the Referee is asked whether to go on.
			target.tokens.get("stranger")._source.x = 500;
			target.flags[SYSTEM_ID].hexNames.hexes["4,5"].name = "Mossbridge";
			return true;
		});
		await expandRealm(scene, growth, { backup });
		expect(scene.tokens.get("stranger")._source.x).toBe(500 + Math.round(1.5 * g.radius * 3));
		expect(scene.flags[SYSTEM_ID].hexNames.hexes["7,6"].name).toBe("Mossbridge");
		const marked = scene.log.findIndex(([what, changes]) => what === "scene" && Object.keys(changes).some((key) => key.includes(EXPANDING_FLAG)));
		expect(backup.mock.invocationCallOrder[0]).toBeLessThan(scene.update.mock.invocationCallOrder[marked]);
	});

	it("stops before writing anything when the backup can't be kept", async () => {
		const backup = vi.fn(async () => false);
		expect(await expandRealm(scene, growth, { backup })).toBe(false);
		expect(backup).toHaveBeenCalledOnce();
		expect(scene.log.some(([what, changes]) => what === "scene" && Object.keys(changes).some((key) => key.includes(EXPANDING_FLAG)))).toBe(false);
		expect(scene.log.some(([what]) => what === "update Tile")).toBe(false);
	});
});

const snapshot = (target) => ({
	_id: target.id,
	width: target.width,
	height: target.height,
	grid: structuredClone(target.grid),
	initial: structuredClone(target._source.initial),
	flags: structuredClone(target.flags),
	tiles: target.tiles.map((tile) => structuredClone(tile._source)),
	drawings: target.drawings.map((drawing) => structuredClone(drawing._source)),
	tokens: target.tokens.map((token) => structuredClone(token._source))
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

	it("moves nothing twice when cut short after the Scene itself was written", async () => {
		const realUpdate = scene.update.getMockImplementation();
		let cut = false;
		scene.update.mockImplementation(async (changes, options) => {
			await realUpdate(changes, options);
			if ("width" in changes && !cut) {
				cut = true;
				throw new Error("closed");
			}
		});
		await expect(expandRealm(scene, growth)).rejects.toThrow("closed");
		scene.update.mockImplementation(realUpdate);
		const sizedBefore = scene.log.filter(([what, changes]) => what === "scene" && "width" in changes).length;
		expect(await resumeExpansion(scene)).toBe(true);
		// The Scene write landed, and the clients followed it: it isn't made again, so nothing moves a second time.
		const again = scene.log.filter(([what, changes]) => what === "scene" && "width" in changes).slice(sizedBefore);
		expect(again).toHaveLength(0);
		expect(scene.flags[SYSTEM_ID].hexNames).toEqual({ version: 1, hexes: { "7,6": { name: "Mossford" } } });
		expect(game.journal.get("j1").flags[SYSTEM_ID].hexJournal.hex).toBe("7,6");
		expect(scene.flags[SYSTEM_ID][REALM_GROWTH_FLAG].log).toHaveLength(1);
	});

	it("finishes a put-back cut short from the backup it was reading", async () => {
		const before = snapshot(scene);
		await expandRealm(scene, growth);
		scene.flags[SYSTEM_ID][REALM_BACKUP_FLAG] = { path: "worlds/w/bastionland-backups/realm-vale.json", when: 5 };
		globalThis.foundry.utils.getRoute = (path) => `/${path}`;
		globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ scene: before, growth }) }));
		const realUpdate = scene.updateEmbeddedDocuments.getMockImplementation();
		scene.updateEmbeddedDocuments.mockImplementationOnce(async (type, updates) => {
			await realUpdate(type, updates);
			throw new Error("closed");
		});
		await expect(putRealmBack(scene, { scene: before, growth })).rejects.toThrow("closed");
		expect(scene.flags[SYSTEM_ID][EXPANDING_FLAG]).toMatchObject({ restoring: true });

		expect(await resumeExpansion(scene)).toBe(true);
		expect(fetch).toHaveBeenCalledOnce();
		expect(scene.flags[SYSTEM_ID][EXPANDING_FLAG]).toBeUndefined();
		expect([scene.width, scene.height]).toEqual([before.width, before.height]);
		expect(game.journal.get("j1").flags[SYSTEM_ID].hexJournal.hex).toBe("4,5");
		delete globalThis.fetch;
	});

	it("settles a put-back cut short after the Scene itself was written, writing nothing twice", async () => {
		const before = snapshot(scene);
		await expandRealm(scene, growth);
		globalThis.fetch = vi.fn();
		const realUpdate = scene.update.getMockImplementation();
		let cut = false;
		scene.update.mockImplementation(async (changes, options) => {
			await realUpdate(changes, options);
			if ("width" in changes && !cut) {
				cut = true;
				throw new Error("closed");
			}
		});
		await expect(putRealmBack(scene, { scene: before, growth })).rejects.toThrow("closed");
		scene.update.mockImplementation(realUpdate);
		// The Scene is put back, but the mark stays until what an expansion clears is cleared.
		expect(scene.flags[SYSTEM_ID][EXPANDING_FLAG]).toMatchObject({ restoring: true, sceneWritten: true });
		const sizedBefore = scene.log.filter(([what, changes]) => what === "scene" && "width" in changes).length;

		expect(await resumeExpansion(scene)).toBe(true);
		expect(fetch).not.toHaveBeenCalled();
		expect(scene.log.filter(([what, changes]) => what === "scene" && "width" in changes)).toHaveLength(sizedBefore);
		expect(scene.flags[SYSTEM_ID][EXPANDING_FLAG]).toBeUndefined();
		expect([scene.width, scene.height]).toEqual([before.width, before.height]);
		expect(game.journal.get("j1").flags[SYSTEM_ID].hexJournal.hex).toBe("4,5");
		delete globalThis.fetch;
	});

	it("unlocks a put-back cut short whose backup can't be read, and says so", async () => {
		scene.flags[SYSTEM_ID][EXPANDING_FLAG] = { by: "gm", restoring: true, kept: null };
		expect(await resumeExpansion(scene)).toBe(false);
		expect(scene.flags[SYSTEM_ID][EXPANDING_FLAG]).toBeUndefined();
		expect(warn).toHaveBeenCalledOnce();
	});

	it("leaves one still being written by another Referee whose browser is open", async () => {
		scene.flags[SYSTEM_ID][EXPANDING_FLAG] = { by: "other", growth, embedded: {}, tokens: [] };
		game.users.get = () => ({ active: true });
		expect(await resumeExpansion(scene)).toBe(false);
	});
});

describe("putRealmBack", () => {
	it("puts the Scene back as the backup holds it, Tile ids and all, and moves what's kept outside back", async () => {
		const before = snapshot(scene);
		const realmBefore = getRealm(scene).realm;
		await expandRealm(scene, growth);
		// Something written since for a hex of the old land, and one for the new.
		game.journal.push(Object.assign({ id: "j2", flags: { [SYSTEM_ID]: { hexJournal: { scene: "vale", hex: "1,1" } } } }, { getFlag() {} }));
		expect(await putRealmBack(scene, { scene: before, growth })).toBe(true);
		forgetRealm();
		const after = getRealm(scene).realm;
		expect(after.terrain).toEqual(realmBefore.terrain);
		expect(after.holdings).toEqual(realmBefore.holdings);
		expect(scene.tiles.map((tile) => tile.id).sort()).toEqual(before.tiles.map((tile) => tile._id).sort());
		expect([scene.width, scene.height]).toEqual([before.width, before.height]);
		expect(scene.flags[SYSTEM_ID].hexNames).toEqual(before.flags[SYSTEM_ID].hexNames);
		expect(scene.flags[SYSTEM_ID][EXPANDING_FLAG]).toBeUndefined();
		expect(game.journal.get("j1").flags[SYSTEM_ID].hexJournal.hex).toBe("4,5");
		// Written for a hex of the land added, it loses its hex rather than landing on another.
		expect(game.journal.get("j2").flags[SYSTEM_ID].hexJournal).toBeUndefined();
	});

	it("uses the backup up, logs the growth undone, and has every client follow the hexes back", async () => {
		const before = snapshot(scene);
		await expandRealm(scene, growth);
		scene.flags[SYSTEM_ID][REALM_BACKUP_FLAG] = { path: "worlds/w/b.json", when: 5 };
		Date.now.mockReturnValue(2000);
		await putRealmBack(scene, { scene: before, growth });
		expect(scene.flags[SYSTEM_ID][REALM_BACKUP_FLAG]).toBeUndefined();
		const logged = scene.flags[SYSTEM_ID][REALM_GROWTH_FLAG];
		expect(logged.log.at(-1)).toEqual({ when: 2000, west: -3, north: -1, east: -1, south: -2 });
		// A card posted on the grown map names the hex it meant again.
		expect(shiftHexKey("7,6", cardOffset(1500, logged))).toBe("4,5");
		const restored = scene.log.findLast(([what, changes]) => what === "scene" && "width" in changes);
		expect(restored[2][SYSTEM_ID].realmExpanded).toMatchObject({ cols: -3, rows: -1 });
		expect(restored[2][SYSTEM_ID].realmExpanded.dx).toBeLessThan(0);
		const tokens = scene.log.filter(([what]) => what === "update Token").at(-1);
		const options = scene.updateEmbeddedDocuments.mock.calls.findLast(([type]) => type === "Token")[2];
		expect(tokens).toBeTruthy();
		expect(options.movement.company.constrainOptions).toEqual({ ignoreWalls: true, ignoreCost: true });
	});

	it("undoes every expansion since the backup, kept with one or not", async () => {
		const before = snapshot(scene);
		await expandRealm(scene, { north: 1 });
		await expandRealm(scene, { west: 2 });
		expect(game.journal.get("j1").flags[SYSTEM_ID].hexJournal.hex).toBe("6,6");
		expect(await putRealmBack(scene, { scene: before, growth: { north: 1 } })).toBe(true);
		expect(game.journal.get("j1").flags[SYSTEM_ID].hexJournal.hex).toBe("4,5");
		expect([scene.width, scene.height]).toEqual([before.width, before.height]);
	});
});
