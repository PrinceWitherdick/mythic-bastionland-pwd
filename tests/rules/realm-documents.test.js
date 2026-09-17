import { describe, expect, it } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { LAKE, REALM_FLAG, RIVER_SHAPES, TERRAIN } from "../../module/rules/realm.js";
import { edgeKey, hexAt, hexCentre, hexIndex, hexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { generateRealm } from "../../module/rules/realm-generator.js";
import { REALM_PALETTES } from "../../module/rules/realm-skins.js";
import {
	GRID_ALPHA,
	ICON_SCALE,
	LEVEL_ID,
	REALM_SORT,
	isRealmDocument,
	planChanges,
	planRealmSync,
	realmDocuments,
	realmFromDocuments,
	realmSceneData,
	realmTextures,
	riverPieces
} from "../../module/rules/realm-documents.js";

const g = realmGeometry();
const flagOf = (data) => data.flags[SYSTEM_ID][REALM_FLAG];

/** A Realm as it would stand on a Scene: its documents given ids, and read back from them. */
function onScene(seed = "documents", textures = realmTextures()) {
	const realm = generateRealm({ seed, geometry: g });
	const scene = realmSceneData({ name: "The Realm", realm, geometry: g, textures, units: "Hex" });
	const snapshot = {
		flags: scene.flags,
		tiles: scene.tiles.map((tile, index) => ({ _id: `tile${index}`, ...structuredClone(tile) })),
		drawings: scene.drawings.map((drawing, index) => ({ _id: `drawing${index}`, ...structuredClone(drawing) }))
	};
	return { realm, scene, snapshot };
}

describe("realmTextures", () => {
	it("uses the system's placeholders until icons are imported", () => {
		const textures = realmTextures();
		expect(textures.terrain[1].src).toMatch(/assets\/realm\/classic\/parchment\/terrain-01\.svg$/);
		expect(textures.terrain[12].icon).toBe(false);
		expect(textures.holding.tower.src).toMatch(/holding-tower\.svg$/);
		expect(textures.landmark.curse.src).toMatch(/landmark-curse\.svg$/);
		expect(textures.myth[6].src).toMatch(/myth-6\.svg$/);
		expect(textures.river.bend.src).toMatch(/river-bend\.svg$/);
	});

	it("prefers imported icons, and falls back where one wasn't saved", () => {
		const textures = realmTextures({
			terrain: [{ terrain: 3, path: "art/terrain-03.webp" }, { terrain: 4, path: null }],
			holdings: [{ style: "town", path: "art/holding-town.webp" }],
			landmarks: [{ type: "ruin", path: "art/landmark-ruin.webp" }]
		});
		expect(textures.terrain[3]).toEqual({ src: "art/terrain-03.webp", icon: true });
		expect(textures.terrain[4].src).toMatch(/terrain-04\.svg$/);
		expect(textures.holding.town.src).toBe("art/holding-town.webp");
		expect(textures.landmark.ruin.src).toBe("art/landmark-ruin.webp");
	});

	const imported = {
		terrain: [{ terrain: 5, path: "art/terrain-05.webp" }],
		holdings: [{ style: "town", path: "art/holding-town.webp" }],
		landmarks: []
	};

	it("draws in the look's skin and colour set", () => {
		const textures = realmTextures(null, { skin: "seal", palette: "midnight" });
		expect(textures.terrain[5]).toEqual({ src: expect.stringMatching(/assets\/realm\/seal\/midnight\/terrain-05\.svg$/), icon: false });
		expect(textures.myth[2].src).toMatch(/seal\/midnight\/myth-2\.svg$/);
		expect(textures.colours).toEqual({ paper: "#1d2230", grid: "#4b5368", barrier: "#d8a24a" });
	});

	it("leaves the imported icons out when the look doesn't use them", () => {
		const textures = realmTextures(imported, { skin: "woodcut", bookIcons: false });
		expect(textures.terrain[5].src).toMatch(/woodcut\/parchment\/terrain-05\.svg$/);
		expect(textures.holding.town.src).toMatch(/woodcut\/parchment\/holding-town\.svg$/);
	});

	it("puts the GM's own pictures before imported icons and the skin", () => {
		const look = { custom: { terrainFit: "icon", files: { "terrain-05": "mine/forest.png", "holding-town": "mine/town.png", seat: "mine/crown.png" } } };
		const textures = realmTextures(imported, look);
		expect(textures.terrain[5]).toEqual({ src: "mine/forest.png", icon: true });
		expect(textures.holding.town.src).toBe("mine/town.png");
		expect(textures.seat.src).toBe("mine/crown.png");
		expect(textures.holding.castle.src).toMatch(/classic\/parchment\/holding-castle\.svg$/);
		expect(realmTextures(null, { custom: { files: { "terrain-01": "mine/marsh.png" } } }).terrain[1].icon).toBe(false);
	});
});

describe("realmSceneData", () => {
	it("paints the Scene and its Barriers in the look's colours", () => {
		const { key, paper, rule, accent } = REALM_PALETTES.at(-1);
		const realm = generateRealm({ seed: "colours", geometry: g });
		const data = realmSceneData({ name: "Night", realm, geometry: g, textures: realmTextures(null, { palette: key }) });
		expect(data.grid.color).toBe(rule);
		expect(data.levels[0].background.color).toBe(paper);
		expect(data.drawings.length).toBeGreaterThan(0);
		expect(data.drawings.every((drawing) => drawing.strokeColor === accent)).toBe(true);
	});

	const { realm, scene } = onScene();

	it("builds a Scene that lines up with Foundry's even-column hex grid", () => {
		expect(scene).toMatchObject({
			name: "The Realm",
			width: 1709,
			height: 2000,
			padding: 0,
			tokenVision: false,
			fog: { mode: 0 },
			grid: { type: 5, size: 160, color: "#a89f90", alpha: GRID_ALPHA, distance: 1, units: "Hex" },
			levels: [{ _id: LEVEL_ID, background: { color: "#efe8d8" } }],
			initialLevel: LEVEL_ID
		});
		expect(flagOf(scene)).toMatchObject({ version: 1, seed: "documents", size: 160, cols: 12, rows: 12, river: realm.river.map(hexKey) });
	});

	it("lays a locked terrain Tile centred on every hex", () => {
		const terrain = scene.tiles.filter((tile) => flagOf(tile).kind === "terrain");
		expect(terrain).toHaveLength(144);
		const first = terrain.find((tile) => tile.x === Math.round(hexCentre(g, { col: 1, row: 1 }).x) && tile.y === 80);
		expect(first).toMatchObject({ width: 185, height: 160, locked: true, hidden: false, alpha: 1, sort: REALM_SORT.terrain });
	});

	it("draws imported terrain inside its hex, and leaves a Holding's hex to the Holding", () => {
		const icons = realmTextures({ terrain: TERRAIN.map((_, index) => ({ terrain: index + 1, path: `art/terrain-${index + 1}.webp` })) });
		const tiles = realmDocuments(realm, g, icons).tiles.map(({ data }) => data).filter((tile) => flagOf(tile).kind === "terrain");
		const holdings = new Set(realm.holdings.map((holding) => hexKey(holding.hex)));
		for (const tile of tiles) {
			expect(tile).toMatchObject({ width: Math.round(g.hexWidth * ICON_SCALE.terrain), height: Math.round(g.size * ICON_SCALE.terrain), texture: { fit: "contain" } });
			expect(tile.alpha).toBe(holdings.has(hexKey(hexAt(g, tile))) ? 0 : 1);
		}
		expect(tiles.filter((tile) => tile.alpha === 0)).toHaveLength(realm.holdings.length);
	});

	it("hides Myths and Landmarks without locking them, since a hidden locked Tile disappears for the GM too", () => {
		const hidden = scene.tiles.filter((tile) => ["myth", "landmark"].includes(flagOf(tile).kind));
		expect(hidden).toHaveLength(realm.myths.length + realm.landmarks.length);
		expect(hidden.every((tile) => tile.hidden && !tile.locked)).toBe(true);
		const holdings = scene.tiles.filter((tile) => flagOf(tile).kind === "holding");
		expect(holdings.every((tile) => !tile.hidden && !tile.locked)).toBe(true);
		expect(scene.tiles.filter((tile) => flagOf(tile).kind === "seat")).toHaveLength(1);
	});

	it("draws each Barrier as a hidden line along its edge, sized in whole pixels as Foundry keeps it", () => {
		expect(scene.drawings).toHaveLength(realm.barriers.length);
		for (const drawing of scene.drawings) {
			expect(drawing.shape.type).toBe("p");
			expect(drawing.shape.points).toHaveLength(4);
			expect(drawing.shape.width > 0 || drawing.shape.height > 0).toBe(true);
			expect(Number.isInteger(drawing.shape.width) && Number.isInteger(drawing.shape.height)).toBe(true);
			expect(drawing).toMatchObject({ hidden: true, locked: true, fillType: 0 });
		}
		const flat = realmDocuments({ ...realm, barriers: [{ id: null, edge: edgeKey({ col: 3, row: 3 }, { col: 3, row: 4 }), revealed: true }] }, g, realmTextures());
		expect(flat.drawings[0].data.shape.height).toBe(0);
		expect(flat.drawings[0].data.shape.width).toBeGreaterThan(0);
		expect(flat.drawings[0].data.hidden).toBe(false);
	});
});

describe("realmFromDocuments", () => {
	it("reads back the Realm the Scene was built from", () => {
		const { realm, snapshot } = onScene();
		const { realm: read, problems } = realmFromDocuments(snapshot, g);
		const withoutIds = (list) => list.map(({ id: _id, ...rest }) => rest);
		expect(problems).toEqual([]);
		expect(read.terrain).toEqual(realm.terrain);
		expect(read.river).toEqual(realm.river);
		expect(read.seed).toBe(realm.seed);
		expect(withoutIds(read.holdings)).toEqual(withoutIds(realm.holdings));
		expect(withoutIds(read.myths)).toEqual(withoutIds(realm.myths));
		expect(withoutIds(read.landmarks)).toEqual(withoutIds(realm.landmarks));
		expect(withoutIds(read.barriers)).toEqual(withoutIds(realm.barriers));
		expect(read.myths.every((myth) => myth.id?.startsWith("tile"))).toBe(true);
	});

	it("ignores documents that aren't part of the Realm", () => {
		const { snapshot } = onScene();
		snapshot.tiles.push({ _id: "stranger", x: 100, y: 100, flags: {} });
		expect(isRealmDocument(snapshot.tiles.at(-1))).toBe(false);
		expect(realmFromDocuments(snapshot, g).problems).toEqual([]);
	});
});

describe("planRealmSync", () => {
	const textures = realmTextures();

	it("writes nothing when the Scene already matches", () => {
		const { snapshot } = onScene();
		const { realm } = realmFromDocuments(snapshot, g);
		expect(planChanges(planRealmSync(realm, g, textures, snapshot))).toBe(false);
	});

	it("snaps a dragged icon to the centre of the hex it was dropped in", () => {
		const { snapshot } = onScene();
		const holding = snapshot.tiles.find((tile) => flagOf(tile).kind === "holding" && !flagOf(tile).seat);
		const target = hexCentre(g, { col: 6, row: 6 });
		Object.assign(holding, { x: Math.round(target.x) + 20, y: Math.round(target.y) - 15 });
		const { realm } = realmFromDocuments(snapshot, g);
		const plan = planRealmSync(realm, g, textures, snapshot);
		expect(plan.Tile.update).toContainEqual(expect.objectContaining({ _id: holding._id, x: Math.round(target.x), y: Math.round(target.y) }));
	});

	it("unlocks a hidden Myth someone locked", () => {
		const { snapshot } = onScene();
		const myth = snapshot.tiles.find((tile) => flagOf(tile).kind === "myth");
		myth.locked = true;
		const { realm } = realmFromDocuments(snapshot, g);
		expect(planRealmSync(realm, g, textures, snapshot).Tile.update).toContainEqual({ _id: myth._id, locked: false });
	});

	it("removes duplicates and what the Realm no longer has, and leaves everything else alone", () => {
		const { snapshot } = onScene();
		const terrain = snapshot.tiles.find((tile) => flagOf(tile).kind === "terrain");
		snapshot.tiles.push({ ...structuredClone(terrain), _id: "copy" });
		snapshot.tiles.push({ _id: "stranger", x: 5, y: 5, flags: {} });
		const { realm } = realmFromDocuments(snapshot, g);
		const removed = realm.barriers.pop();
		const plan = planRealmSync(realm, g, textures, snapshot);
		expect(plan.Tile.delete).toEqual(["copy"]);
		expect(plan.Drawing.delete).toEqual([removed.id]);
		expect(plan.Tile.create).toEqual([]);
	});

	it("leaves an icon dragged off the map where it is, for Tidy to report", () => {
		const { snapshot } = onScene();
		const myth = snapshot.tiles.find((tile) => flagOf(tile).kind === "myth");
		Object.assign(myth, { x: g.width + 500, y: g.height + 500 });
		const { realm, problems } = realmFromDocuments(snapshot, g);
		expect(problems).toContainEqual(expect.objectContaining({ kind: "myth", reason: "offMap" }));
		const plan = planRealmSync(realm, g, textures, snapshot);
		expect(plan.Tile.delete).toEqual([]);
		expect(plan.Tile.update.map(({ _id }) => _id)).not.toContain(myth._id);

		const rerolled = generateRealm({ seed: "rerolled", geometry: g });
		expect(planRealmSync(rerolled, g, textures, snapshot, { replacing: true }).Tile.delete).toContain(myth._id);
	});

	it("only changes pictures when icons are imported", () => {
		const { snapshot } = onScene();
		const { realm } = realmFromDocuments(snapshot, g);
		const imported = realmTextures({
			terrain: [{ terrain: realm.terrain[0], path: "art/terrain.webp" }],
			holdings: [{ style: realm.holdings[0].style, path: "art/holding.webp" }]
		});
		const plan = planRealmSync(realm, g, imported, snapshot);
		expect(plan.Tile.create).toEqual([]);
		expect(plan.Tile.delete).toEqual([]);
		expect(plan.Tile.update.length).toBeGreaterThan(0);
		for (const { _id, ...changes } of plan.Tile.update) {
			expect(_id).toBeTruthy();
			expect(Object.keys(changes).every((key) => ["texture", "width", "height", "alpha"].includes(key))).toBe(true);
		}
	});

	it("creates the pieces of a Realm that has none yet", () => {
		const realm = generateRealm({ seed: "fresh", geometry: g });
		const plan = planRealmSync(realm, g, textures, { tiles: [], drawings: [] });
		expect(plan.Tile.create.length).toBe(realmDocuments(realm, g, textures).tiles.length);
		expect(plan.Drawing.create).toHaveLength(realm.barriers.length);
	});
});

describe("riverPieces", () => {
	it("runs straight down a column and leaves the lakes to carry the water", () => {
		const river = Array.from({ length: 12 }, (_, index) => ({ col: 6, row: index + 1 }));
		const terrain = new Array(144).fill(1);
		terrain[hexIndex(g, { col: 6, row: 5 })] = LAKE;
		const pieces = riverPieces(g, river, terrain);
		expect(pieces).toHaveLength(11);
		expect(pieces.every((piece) => piece.shape === "straight" && piece.rotation === 180)).toBe(true);
	});

	it("bends where the river turns", () => {
		const river = [{ col: 1, row: 3 }, { col: 2, row: 3 }, { col: 3, row: 3 }, { col: 3, row: 4 }];
		const pieces = riverPieces(g, river, new Array(144).fill(1));
		expect(pieces.every((piece) => RIVER_SHAPES.includes(piece.shape))).toBe(true);
		expect(pieces.map((piece) => piece.shape)).toContain("bend");
	});
});
