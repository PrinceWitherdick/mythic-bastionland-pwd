import { describe, expect, it } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { LAKE, REALM_FLAG, RIVER_SHAPES, TERRAIN, emptyRealm, validateRealm } from "../../module/rules/realm.js";
import { edgeDirection, hexIndex, hexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { RIVER_PIECE_EDGES, SHORE_SHAPES, lakeWorks, pieceFor, riverCourses, riverNetworkPieces } from "../../module/rules/realm-rivers.js";
import { realmDocuments, realmFromDocuments, realmSceneData, realmTextures } from "../../module/rules/realm-documents.js";

const g = realmGeometry();
const VALLEY = TERRAIN.indexOf("valley") + 1;
const hexes = (text) => text.split(" ").map((key) => {
	const [col, row] = key.split(",").map(Number);
	return { col, row };
});
const land = () => new Array(g.cols * g.rows).fill(1);
const flagOf = (data) => data.flags[SYSTEM_ID][REALM_FLAG];

describe("pieceFor", () => {
	it("knows every river piece", () => {
		expect(Object.keys(RIVER_PIECE_EDGES).sort()).toEqual([...RIVER_SHAPES].sort());
	});

	it.each(RIVER_SHAPES)("finds %s however it's turned", (shape) => {
		for (let turn = 0; turn < 6; turn++) {
			const edges = RIVER_PIECE_EDGES[shape].map((edge) => (edge + turn) % 6);
			const piece = pieceFor(edges);
			expect(piece.shape).toBe(shape);
			expect(RIVER_PIECE_EDGES[shape].map((edge) => (edge + piece.rotation / 60) % 6).sort()).toEqual([...edges].sort());
		}
	});

	it("covers every way three edges can meet, and no more", () => {
		const threes = [];
		for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) threes.push([a, b, c]);
		expect(threes.every((edges) => pieceFor(edges)?.shape.startsWith("fork") || pieceFor(edges)?.shape === "fan")).toBe(true);
		expect(pieceFor([0, 1, 2, 3])).toBeNull();
	});
});

describe("riverNetworkPieces", () => {
	const river = hexes("6,1 6,2 6,3 6,4 6,5 6,6");

	it("forks the river where a branch leaves it", () => {
		const branch = hexes("6,3 5,4 4,4");
		const pieces = riverNetworkPieces(g, [river, branch], land());
		const fork = pieces.find((piece) => hexKey(piece.hex) === "6,3");
		expect(fork.shape).toMatch(/^fork|fan$/);
		// The fork reaches the river's edges and the branch's.
		const edges = RIVER_PIECE_EDGES[fork.shape].map((edge) => (edge + fork.rotation / 60) % 6).sort();
		expect(edges).toEqual([edgeDirection(g, { col: 6, row: 3 }, { col: 6, row: 2 }), edgeDirection(g, { col: 6, row: 3 }, { col: 6, row: 4 }),
			edgeDirection(g, { col: 6, row: 3 }, { col: 5, row: 4 })].sort());
		// One piece to a hex, the river's numbered first by their place along it.
		expect(new Set(pieces.map((piece) => hexKey(piece.hex))).size).toBe(pieces.length);
		expect(pieces.slice(0, river.length).map((piece) => piece.index)).toEqual(river.map((_, index) => index));
	});

	it("rises in a spring where a branch ends away from the map's edge and any other river", () => {
		const pieces = riverNetworkPieces(g, [river, hexes("6,3 5,4 4,4")], land());
		expect(pieces.find((piece) => hexKey(piece.hex) === "4,4").shape).toBe("end");
	});

	it("runs a river of its own off the map's edges like the river, meeting no other", () => {
		const own = hexes("1,8 1,9 1,10 1,11 1,12");
		const pieces = riverNetworkPieces(g, [river, own], land()).filter((piece) => piece.hex.col === 1);
		expect(pieces).toHaveLength(5);
		expect(pieces.every((piece) => ["straight", "bend", "sharp"].includes(piece.shape))).toBe(true);
	});

	it("lays each course's own piece where four edges meet, which no one piece reaches", () => {
		const across = hexes("4,4 5,4 6,4 7,4 8,4");
		const pieces = riverNetworkPieces(g, [river, across], land()).filter((piece) => hexKey(piece.hex) === "6,4");
		expect(pieces).toHaveLength(2);
		expect(new Set(pieces.map((piece) => piece.index)).size).toBe(2);
	});

	it("leaves lakes to carry the water", () => {
		const terrain = land();
		terrain[hexIndex(g, { col: 6, row: 3 })] = LAKE;
		expect(riverNetworkPieces(g, [river, hexes("6,3 5,4")], terrain).some((piece) => hexKey(piece.hex) === "6,3")).toBe(false);
	});
});

describe("lakeWorks", () => {
	it("leaves a lake alone, with no river running in, to its own drawing", () => {
		const terrain = land();
		terrain[hexIndex(g, { col: 4, row: 4 })] = LAKE;
		expect(lakeWorks(g, [], terrain)).toEqual({ water: [], shores: [], mouths: [] });
	});

	it("joins lakes side by side, with a shore on every edge they share with land", () => {
		const terrain = land();
		for (const hex of hexes("4,4 4,5")) terrain[hexIndex(g, hex)] = LAKE;
		const { water, shores, mouths } = lakeWorks(g, [], terrain);
		expect(water.map(hexKey)).toEqual(["4,4", "4,5"]);
		expect(shores).toHaveLength(10);
		expect(mouths).toEqual([]);
		// The shores beside the edge between them turn toward it.
		const top = shores.filter((shore) => hexKey(shore.hex) === "4,4");
		expect(top.map((shore) => shore.shape).sort()).toEqual(["ccw", "closed", "closed", "closed", "cw"]);
		expect(shores.every((shore) => SHORE_SHAPES.includes(shore.shape) && shore.rotation === ((shore.edge - 1) * 60 + 360) % 360)).toBe(true);
	});

	it("opens a lake's shore where a river runs into it", () => {
		const terrain = land();
		terrain[hexIndex(g, { col: 6, row: 4 })] = LAKE;
		const { water, shores, mouths } = lakeWorks(g, [hexes("6,1 6,2 6,3 6,4")], terrain);
		expect(water.map(hexKey)).toEqual(["6,4"]);
		expect(shores).toHaveLength(6);
		expect(mouths).toEqual([{ hex: { col: 6, row: 4 }, edge: 4, rotation: 180 }]);
	});
});

describe("a Realm's rivers on its Scene", () => {
	const realm = emptyRealm(g, "branches");
	realm.terrain = land();
	realm.rivers = [hexes("6,1 6,2 6,3 6,4 6,5 6,6"), hexes("6,3 5,4 4,4")];

	it("ride on the Scene flag and are read back from it", () => {
		const scene = realmSceneData({ name: "Branches", realm, geometry: g, textures: realmTextures() });
		expect(flagOf(scene).rivers).toEqual([["6,1", "6,2", "6,3", "6,4", "6,5", "6,6"], ["6,3", "5,4", "4,4"]]);
		expect(realmFromDocuments({ flags: scene.flags }, g).realm.rivers).toEqual(realm.rivers);
		expect(validateRealm(realm, g).filter((problem) => problem.kind === "river")).toEqual([]);
	});

	it("are read from a Scene made when a Realm had a river and branches", () => {
		const scene = realmSceneData({ name: "Old", realm, geometry: g, textures: realmTextures() });
		const flag = flagOf(scene);
		delete flag.rivers;
		Object.assign(flag, { river: ["6,1", "6,2", "6,3", "6,4", "6,5", "6,6"], branches: [["6,3", "5,4", "4,4"]] });
		expect(realmFromDocuments({ flags: scene.flags }, g).realm.rivers).toEqual(realm.rivers);
	});

	it("are written even when there are none, so a Realm that loses them doesn't keep the old ones", () => {
		const scene = realmSceneData({ name: "None", realm: { ...realm, rivers: [] }, geometry: g, textures: realmTextures() });
		expect(flagOf(scene).rivers).toEqual([]);
	});

	it("are each checked alike", () => {
		const broken = { ...realm, rivers: [realm.rivers[0], hexes("6,3 4,4")] };
		expect(validateRealm(broken, g)).toContainEqual({ kind: "river", reason: "river", key: "4,4" });
	});

	it("are laid with the river, as one piece to a hex", () => {
		const tiles = realmDocuments(realm, g, realmTextures()).tiles.filter(({ data }) => flagOf(data).kind === "river");
		expect(tiles).toHaveLength(8);
		expect(new Set(tiles.map(({ match }) => match)).size).toBe(8);
		expect(riverCourses(realm, g)).toHaveLength(2);
	});

	it("run over a Valley's own picture, which is left as it is drawn anywhere else", () => {
		const valley = { ...realm, terrain: realm.terrain.map((_, index) => (index === hexIndex(g, { col: 6, row: 3 }) ? VALLEY : 1)) };
		const tiles = realmDocuments(valley, g, realmTextures()).tiles.map(({ data }) => data);
		const at = (kind) => tiles.find((tile) => flagOf(tile).kind === kind && tile.x === Math.round(g.radius * (1.5 * 5 + 1)) && tile.y === Math.round(g.size * 3));
		expect(at("river").texture.src).toMatch(/sheet\/parchment\/river-(fork[\w-]*|fan)\.svg$/);
		expect(at("terrain")).toMatchObject({ alpha: 1, texture: { src: expect.stringMatching(/sheet\/parchment\/terrain-valley\.svg$/) } });
	});
});

describe("realmTextures for joined lakes", () => {
	it("gives them only for the Blank Realm, and not where the GM has a Lake picture of their own", () => {
		expect(realmTextures().lake.shore.both.src).toMatch(/sheet\/parchment\/lake-shore-both\.svg$/);
		expect(realmTextures({ skin: "seal" })).toMatchObject({ lake: null });
		expect(realmTextures({ custom: { files: { "terrain-lake": "mine/lake.png" } } })).toMatchObject({ lake: null });
	});
});
