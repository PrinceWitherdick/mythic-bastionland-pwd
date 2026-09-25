import { describe, expect, it } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { LAKE, REALM_FLAG, RIVER_SHAPES, TERRAIN } from "../../module/rules/realm.js";
import { edgeKey, hexAt, hexCentre, hexIndex, hexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { generateRealm } from "../../module/rules/realm-generator.js";
import { riverNetworkPieces } from "../../module/rules/realm-rivers.js";
import { PICTURE_NAME, REALM_PALETTES } from "../../module/rules/realm-skins.js";
import {
	GRID_ALPHA,
	ICON_SCALE,
	LEVEL_ID,
	REALM_SORT,
	hiddenByHand,
	isRealmDocument,
	planChanges,
	planRealmSync,
	realmDocuments,
	realmFlagChanges,
	realmFromDocuments,
	realmSceneData,
	realmSceneFlag,
	realmTextures
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

	it("creates the pieces of a Realm that has none yet", () => {
		const realm = generateRealm({ seed: "fresh", geometry: g });
		const plan = planRealmSync(realm, g, textures, { tiles: [], drawings: [] });
		expect(plan.Tile.create.length).toBe(realmDocuments(realm, g, textures).tiles.length);
		expect(plan.Drawing.create).toHaveLength(realm.barriers.length);
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
		expect(read.realm.picture).toEqual({ players: { ...players, x: Math.round(g.width / 2), y: Math.round(g.height / 2), width: g.width, height: g.height } });
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
		expect(realmFromDocuments(without, g).realm.picture.players).toEqual(lined);
	});

	it("says in the Scene's flag that it has pictures, and forgets them when it loses them", () => {
		const realm = { ...generateRealm({ seed: "traced", geometry: g }), picture: { players } };
		const flag = realmSceneFlag(realm, g);
		expect(flag.picture).toEqual({ players });
		const { picture: _gone, ...plain } = realm;
		expect(realmFlagChanges(flag, plain, g)).toEqual({ set: {}, drop: ["picture"] });
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
