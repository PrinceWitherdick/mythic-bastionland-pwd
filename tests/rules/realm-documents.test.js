import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { replacementEntry, tileCentred, tileCentredUnsettled, tileSettling } from "../../module/compat.js";
import { SYSTEM_ID } from "../../module/system-id.js";
import { LAKE, PICTURE_ROLL, REALM_FLAG, RIVER_SHAPES, TERRAIN, emptyRealm } from "../../module/rules/realm.js";
import { edgeKey, hexAt, hexCentre, hexIndex, hexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { generateRealm } from "../../module/rules/realm-generator.js";
import { normaliseRealmPicture } from "../../module/rules/realm-map.js";
import { riverNetworkPieces } from "../../module/rules/realm-rivers.js";
import { PICTURE_NAME, REALM_PALETTES, terrainExtraPictures } from "../../module/rules/realm-skins.js";
import { pictureCount } from "../../module/rules/realm-pictures.js";
import {
	GRID_ALPHA,
	ICON_SCALE,
	LEVEL_ID,
	REALM_SORT,
	TILE_CORNERS_FLAG,
	hiddenByHand,
	hiddenTilesIn,
	isRealmDocument,
	openingScale,
	planChanges,
	planRealmSync,
	realmDocuments,
	realmFlagChanges,
	realmFromDocuments,
	realmSceneData,
	realmSceneFlag,
	realmTextures,
	terrainPicture,
	tilesSettled
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
	it("draws the Blank Realm sheet's own pictures, in parchment, by default", () => {
		const textures = realmTextures();
		expect(textures.terrain[1].src).toMatch(/assets\/realm\/sheet\/parchment\/terrain-marsh\.svg$/);
		// Its terrain fills the hex, but gives way to a Holding, as on the sheet.
		expect(textures.terrain[12]).toMatchObject({ icon: false, givesWay: true });
		expect(textures.holding.tower.src).toMatch(/sheet\/parchment\/holding-tower\.svg$/);
		expect(textures.landmark.curse.src).toMatch(/landmark-curse\.svg$/);
		expect(textures.myth[6].src).toMatch(/myth-6\.svg$/);
		expect(textures.river.bend.src).toMatch(/river-bend\.svg$/);
		expect(textures.colours).toEqual({ paper: "#efe8d8", grid: "#a89f90", barrier: "#8b1e1e" });
	});

	it("draws in the look's skin and colour set", () => {
		const textures = realmTextures({ skin: "seal", palette: "midnight" });
		expect(textures.terrain[5]).toEqual({ src: expect.stringMatching(/assets\/realm\/seal\/midnight\/terrain-forest\.svg$/), icon: false, givesWay: false });
		expect(textures.myth[2].src).toMatch(/seal\/midnight\/myth-2\.svg$/);
		expect(textures.colours).toEqual({ paper: "#1d2230", grid: "#4b5368", barrier: "#d8a24a" });
	});

	it("puts the GM's own pictures before the skin's", () => {
		const look = { skin: "woodcut", custom: { terrainFit: "icon", files: { "terrain-forest": "mine/forest.png", "holding-town": "mine/town.png", seat: "mine/crown.png" } } };
		const textures = realmTextures(look);
		expect(textures.terrain[5]).toEqual({ src: "mine/forest.png", icon: true, givesWay: true });
		expect(textures.terrain[6].src).toMatch(/woodcut\/parchment\/terrain-valley\.svg$/);
		expect(textures.holding.town.src).toBe("mine/town.png");
		expect(textures.seat.src).toBe("mine/crown.png");
		expect(textures.holding.castle.src).toMatch(/woodcut\/parchment\/holding-castle\.svg$/);
		expect(realmTextures({ custom: { files: { "terrain-marsh": "mine/marsh.png" } } }).terrain[1]).toMatchObject({ icon: false, givesWay: false });
	});

	it("lists the Blank Realm's other pictures of a terrain after its own", () => {
		const peaks = realmTextures().terrain[TERRAIN.indexOf("peaks") + 1];
		expect(peaks.pictures[0]).toBe(peaks.src);
		expect(peaks.pictures.slice(1)).toEqual(terrainExtraPictures("sheet", TERRAIN.indexOf("peaks") + 1).map((name) => expect.stringMatching(new RegExp(`sheet/parchment/${name}\\.svg$`))));
		expect(peaks.pictures.length).toBeGreaterThan(1);
		// The legend's Lake is the only one, as is a GM's own picture.
		expect(realmTextures().terrain[LAKE].pictures).toBeUndefined();
		expect(realmTextures({ custom: { files: { "terrain-peaks": "mine/peaks.png" } } }).terrain[TERRAIN.indexOf("peaks") + 1].pictures).toBeUndefined();
	});
});

describe("a hex's picture of its terrain", () => {
	const PEAKS = TERRAIN.indexOf("peaks") + 1;
	const realmOf = (variants) => ({ ...emptyRealm(g), terrain: new Array(g.cols * g.rows).fill(PEAKS), ...(variants ? { variants } : {}) });
	const terrainTiles = (realm, textures = realmTextures()) => realmDocuments(realm, g, textures).tiles.filter(({ match }) => match.startsWith("terrain:"));

	it("shows the picture its roll picks, and keeps the roll on its Tile", () => {
		const textures = realmTextures();
		const { pictures } = textures.terrain[PEAKS];
		const [a, b, c] = [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }];
		const variants = new Array(g.cols * g.rows).fill(0);
		variants[hexIndex(g, a)] = 3;
		variants[hexIndex(g, b)] = pictureCount(PEAKS);
		const tiles = terrainTiles(realmOf(variants), textures);
		const [first, second, third] = [a, b, c].map((hex) => tiles.find(({ match }) => match === `terrain:${hexKey(hex)}`).data);
		expect(first.texture.src).toBe(pictures[3]);
		expect(flagOf(first)).toEqual({ kind: "terrain", terrain: PEAKS, variant: 3 });
		expect(second.texture.src).toBe(pictures[0]);
		expect(third.texture.src).toBe(pictures[0]);
		expect(flagOf(third)).toEqual({ kind: "terrain", terrain: PEAKS });
		expect(terrainPicture(textures.terrain[PEAKS], PEAKS, 0)).toBe(textures.terrain[PEAKS].src);
	});

	it("shows a group's pictures for rolls past PICTURE_ROLL, and its own picture where the skin has none", () => {
		const peaks = realmTextures().terrain[PEAKS];
		expect(terrainPicture(peaks, PEAKS, PICTURE_ROLL + 2)).toMatch(/sheet\/parchment\/terrain-peaks-joined-2\.svg$/);
		expect(terrainPicture(peaks, PEAKS, PICTURE_ROLL + 99)).toBe(peaks.src);
		const classic = realmTextures({ skin: "classic" }).terrain[PEAKS];
		expect(terrainPicture(classic, PEAKS, PICTURE_ROLL + 2)).toBe(classic.src);
	});

	it("draws a Realm whose hexes never rolled just as before", () => {
		expect(terrainTiles(realmOf(null)).every(({ data }) => data.texture.src === realmTextures().terrain[PEAKS].src)).toBe(true);
		expect(terrainTiles(realmOf(null))).toEqual(terrainTiles(realmOf(new Array(g.cols * g.rows).fill(0))));
	});

	it("shows a GM's own picture, whatever the roll", () => {
		const textures = realmTextures({ custom: { files: { "terrain-peaks": "mine/peaks.png" } } });
		expect(terrainTiles(realmOf(new Array(g.cols * g.rows).fill(5)), textures).every(({ data }) => data.texture.src === "mine/peaks.png")).toBe(true);
	});

	it("reads the rolls back from the Tiles", () => {
		const variants = new Array(g.cols * g.rows).fill(0);
		variants[7] = 42;
		const tiles = terrainTiles(realmOf(variants)).map(({ data }) => data);
		expect(realmFromDocuments({ tiles }, g).realm.variants).toEqual(variants);
		expect(realmFromDocuments({ tiles: terrainTiles(realmOf(null)).map(({ data }) => data) }, g).realm.variants).toBeUndefined();
	});

	it("rewrites a Tile whose roll changed, and drops a roll the Realm no longer has", () => {
		const variants = new Array(g.cols * g.rows).fill(0);
		variants[hexIndex(g, { col: 2, row: 2 })] = 2;
		const tiles = terrainTiles(realmOf(variants)).map(({ match, data }) => ({ _id: match, ...data }));
		const plan = planRealmSync(realmOf(null), g, realmTextures(), { tiles });
		expect(plan.Tile.update).toHaveLength(1);
		const [update] = plan.Tile.update;
		expect(update).toMatchObject({ _id: "terrain:2,2", texture: { src: realmTextures().terrain[PEAKS].src } });
		const [path, flag] = replacementEntry(`flags.${SYSTEM_ID}.${REALM_FLAG}`, { kind: "terrain", terrain: PEAKS });
		expect(update[path]).toEqual(flag);
	});
});

describe("a Realm's setup", () => {
	it("rides on the Scene flag only when it isn't the book's, and is read back from it", () => {
		const own = realmGeometry({ cols: 14, rows: 7 });
		const realm = generateRealm({ seed: "setup", setup: { ignoreRules: true, cols: 14, rows: 7, roll: { terrain: false } }, geometry: own });
		const scene = realmSceneData({ name: "Mine", realm, geometry: own, textures: realmTextures() });
		expect(flagOf(scene)).toMatchObject({ cols: 14, rows: 7, setup: { ignoreRules: true, roll: { terrain: false } } });
		expect(realmFromDocuments({ flags: scene.flags }, own).realm.setup).toEqual(realm.setup);

		const book = realmSceneData({ name: "Book", realm: generateRealm({ seed: "setup", geometry: g }), geometry: g, textures: realmTextures() });
		expect(flagOf(book)).not.toHaveProperty("setup");
		expect(realmFromDocuments({ flags: book.flags }, g).realm).not.toHaveProperty("setup");
	});
});

describe("realmFlagChanges", () => {
	const own = realmGeometry({ cols: 14, rows: 7 });
	const realm = generateRealm({ seed: "flag", setup: { ignoreRules: true, cols: 14, rows: 7, lakes: 5 }, geometry: own });
	const saved = flagOf(realmSceneData({ name: "Mine", realm, geometry: own, textures: realmTextures() }));

	it("asks for nothing when the Scene's flag already holds the Realm, whatever order its setup was saved in", () => {
		expect(realmFlagChanges(saved, realm, own)).toBeNull();
		const reordered = { ...saved, setup: Object.fromEntries(Object.entries(saved.setup).reverse()) };
		expect(realmFlagChanges(reordered, realm, own)).toBeNull();
	});

	it("writes only what changed, such as a river laid or a new seed", () => {
		const laid = { ...realm, rivers: [...realm.rivers, [{ col: 1, row: 1 }, { col: 1, row: 2 }]] };
		expect(realmFlagChanges(saved, laid, own)).toEqual({ set: { rivers: [...saved.rivers, ["1,1", "1,2"]] }, drop: [] });
		expect(realmFlagChanges(saved, { ...realm, seed: "again" }, own)).toEqual({ set: { seed: "again" }, drop: [] });
	});

	it("drops the fields older Scenes kept their rivers in, and a setup the Realm no longer has", () => {
		const { rivers, ...rest } = saved;
		const old = { ...rest, river: rivers[0] ?? [], branches: rivers.slice(1) };
		expect(realmFlagChanges(old, realm, own)).toEqual({ set: { rivers }, drop: ["river", "branches"] });
		const { setup: _setup, ...book } = realm;
		expect(realmFlagChanges(saved, book, own)).toEqual({ set: {}, drop: ["setup"] });
	});
});

describe("realmSceneData", () => {
	it("paints the Scene and its Barriers in the look's colours", () => {
		const { key, paper, rule, accent } = REALM_PALETTES.at(-1);
		const realm = generateRealm({ seed: "colours", geometry: g });
		const data = realmSceneData({ name: "Night", realm, geometry: g, textures: realmTextures({ palette: key }) });
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
		expect(flagOf(scene)).toMatchObject({ version: 1, seed: "documents", size: 160, cols: 12, rows: 12, rivers: realm.rivers.map((course) => course.map(hexKey)) });
	});

	it("lays a locked terrain Tile centred on every hex", () => {
		const terrain = scene.tiles.filter((tile) => flagOf(tile).kind === "terrain");
		expect(terrain).toHaveLength(144);
		const first = terrain.find((tile) => tile.x === Math.round(hexCentre(g, { col: 1, row: 1 }).x) && tile.y === 80);
		expect(first).toMatchObject({ width: 185, height: 160, locked: true, hidden: false, alpha: 1, sort: REALM_SORT.terrain });
	});

	it("draws the GM's own terrain inside its hex when asked, and leaves a Holding's hex to the Holding", () => {
		const files = Object.fromEntries(TERRAIN.map((key) => [`terrain-${key}`, `mine/${key}.png`]));
		const icons = realmTextures({ skin: "classic", custom: { terrainFit: "icon", files } });
		const tiles = realmDocuments(realm, g, icons).tiles.map(({ data }) => data).filter((tile) => flagOf(tile).kind === "terrain");
		const holdings = new Set(realm.holdings.map((holding) => hexKey(holding.hex)));
		for (const tile of tiles) {
			expect(tile).toMatchObject({ width: Math.round(g.hexWidth * ICON_SCALE.terrain), height: Math.round(g.size * ICON_SCALE.terrain), texture: { fit: "contain" } });
			expect(tile.alpha).toBe(holdings.has(hexKey(hexAt(g, tile))) ? 0 : 1);
		}
		expect(tiles.filter((tile) => tile.alpha === 0)).toHaveLength(realm.holdings.length);
	});

	it("fills each hex with the Blank Realm's terrain, which also leaves a Holding's hex to the Holding", () => {
		const tiles = scene.tiles.filter((tile) => flagOf(tile).kind === "terrain");
		const holdings = new Set(realm.holdings.map((holding) => hexKey(holding.hex)));
		for (const tile of tiles) {
			const key = hexKey(hexAt(g, tile));
			expect(tile).toMatchObject({ width: Math.round(g.hexWidth), height: g.size, texture: { fit: "fill" } });
			expect(tile.alpha).toBe(holdings.has(key) ? 0 : 1);
			// A Valley keeps its own picture whether or not a river runs through it, the river piece being laid over it.
			const terrain = realm.terrain[hexIndex(g, hexAt(g, tile))];
			if (TERRAIN[terrain - 1] === "valley") expect(tile.texture.src.endsWith(`${PICTURE_NAME.terrain(terrain)}.svg`)).toBe(true);
		}
		const classic = realmDocuments(realm, g, realmTextures({ skin: "classic" })).tiles.filter(({ data }) => flagOf(data).kind === "terrain");
		expect(classic.every(({ data }) => data.alpha === 1)).toBe(true);
	});

	it("hides Myths and Landmarks without locking them, since a hidden locked Tile disappears for the GM too", () => {
		const hidden = scene.tiles.filter((tile) => ["myth", "landmark"].includes(flagOf(tile).kind));
		expect(hidden).toHaveLength(realm.myths.length + realm.landmarks.length);
		expect(hidden.every((tile) => tile.hidden && !tile.locked)).toBe(true);
		const holdings = scene.tiles.filter((tile) => flagOf(tile).kind === "holding");
		expect(holdings.every((tile) => !tile.hidden && !tile.locked)).toBe(true);
		expect(scene.tiles.filter((tile) => flagOf(tile).kind === "seat")).toHaveLength(1);
	});

	it("hangs the Seat of Power's crown above the middle of its Holding's hex", () => {
		const seat = scene.tiles.find((tile) => flagOf(tile).kind === "seat");
		const centre = hexCentre(g, realm.holdings.find((holding) => holding.seat).hex);
		expect(seat.x).toBe(Math.round(centre.x));
		expect(seat.y).toBeLessThan(centre.y);
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

describe("a Realm laid out with pointed tops", () => {
	const rows = realmGeometry({ layout: "evenRows" });
	const realm = generateRealm({ seed: "rows", geometry: rows });
	const scene = realmSceneData({ name: "Rows", realm, geometry: rows, textures: realmTextures(), units: "Hex" });

	it("builds a Scene on Foundry's row grid, and says so in its flag", () => {
		expect(scene).toMatchObject({ width: 2000, height: 1709, grid: { type: 3, size: 160 } });
		expect(flagOf(scene).layout).toBe("evenRows");
		// A Realm on the book's sheet says nothing, as Realms made before there was a choice don't.
		expect(flagOf(onScene().scene)).not.toHaveProperty("layout");
	});

	it("turns the flat-topped ground and river pictures a twelfth of a turn to fit each hex", () => {
		const terrain = scene.tiles.filter((tile) => flagOf(tile).kind === "terrain");
		expect(terrain).toHaveLength(144);
		for (const tile of terrain) expect(tile).toMatchObject({ width: Math.round(2 * rows.radius), height: 160, rotation: 330 });
		const rivers = scene.tiles.filter((tile) => flagOf(tile).kind === "river");
		expect(rivers.length).toBeGreaterThan(0);
		for (const tile of rivers) expect((tile.rotation + 30) % 60).toBe(0);
	});

	it("reads every hex back where it was laid, and asks for nothing more", () => {
		const snapshot = {
			flags: scene.flags,
			tiles: scene.tiles.map((tile, index) => ({ _id: `tile${index}`, ...structuredClone(tile) })),
			drawings: scene.drawings.map((drawing, index) => ({ _id: `drawing${index}`, ...structuredClone(drawing) }))
		};
		const { realm: back, problems } = realmFromDocuments(snapshot, rows);
		expect(problems).toEqual([]);
		expect(back.terrain).toEqual(realm.terrain);
		expect(back.barriers.map((barrier) => barrier.edge).sort()).toEqual(realm.barriers.map((barrier) => barrier.edge).sort());
		expect(planChanges(planRealmSync(back, rows, realmTextures(), snapshot))).toBe(false);
	});

	it("drops the layout from the flag when the Realm goes back to the book's", () => {
		expect(realmFlagChanges(flagOf(scene), realm, g)).toEqual({ set: {}, drop: ["layout"] });
	});
});

describe("realmFromDocuments", () => {
	it("reads back the Realm the Scene was built from", () => {
		const { realm, snapshot } = onScene();
		const { realm: read, problems } = realmFromDocuments(snapshot, g);
		const withoutIds = (list) => list.map(({ id: _id, ...rest }) => rest);
		expect(problems).toEqual([]);
		expect(read.terrain).toEqual(realm.terrain);
		expect(read.rivers).toEqual(realm.rivers);
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

describe("a Realm on Foundry v13, which places a Tile by its top-left corner", () => {
	const textures = realmTextures();
	beforeEach(() => { globalThis.game = { release: { generation: 13 } }; });
	afterEach(() => { delete globalThis.game; });
	/** The Scene's documents as actions/realm.js hands them over, each Tile centred. */
	const centred = (snapshot) => ({ ...snapshot, tiles: snapshot.tiles.map(tileCentred) });

	it("marks a Realm laid there as standing by its Tiles' corners, and one laid on v14 as standing where v14 places them", () => {
		const { scene } = onScene();
		expect(scene.flags[SYSTEM_ID][TILE_CORNERS_FLAG]).toBe(true);
		expect(tilesSettled(scene.flags)).toBe(true);
		// A Realm laid on v13 before the system knew has its Tiles' centres in x and y, and is read so.
		expect(tilesSettled({ [SYSTEM_ID]: { [REALM_FLAG]: {} } })).toBe(false);
		globalThis.game = { release: { generation: 14 } };
		expect(onScene().scene.flags[SYSTEM_ID][TILE_CORNERS_FLAG]).toBe(true);
		expect(tilesSettled({})).toBe(true);
	});

	it("puts each Tile's corner half its size up and left of its hex's centre", () => {
		const { scene } = onScene();
		// The first hex's ground is the first Tile laid.
		const terrain = scene.tiles.find((tile) => flagOf(tile).kind === "terrain");
		const centre = hexCentre(g, { col: 1, row: 1 });
		expect(terrain.x).toBe(Math.round(centre.x) - Math.floor(terrain.width / 2));
		expect(terrain.y).toBe(Math.round(centre.y) - Math.floor(terrain.height / 2));
	});

	it("reads the Realm back as it was made, and writes nothing more", () => {
		const { realm, snapshot } = onScene();
		const read = realmFromDocuments(centred(snapshot), g);
		expect(read.problems).toEqual([]);
		// v13 Tiles have no name to compare, so none is written.
		expect(snapshot.tiles.some((tile) => "name" in tile)).toBe(false);
		expect(read.realm.terrain).toEqual(realm.terrain);
		expect(read.realm.myths.map((myth) => hexKey(myth.hex))).toEqual(realm.myths.map((myth) => hexKey(myth.hex)));
		expect(planChanges(planRealmSync(read.realm, g, textures, centred(snapshot)))).toBe(false);
	});

	it("snaps a dragged icon back by its corner", () => {
		const { snapshot } = onScene();
		const holding = snapshot.tiles.find((tile) => flagOf(tile).kind === "holding" && !flagOf(tile).seat);
		const target = hexCentre(g, { col: 6, row: 6 });
		const corner = { x: Math.round(target.x) - Math.floor(holding.width / 2), y: Math.round(target.y) - Math.floor(holding.height / 2) };
		Object.assign(holding, { x: corner.x + 20, y: corner.y - 15 });
		const { realm } = realmFromDocuments(centred(snapshot), g);
		expect(planRealmSync(realm, g, textures, centred(snapshot)).Tile.update).toContainEqual(expect.objectContaining({ _id: holding._id, ...corner }));
	});

	it("finds a hidden Tile's hex by its centre", () => {
		const { realm, snapshot } = onScene();
		const seat = realm.holdings.find((holding) => holding.seat);
		for (const tile of centred(snapshot).tiles) {
			if (flagOf(tile).kind === "terrain" && hexKey(hexAt(g, tile)) === hexKey(seat.hex)) snapshot.tiles.find(({ _id }) => _id === tile._id).hidden = true;
		}
		const hidden = centred(snapshot).tiles.filter((tile) => tile.hidden);
		const terrain = hidden.filter((tile) => flagOf(tile).kind === "terrain");
		expect(terrain.length).toBeGreaterThan(0);
		expect(hiddenByHand(hidden, g, seat.hex)).toMatchObject({ terrain: true });
		expect(hiddenTilesIn(centred(snapshot).tiles, g, ["terrain"], [seat.hex]).map(({ _id }) => _id)).toEqual(terrain.map(({ _id }) => _id));
	});
});

/** What v14's upgrade does to a v13 Tile (migratePosition in v14's server Tile). */
function upgraded(tile) {
	const data = structuredClone(tile);
	data.texture ??= {};
	data.texture.anchorX ??= 0.5;
	data.texture.anchorY ??= 0.5;
	if (data.rotation === 0) {
		data.texture.anchorX -= 0.5;
		data.texture.anchorY -= 0.5;
	} else {
		data.x = Math.round((data.x ?? 0) + data.width / 2);
		data.y = Math.round((data.y ?? 0) + data.height / 2);
	}
	return data;
}

/** A snapshot's Tiles with an update's changes written in, as Foundry merges them. */
function written(snapshot, updates) {
	const byId = new Map(updates.map(({ _id, ...changes }) => [_id, changes]));
	return {
		...snapshot,
		tiles: snapshot.tiles.map((tile) => {
			const changes = byId.get(tile._id);
			if (!changes) return tile;
			return { ...tile, ...changes, texture: { ...tile.texture, ...changes.texture } };
		})
	};
}

describe("a Realm laid on v13 and opened on v14, whose upgrade anchors unturned Tiles on their corners", () => {
	const textures = realmTextures();
	afterEach(() => { delete globalThis.game; });
	const v13 = () => { globalThis.game = { release: { generation: 13 } }; };
	const v14 = () => { globalThis.game = { release: { generation: 14 } }; };
	/** The Scene's Tiles centred, as actions/realm.js reads them for how they stand (tilesSettled). */
	const read = (snapshot) => {
		const settled = tilesSettled(snapshot.flags, snapshot.tiles);
		return { ...snapshot, settled, tiles: snapshot.tiles.map((tile) => (settled ? tileCentred(tile) : tileCentredUnsettled(tile))) };
	};
	/** Each Tile's centre, by id. */
	const centresOf = (snapshot, centre) => Object.fromEntries(snapshot.tiles.map((tile) => [tile._id, [Math.round(centre(tile).x), Math.round(centre(tile).y)]]));

	it("reads a Realm laid by its Tiles' corners by their anchors, and puts each Tile right once", () => {
		v13();
		const { realm, snapshot: laid } = onScene();
		const meant = centresOf(laid, tileCentred);
		v14();
		const snapshot = { ...laid, tiles: laid.tiles.map(upgraded) };
		expect(snapshot.tiles.some((tile) => tile.rotation === 0 && tile.texture.anchorX === 0)).toBe(true);
		expect(snapshot.tiles.some((tile) => tile.rotation !== 0)).toBe(true);
		expect(tilesSettled(snapshot.flags, snapshot.tiles)).toBe(true);
		const { realm: back, problems } = realmFromDocuments(read(snapshot), g);
		expect(problems).toEqual([]);
		expect(back.terrain).toEqual(realm.terrain);
		expect(back.holdings.map((holding) => hexKey(holding.hex))).toEqual(realm.holdings.map((holding) => hexKey(holding.hex)));
		expect(back.myths.map((myth) => hexKey(myth.hex))).toEqual(realm.myths.map((myth) => hexKey(myth.hex)));
		expect(back.landmarks.map((landmark) => hexKey(landmark.hex))).toEqual(realm.landmarks.map((landmark) => hexKey(landmark.hex)));

		// Each Tile anchored on its corner is anchored on its middle again, at its centre.
		const plan = planRealmSync(back, g, textures, read(snapshot));
		expect(plan.Tile.create).toEqual([]);
		expect(plan.Tile.delete).toEqual([]);
		for (const tile of snapshot.tiles.filter((each) => each.texture.anchorX === 0)) {
			expect(plan.Tile.update).toContainEqual(expect.objectContaining({
				_id: tile._id, x: meant[tile._id][0], y: meant[tile._id][1], texture: expect.objectContaining({ anchorX: 0.5, anchorY: 0.5 })
			}));
		}
		// And once written, there's nothing more to write.
		const after = written(snapshot, plan.Tile.update);
		expect(centresOf(after, (tile) => tile)).toEqual(meant);
		expect(planChanges(planRealmSync(back, g, textures, read(after)))).toBe(false);
	});

	it("keeps a Realm laid on v14 settled when one of its Tiles is anchored on its corner by hand", () => {
		v14();
		const { snapshot: laid } = onScene();
		// Laid on v14 before Realms were marked so.
		const unmarked = { ...laid, flags: { [SYSTEM_ID]: { [REALM_FLAG]: laid.flags[SYSTEM_ID][REALM_FLAG] } } };
		const byHand = unmarked.tiles.findIndex((tile) => !tile.rotation);
		const tiles = unmarked.tiles.map((tile, index) => (index === byHand ? { ...tile, texture: { ...tile.texture, anchorX: 0, anchorY: 0 } } : tile));
		expect(tilesSettled(unmarked.flags, tiles)).toBe(true);
	});

	it("reads a Realm laid by its Tiles' centres, before v13 Tiles were settled, as it was laid, then settles it", () => {
		v13();
		const { realm, snapshot: corners } = onScene();
		// Laid before the system knew v13 places a Tile by its corner: each Tile's centre in its x and y, and no mark.
		const laid = {
			...corners,
			flags: { [SYSTEM_ID]: { [REALM_FLAG]: corners.flags[SYSTEM_ID][REALM_FLAG] } },
			tiles: corners.tiles.map((tile) => ({ ...tile, x: tileCentred(tile).x, y: tileCentred(tile).y }))
		};
		const meant = centresOf(laid, (tile) => tile);
		v14();
		const snapshot = { ...laid, tiles: laid.tiles.map(upgraded) };
		expect(tilesSettled(snapshot.flags, snapshot.tiles)).toBe(false);
		// Without its Tiles to look at, a Realm on v14 is taken as settled, as it was before.
		expect(tilesSettled(snapshot.flags)).toBe(true);
		const { realm: back, problems } = realmFromDocuments(read(snapshot), g);
		expect(problems).toEqual([]);
		expect(back.terrain).toEqual(realm.terrain);
		expect(back.myths.map((myth) => hexKey(myth.hex))).toEqual(realm.myths.map((myth) => hexKey(myth.hex)));
		expect(centresOf(read(snapshot), (tile) => tile)).toEqual(meant);

		// A look tried out before it's settled is written as it was laid: no anchor changes, so it's still read the same way.
		const unsettledPlan = planRealmSync(back, g, textures, read(snapshot));
		expect(unsettledPlan.Tile.update.some((update) => update.texture?.anchorX !== undefined)).toBe(false);
		expect(centresOf(read(written(snapshot, unsettledPlan.Tile.update)), (tile) => tile)).toEqual(meant);

		// Settled, as settleRealmTiles does, each Tile stands at its centre anchored on its middle.
		const settled = written({ ...snapshot, flags: { [SYSTEM_ID]: { ...snapshot.flags[SYSTEM_ID], [TILE_CORNERS_FLAG]: true } } },
			snapshot.tiles.map((tile) => ({ _id: tile._id, ...tileSettling(tile) })));
		expect(tilesSettled(settled.flags, settled.tiles)).toBe(true);
		expect(centresOf(settled, (tile) => tile)).toEqual(meant);
		expect(settled.tiles.every((tile) => tile.texture.anchorX === 0.5 && tile.texture.anchorY === 0.5)).toBe(true);
		// v13 Tiles have no name, which v14 writes; nothing else needs writing.
		const plan = planRealmSync(back, g, textures, read(settled));
		expect(plan.Tile.create).toEqual([]);
		expect(plan.Tile.delete).toEqual([]);
		expect(plan.Tile.update.every((update) => Object.keys(update).every((key) => ["_id", "name"].includes(key)))).toBe(true);
	});

	it("takes no notice of a Tile that isn't the Realm's", () => {
		v14();
		const stranger = { _id: "stranger", x: 0, y: 0, rotation: 0, texture: { anchorX: 0, anchorY: 0 }, flags: {} };
		expect(tilesSettled({}, [stranger])).toBe(true);
	});
});

describe("a Realm on v13 not yet settled", () => {
	const textures = realmTextures();
	beforeEach(() => { globalThis.game = { release: { generation: 13 } }; });
	afterEach(() => { delete globalThis.game; });

	it("writes a look tried out by its Tiles' centres, as it was laid", () => {
		const { snapshot: corners } = onScene();
		const snapshot = { ...corners, settled: false, tiles: corners.tiles.map(tileCentred) };
		const holding = snapshot.tiles.find((tile) => flagOf(tile).kind === "holding" && !flagOf(tile).seat);
		const target = { x: holding.x, y: holding.y };
		Object.assign(holding, { x: holding.x + 20, y: holding.y - 15 });
		const { realm } = realmFromDocuments(snapshot, g);
		expect(planRealmSync(realm, g, textures, snapshot).Tile.update).toContainEqual(expect.objectContaining({ _id: holding._id, ...target }));
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

	it("keeps the Referee's own fading of the icons, as over a map that draws them, but not of the ground", () => {
		const { snapshot } = onScene();
		const faded = ["holding", "seat", "myth", "landmark"].map((kind) => snapshot.tiles.find((tile) => flagOf(tile).kind === kind));
		for (const tile of faded) tile.alpha = 0;
		const terrain = snapshot.tiles.find((tile) => flagOf(tile).kind === "terrain" && tile.alpha === 1);
		terrain.alpha = 0;
		const { realm } = realmFromDocuments(snapshot, g);
		const { update } = planRealmSync(realm, g, textures, snapshot).Tile;
		expect(update.filter(({ _id }) => faded.some((tile) => tile._id === _id))).toEqual([]);
		expect(update).toContainEqual({ _id: terrain._id, alpha: 1 });
	});

	it("draws each icon at its look's fading, a Seat's crown as its Holding, and leaves the ground to the Realm", () => {
		const faded = realmTextures({ fade: { holding: 0.2, landmark: 0, myth: 0.6 } });
		expect(faded.alpha).toEqual({ holding: 0.2, landmark: 0, myth: 0.6 });
		const { tiles } = realmDocuments(generateRealm({ seed: "faded", geometry: g }), g, faded);
		const alphas = (kind) => [...new Set(tiles.filter(({ data }) => flagOf(data).kind === kind).map(({ data }) => data.alpha))];
		expect(alphas("holding")).toEqual([0.2]);
		expect(alphas("seat")).toEqual([0.2]);
		expect(alphas("landmark")).toEqual([0]);
		expect(alphas("myth")).toEqual([0.6]);
		expect(alphas("terrain")).toContain(1);
	});

	it("fades every icon of a kind whose fading changed, even those faded by hand, and keeps the rest as they were", () => {
		const { snapshot } = onScene();
		const tileOf = (kind) => snapshot.tiles.find((tile) => flagOf(tile).kind === kind);
		const [holding, seat, landmark] = [tileOf("holding"), tileOf("seat"), tileOf("landmark")];
		for (const tile of [holding, seat, landmark]) tile.alpha = 0.4;
		const { realm } = realmFromDocuments(snapshot, g);
		const faded = realmTextures({ fade: { holding: 0, landmark: 0, myth: 1 } });
		const { update } = planRealmSync(realm, g, faded, snapshot, { refade: ["holding"] }).Tile;
		expect(update).toContainEqual({ _id: holding._id, alpha: 0 });
		expect(update).toContainEqual({ _id: seat._id, alpha: 0 });
		expect(update.some(({ _id }) => _id === landmark._id)).toBe(false);
	});

	it("unlocks a hidden Myth someone locked", () => {
		const { snapshot } = onScene();
		const myth = snapshot.tiles.find((tile) => flagOf(tile).kind === "myth");
		myth.locked = true;
		const { realm } = realmFromDocuments(snapshot, g);
		expect(planRealmSync(realm, g, textures, snapshot).Tile.update).toContainEqual({ _id: myth._id, locked: false });
	});

	it("gives a Myth brought back, as by Undo, the id its Tile had", () => {
		const { snapshot } = onScene();
		const { realm } = realmFromDocuments(snapshot, g);
		const myth = snapshot.tiles.find((tile) => flagOf(tile).kind === "myth");
		const without = { ...snapshot, tiles: snapshot.tiles.filter((tile) => tile !== myth) };
		const plan = planRealmSync(realm, g, textures, without);
		expect(plan.Tile.create).toContainEqual(expect.objectContaining({ _id: myth._id }));
		// An id another Tile holds now is left for Foundry to choose afresh.
		const holder = { ...structuredClone(snapshot.tiles.find((tile) => !flagOf(tile).kind)), _id: myth._id, flags: {} };
		const taken = planRealmSync(realm, g, textures, { ...without, tiles: [...without.tiles, holder] });
		expect(taken.Tile.create.some((data) => data._id === myth._id)).toBe(false);
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

	it("leaves an icon dragged off the map where it is, and reports it", () => {
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

	it("only changes pictures when the look changes, and the shores of lakes only the Blank Realm joins up", () => {
		const { snapshot } = onScene();
		const { realm } = realmFromDocuments(snapshot, g);
		const woodcut = realmTextures({ skin: "woodcut", palette: "ochre" });
		const plan = planRealmSync(realm, g, woodcut, snapshot);
		expect(plan.Tile.create).toEqual([]);
		const joins = snapshot.tiles.filter((tile) => ["shore", "mouth"].includes(flagOf(tile).kind)).map((tile) => tile._id);
		expect(plan.Tile.delete.sort()).toEqual(joins.sort());
		expect(plan.Tile.update.length).toBeGreaterThan(0);
		for (const { _id, ...changes } of plan.Tile.update) {
			expect(_id).toBeTruthy();
			expect(Object.keys(changes).every((key) => ["texture", "width", "height", "alpha"].includes(key))).toBe(true);
		}
	});

	it("hangs a crown over each of two Holdings disputing the Seat, and reads the dispute back without rewriting it (p202)", () => {
		const { snapshot } = onScene();
		const { realm } = realmFromDocuments(snapshot, g);
		const crown = snapshot.tiles.find((tile) => flagOf(tile).kind === "seat");
		const [first, second] = realm.holdings.filter((holding) => !holding.seat);
		realm.holdings.forEach((holding) => {
			if (holding.seat || holding === first) Object.assign(holding, { seat: true, disputed: true });
		});
		// The crown already hanging is kept where its Seat still stands, and a second one made.
		const plan = planRealmSync(realm, g, textures, snapshot);
		expect(plan.Tile.delete).toEqual([]);
		expect(plan.Tile.update.map(({ _id }) => _id)).not.toContain(crown._id);
		expect(plan.Tile.create.filter((tile) => flagOf(tile).kind === "seat").map((tile) => hexKey(hexAt(g, tile)))).toEqual([hexKey(first.hex)]);

		const disputed = realmSceneData({ name: "Disputed", realm, geometry: g, textures, units: "Hex" });
		const scene = { flags: disputed.flags, tiles: disputed.tiles.map((tile, index) => ({ _id: `tile${index}`, ...tile })), drawings: [] };
		const read = realmFromDocuments(scene, g).realm;
		expect(read.holdings.filter((holding) => holding.seat).map((holding) => holding.disputed)).toEqual([true, true]);
		expect(read.holdings.find((holding) => hexKey(holding.hex) === hexKey(second.hex))).not.toHaveProperty("disputed");
		expect(planChanges(planRealmSync(read, g, textures, scene))).toBe(false);

		// Settled, the losing Seat's crown comes down.
		read.holdings.find((holding) => hexKey(holding.hex) === hexKey(first.hex)).seat = false;
		const settled = planRealmSync(read, g, textures, scene);
		const fallen = scene.tiles.find((tile) => flagOf(tile).kind === "seat" && hexKey(hexAt(g, tile)) === hexKey(first.hex));
		expect(settled.Tile.delete).toEqual([fallen._id]);
	});

	it("writes a changed flag whole, so a dispute settled leaves no mark on the Tile", () => {
		const { snapshot } = onScene();
		const tile = snapshot.tiles.find((candidate) => flagOf(candidate).kind === "holding" && flagOf(candidate).seat);
		flagOf(tile).disputed = true;
		const { realm } = realmFromDocuments(snapshot, g);
		delete realm.holdings.find((holding) => holding.id === tile._id).disputed;
		const [path] = replacementEntry(`flags.${SYSTEM_ID}.${REALM_FLAG}`, {});
		const update = planRealmSync(realm, g, textures, snapshot).Tile.update.find(({ _id }) => _id === tile._id);
		expect(update).not.toHaveProperty("flags");
		const { disputed: _disputed, ...settled } = flagOf(tile);
		expect(update[path]).toStrictEqual(settled);
	});

	it("creates the pieces of a Realm that has none yet", () => {
		const realm = generateRealm({ seed: "fresh", geometry: g });
		const plan = planRealmSync(realm, g, textures, { tiles: [], drawings: [] });
		expect(plan.Tile.create.length).toBe(realmDocuments(realm, g, textures).tiles.length);
		expect(plan.Drawing.create).toHaveLength(realm.barriers.length);
	});
});

describe("the zoom a Realm opens at", () => {
	it("is half size for a typical Realm, either way its hexes sit", () => {
		expect(openingScale(g)).toBe(0.5);
		expect(openingScale(realmGeometry({ layout: "evenRows" }))).toBe(0.5);
		expect(openingScale(realmGeometry({ cols: 17, rows: 8 }))).toBe(0.5);
		const scene = realmSceneData({ name: "Opening", realm: generateRealm({ seed: "opening", geometry: g }), geometry: g, textures: realmTextures() });
		expect(scene.initial).toEqual({ x: Math.round(g.width / 2), y: Math.round(g.height / 2), scale: 0.5 });
	});

	it("is further out for a very long or tall Realm, so it's seen whole along its length", () => {
		const long = realmGeometry({ cols: 60, rows: 3 });
		const tall = realmGeometry({ cols: 3, rows: 57 });
		expect(long.width * openingScale(long)).toBeLessThanOrEqual(1600);
		expect(tall.height * openingScale(tall)).toBeLessThanOrEqual(1000);
		expect(openingScale(long)).toBeLessThan(0.5);
	});
});

describe("a Realm traced over a picture", () => {
	const textures = realmTextures();
	const pictured = (picture) => {
		const realm = { ...generateRealm({ seed: "traced", geometry: g }), picture };
		return { realm, tiles: realmDocuments(realm, g, textures).tiles.map(({ data }) => data) };
	};
	const players = { src: "art/realm-maps/open.webp" };
	const referee = { src: "art/realm-maps/secret.webp" };

	it("lays the players' picture under the whole map, loose for the GM to nudge", () => {
		const { tiles } = pictured({ players });
		const maps = tiles.filter((tile) => flagOf(tile).kind === "map");
		expect(maps).toHaveLength(1);
		expect(maps[0]).toMatchObject({
			x: Math.round(g.width / 2), y: Math.round(g.height / 2), width: g.width, height: g.height,
			texture: { src: players.src, fit: "fill" }, sort: REALM_SORT.map, hidden: false, locked: false
		});
		// Under everything else on the map.
		expect(REALM_SORT.map).toBeLessThan(REALM_SORT.terrain);
	});

	it("draws the system's own ground and water at nothing, so the drawing shows through", () => {
		const { tiles } = pictured({ players });
		const drawn = (kinds) => tiles.filter((tile) => kinds.includes(flagOf(tile).kind));
		expect(drawn(["terrain"]).every((tile) => tile.alpha === 0)).toBe(true);
		expect(drawn(["river", "shore", "mouth"]).every((tile) => tile.alpha === 0)).toBe(true);
		// The Holdings, Myths and Landmarks are still drawn: the players' map of the sheet shows none of them.
		expect(drawn(["holding", "myth", "landmark", "seat"]).every((tile) => tile.alpha === 1)).toBe(true);
	});

	it("draws the Holdings and Landmarks even on a Realm once told its picture drew them", () => {
		const { tiles } = pictured({ players, features: true });
		const icons = tiles.filter((tile) => ["holding", "myth", "landmark", "seat"].includes(flagOf(tile).kind));
		expect(icons.length).toBeGreaterThan(0);
		expect(icons.every((tile) => tile.alpha === 1)).toBe(true);
	});

	it("keeps its pictures through a sync, rather than sweeping them off the map", () => {
		const realm = { ...generateRealm({ seed: "traced", geometry: g }), picture: { players } };
		const scene = realmSceneData({ name: "Traced", realm, geometry: g, textures });
		const snapshot = {
			flags: scene.flags,
			tiles: scene.tiles.map((tile, index) => ({ _id: `tile${index}`, ...structuredClone(tile) })),
			drawings: scene.drawings.map((drawing, index) => ({ _id: `drawing${index}`, ...structuredClone(drawing) }))
		};
		const read = realmFromDocuments(snapshot, g);
		expect(read.realm.picture).toEqual({ players: { ...players, bare: false, x: Math.round(g.width / 2), y: Math.round(g.height / 2), width: g.width, height: g.height } });
		expect(planChanges(planRealmSync(read.realm, g, textures, snapshot))).toBe(false);
	});

	it("sweeps off the referee's map a Realm once carried over the players'", () => {
		const realm = { ...generateRealm({ seed: "traced", geometry: g }), picture: { players } };
		const scene = realmSceneData({ name: "Traced", realm, geometry: g, textures });
		const map = scene.tiles.find((tile) => flagOf(tile).kind === "map");
		const old = { ...structuredClone(map), texture: { src: referee.src }, hidden: true, flags: { [SYSTEM_ID]: { [REALM_FLAG]: { kind: "map", role: "referee" } } } };
		const snapshot = {
			flags: scene.flags,
			tiles: [...scene.tiles, old].map((tile, index) => ({ _id: `tile${index}`, ...structuredClone(tile) })),
			drawings: scene.drawings.map((drawing, index) => ({ _id: `drawing${index}`, ...structuredClone(drawing) }))
		};
		const read = realmFromDocuments(snapshot, g);
		expect(read.realm.picture).not.toHaveProperty("referee");
		expect(planRealmSync(read.realm, g, textures, snapshot).Tile.delete).toEqual([`tile${scene.tiles.length}`]);
	});

	it("takes a picture the GM nudged where they left it, and puts it back if its Tile goes", () => {
		const lined = { ...players, x: 900, y: 1100, width: 1800, height: 2100 };
		const realm = { ...generateRealm({ seed: "traced", geometry: g }), picture: { players: lined } };
		const scene = realmSceneData({ name: "Traced", realm, geometry: g, textures });
		const tiles = scene.tiles.map((tile, index) => ({ _id: `tile${index}`, ...structuredClone(tile) }));
		const snapshot = { flags: scene.flags, tiles, drawings: [] };

		const map = tiles.find((tile) => flagOf(tile).kind === "map");
		Object.assign(map, { x: 950, y: 1050 });
		expect(realmFromDocuments(snapshot, g).realm.picture.players).toMatchObject({ x: 950, y: 1050, width: 1800 });

		// The Scene's flag remembers where it was left, so a picture whose Tile is deleted comes back there.
		const without = { ...snapshot, tiles: tiles.filter((tile) => tile !== map) };
		expect(realmFromDocuments(without, g).realm.picture.players).toEqual({ ...lined, bare: false });
	});

	it("says in the Scene's flag that it has pictures, and forgets them when it loses them", () => {
		const realm = { ...generateRealm({ seed: "traced", geometry: g }), picture: { players } };
		const flag = realmSceneFlag(realm, g);
		expect(flag.picture).toEqual({ players });
		const { picture: _gone, ...plain } = realm;
		expect(realmFlagChanges(flag, plain, g)).toEqual({ set: {}, drop: ["picture"] });
	});

	it("says a picture has hexes on it in so many words, since the flag is merged into and would keep an old bare", () => {
		const realm = (bare) => ({ ...generateRealm({ seed: "traced", geometry: g }), picture: normaliseRealmPicture({ players: { ...players, bare } }) });
		const stale = realmSceneFlag(realm(true), g);
		expect(realmFlagChanges(stale, realm(false), g).set.picture.players.bare).toBe(false);
		// A flag from before the word was kept is written once, then matches.
		const old = { ...realmSceneFlag(realm(false), g), picture: { players } };
		const changes = realmFlagChanges(old, realm(false), g);
		expect(Object.keys(changes.set)).toEqual(["picture"]);
		expect(realmFlagChanges({ ...old, ...changes.set }, realm(false), g)).toBeNull();
	});

	it("reads a map with no hexes on it back from the flag as bare", () => {
		const realm = { ...generateRealm({ seed: "traced", geometry: g }), picture: { players: { ...players, bare: true } } };
		const scene = realmSceneData({ name: "Traced", realm, geometry: g, textures });
		const tiles = scene.tiles.map((tile, index) => ({ _id: `tile${index}`, ...structuredClone(tile) }));
		expect(realmFromDocuments({ flags: scene.flags, tiles, drawings: [] }, g).realm.picture.players.bare).toBe(true);
	});
});

describe("riverNetworkPieces", () => {
	it("runs straight down a column and leaves the lakes to carry the water", () => {
		const river = Array.from({ length: 12 }, (_, index) => ({ col: 6, row: index + 1 }));
		const terrain = new Array(144).fill(1);
		terrain[hexIndex(g, { col: 6, row: 5 })] = LAKE;
		const pieces = riverNetworkPieces(g, [river], terrain);
		expect(pieces).toHaveLength(11);
		expect(pieces.every((piece) => piece.shape === "straight" && piece.rotation === 180)).toBe(true);
	});

	it("bends where the river turns", () => {
		const river = [{ col: 1, row: 3 }, { col: 2, row: 3 }, { col: 3, row: 3 }, { col: 3, row: 4 }];
		const pieces = riverNetworkPieces(g, [river], new Array(144).fill(1));
		expect(pieces.every((piece) => RIVER_SHAPES.includes(piece.shape))).toBe(true);
		expect(pieces.map((piece) => piece.shape)).toContain("bend");
	});
});

describe("hiddenByHand", () => {
	it("finds the terrain, Holding and Seat Tiles the GM has hidden in a hex, and nothing elsewhere", () => {
		const { realm, snapshot } = onScene();
		const seat = realm.holdings.find((holding) => holding.seat);
		const hide = (kind) =>
			snapshot.tiles
				.filter((tile) => flagOf(tile)?.kind === kind && hexKey(hexAt(g, tile)) === hexKey(seat.hex))
				.forEach((tile) => (tile.hidden = true));
		expect(hiddenByHand(snapshot.tiles, g, seat.hex)).toEqual({ terrain: false, holding: false, seat: false });
		hide("terrain");
		hide("seat");
		expect(hiddenByHand(snapshot.tiles, g, seat.hex)).toEqual({ terrain: true, holding: false, seat: true });
		hide("holding");
		expect(hiddenByHand(snapshot.tiles, g, seat.hex)).toEqual({ terrain: true, holding: true, seat: true });
		const other = realm.holdings.find((holding) => hexKey(holding.hex) !== hexKey(seat.hex));
		expect(hiddenByHand(snapshot.tiles, g, other.hex)).toEqual({ terrain: false, holding: false, seat: false });
	});
});

describe("the blog's Landmarks on their Tiles", () => {
	const g = realmGeometry();
	const landmark = (col, extra) => ({ id: null, hex: { col, row: 3 }, name: "", seer: null, revealed: false, ...extra });
	const realm = { ...emptyRealm(g, "blog"), landmarks: [
		landmark(1, { type: "fountain", variant: "inky" }),
		landmark(2, { type: "pond", pair: 2 }),
		landmark(3, { type: "bridge", won: true, gloried: true, revealed: true }),
		landmark(4, { type: "other", name: "The Hanging Stone" }),
		landmark(5, { type: "dwelling" })
	] };
	realm.terrain.fill(1);
	const tiles = realmDocuments(realm, g, realmTextures()).tiles.map(({ data }, index) => ({ _id: `tile${index}`, ...data }));
	const back = (from) => realmFromDocuments({ tiles: from }, g).realm.landmarks;

	it("writes which sort, which pair and whether won, and reads them back", () => {
		expect(back(tiles).map(({ id: _id, ...rest }) => rest)).toEqual(realm.landmarks.map(({ id: _id, ...rest }) => rest));
	});

	it("gives each its own picture", () => {
		const bridge = tiles.find((tile) => flagOf(tile).type === "bridge");
		expect(bridge.texture.src.endsWith(`${PICTURE_NAME.landmark("bridge")}.svg`)).toBe(true);
	});

	it("reads back nothing that doesn't belong to the kind", () => {
		const spoiled = tiles.map((tile) => (flagOf(tile)?.kind === "landmark"
			? { ...tile, flags: { [SYSTEM_ID]: { [REALM_FLAG]: { ...flagOf(tile), variant: "summer", pair: -1, won: "yes", gloried: 1 } } } }
			: tile));
		for (const landmark of back(spoiled)) {
			expect(landmark).not.toHaveProperty("variant");
			expect(landmark).not.toHaveProperty("pair");
			expect(landmark).not.toHaveProperty("won");
			expect(landmark).not.toHaveProperty("gloried");
		}
	});
});
