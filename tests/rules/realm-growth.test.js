import { describe, expect, it } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { REALM_FLAG, emptyRealm, validateRealm } from "../../module/rules/realm.js";
import { DIRECTIONS, REALM_LAYOUTS, allHexes, edgeKey, hexCentre, neighbour, realmGeometry } from "../../module/rules/realm-geometry.js";
import { generateRealm, isConnected, rollNewLand } from "../../module/rules/realm-generator.js";
import { brokenPictures } from "../../module/rules/realm-pictures.js";
import { planRealmSync, realmFromDocuments, realmSceneData, realmSceneFlag, realmTextures } from "../../module/rules/realm-documents.js";
import { OWN_SIZE_LIMITS } from "../../module/rules/realm-setup.js";
import {
	cardHexKey,
	growRealm,
	growthOffset,
	growthPreview,
	growthProblem,
	grownGeometry,
	grownLayout,
	hasShifted,
	loggedGrowth,
	newLandHexes,
	normaliseGrowth,
	numbersKept,
	pixelShift,
	placeableShifts,
	reverseOffset,
	shiftEdgeKey,
	shiftHeldBack,
	shiftHex,
	shiftHexKey,
	shiftHexStore,
	shiftHexValue,
	shiftJournalFlag,
	shiftOmenEntered,
	shiftPicture,
	shiftPlaceable,
	shiftShared,
	shiftSighted,
	shiftThreads,
	shiftTimelineKey,
	shiftedHexFlags,
	shownHex,
	shownRange,
	storedHex
} from "../../module/rules/realm-growth.js";

const hex = (col, row) => ({ col, row });
const grow = (west = 0, north = 0, east = 0, south = 0) => ({ west, north, east, south });

describe("normaliseGrowth and growthProblem", () => {
	it("keeps whole numbers from 0 up on each side", () => {
		expect(normaliseGrowth({ north: "2", south: -1, west: 1.5, east: 3 })).toEqual({ north: 2, south: 0, west: 0, east: 3 });
		expect(normaliseGrowth(null)).toEqual({ north: 0, south: 0, west: 0, east: 0 });
	});

	it("asks for at least one hex, and keeps within the own-size limits", () => {
		const g = realmGeometry();
		expect(growthProblem(g, grow())).toBe("nothing");
		expect(growthProblem(g, grow(1))).toBeNull();
		expect(growthProblem(g, grow(OWN_SIZE_LIMITS.cols.max - 12, 0, 1))).toBe("cols");
		expect(growthProblem(g, grow(0, OWN_SIZE_LIMITS.rows.max - 11))).toBe("rows");
		expect(growthProblem(realmGeometry({ cols: 30, rows: 30 }), grow(0, 1))).toBe("hexes");
	});
});

describe("the layout and the shift", () => {
	const growths = [];
	for (let west = 0; west <= 3; west++) for (let north = 0; north <= 3; north++) growths.push(grow(west, north, (west + north) % 2, north % 3));

	it("flips the layout only when the set-off lines move by an odd number", () => {
		expect(grownLayout(realmGeometry(), grow(1))).toBe("oddColumns");
		expect(grownLayout(realmGeometry(), grow(2, 1))).toBe("evenColumns");
		expect(grownLayout(realmGeometry({ layout: "oddRows" }), grow(1, 3))).toBe("evenRows");
		expect(grownLayout(realmGeometry({ layout: "evenRows" }), grow(1, 2))).toBe("evenRows");
	});

	for (const layout of REALM_LAYOUTS) {
		it(`moves every old hex by one offset and keeps its neighbours on ${layout}`, () => {
			const from = realmGeometry({ cols: 7, rows: 6, layout });
			for (const growth of growths) {
				const to = grownGeometry(from, growth);
				const offset = growthOffset(growth);
				const { dx, dy } = pixelShift(from, growth);
				expect(dx).toBeCloseTo(from.columns ? 1.5 * from.radius * growth.west : from.size * growth.west, 6);
				expect(dy).toBeCloseTo(from.columns ? from.size * growth.north : 1.5 * from.radius * growth.north, 6);
				for (const old of allHexes(from)) {
					const moved = shiftHex(old, offset, to);
					const was = hexCentre(from, old);
					const now = hexCentre(to, moved);
					expect(now.x - was.x).toBeCloseTo(dx, 6);
					expect(now.y - was.y).toBeCloseTo(dy, 6);
					DIRECTIONS.forEach((_, direction) => {
						const before = neighbour(from, old, direction);
						if (before) expect(neighbour(to, moved, direction)).toEqual(shiftHex(before, offset));
					});
				}
			}
		});
	}

	it("grows the map by what is added on each side", () => {
		const to = grownGeometry(realmGeometry(), grow(2, 1, 3, 4));
		expect([to.cols, to.rows]).toEqual([17, 17]);
		expect(newLandHexes(realmGeometry(), grow(2, 1, 3, 4))).toHaveLength(17 * 17 - 144);
	});
});

describe("hex and edge keys", () => {
	it("shifts and drops what falls off the map", () => {
		const g = realmGeometry({ cols: 4, rows: 4 });
		expect(shiftHexKey("2,3", { cols: 1, rows: 2 })).toBe("3,5");
		expect(shiftHexKey("1,1", { cols: -1, rows: 0 })).toBeNull();
		expect(shiftHexKey("4,4", { cols: 1, rows: 0 }, g)).toBeNull();
		expect(shiftHexKey("nonsense", { cols: 1, rows: 1 })).toBeNull();
		expect(shiftEdgeKey(edgeKey(hex(3, 4), hex(4, 4)), { cols: 2, rows: 1 })).toBe(edgeKey(hex(5, 5), hex(6, 5)));
		expect(shiftEdgeKey("1,1|2,1", { cols: -1, rows: 0 })).toBeNull();
	});
});

describe("growRealm", () => {
	const from = realmGeometry();
	const realm = generateRealm({ seed: "growth", geometry: from });
	realm.holdings[0].id = "holding-1";
	const growth = grow(3, 2, 1, 1);
	const to = grownGeometry(from, growth);
	const grown = growRealm(realm, from, growth);
	const offset = growthOffset(growth);

	it("moves terrain, pictures, rivers, features and Barriers with their hexes", () => {
		expect([grown.cols, grown.rows]).toEqual([to.cols, to.rows]);
		for (const old of allHexes(from)) {
			const at = (g, h) => (h.row - 1) * g.cols + h.col - 1;
			expect(grown.terrain[at(to, shiftHex(old, offset))]).toBe(realm.terrain[at(from, old)]);
			expect(grown.variants[at(to, shiftHex(old, offset))]).toBe(realm.variants[at(from, old)]);
		}
		expect(grown.rivers).toEqual(realm.rivers.map((course) => course.map((h) => shiftHex(h, offset))));
		expect(grown.holdings[0]).toEqual({ ...realm.holdings[0], hex: shiftHex(realm.holdings[0].hex, offset) });
		expect(grown.barriers.map((barrier) => barrier.edge)).toEqual(realm.barriers.map((barrier) => shiftEdgeKey(barrier.edge, offset)));
		expect(realm.cols).toBe(12);
	});

	it("leaves the new land blank and breaks nothing else", () => {
		const problems = validateRealm(grown, to);
		expect(problems.length).toBe(newLandHexes(from, growth).length);
		expect(problems.every((problem) => problem.kind === "terrain")).toBe(true);
		expect(brokenPictures(to, grown)).toEqual([]);
		for (const added of newLandHexes(from, growth)) expect(grown.terrain[(added.row - 1) * to.cols + added.col - 1]).toBe(0);
	});

	it("keeps the setup's size in step", () => {
		const own = { ...emptyRealm(from), setup: { cols: 12, rows: 12, roll: { terrain: false } } };
		expect(growRealm(own, from, growth).setup).toMatchObject({ cols: to.cols, rows: to.rows });
		expect(validateRealm(growRealm(own, from, growth), to)).toEqual([]);
	});

	it("shifts a picture's place, and leaves one never placed", () => {
		const shift = { dx: 10.5, dy: -3 };
		expect(shiftPicture({ players: { src: "a.webp", bare: false, x: 100, y: 50, width: 400, height: 300 } }, shift).players)
			.toMatchObject({ x: 110.5, y: 47, width: 400, height: 300 });
		expect(shiftPicture({ players: { src: "a.webp" } }, shift).players).toEqual({ src: "a.webp", bare: false });
		expect(shiftPicture(null, shift)).toBeNull();
	});
});

describe("the Scene's documents, moved and read back", () => {
	for (const layout of ["evenColumns", "oddRows"]) {
		it(`reads the grown Realm back from the moved documents and lays only new land on ${layout}`, () => {
			const from = realmGeometry({ layout });
			const textures = realmTextures();
			const realm = generateRealm({ seed: `round-${layout}`, geometry: from });
			const scene = realmSceneData({ name: "Realm", realm, geometry: from, textures });
			const tiles = scene.tiles.map((tile, index) => ({ _id: `tile${index}`, ...structuredClone(tile) }));
			const drawings = scene.drawings.map((drawing, index) => ({ _id: `drawing${index}`, ...structuredClone(drawing) }));
			const before = realmFromDocuments({ flags: scene.flags, tiles, drawings }, from).realm;

			const growth = grow(1, 3, 2, 0);
			const to = grownGeometry(from, growth);
			const plan = placeableShifts({ Tile: tiles, Drawing: drawings }, from, growth, { systemId: SYSTEM_ID, realmFlag: REALM_FLAG });
			const apply = (list, updates) => list.map((source) => {
				const update = updates.find((change) => change._id === source._id) ?? {};
				const moved = structuredClone(source);
				for (const [key, value] of Object.entries(update)) {
					if (key.startsWith("flags.")) moved.flags[SYSTEM_ID][REALM_FLAG].edge = value;
					else moved[key] = value;
				}
				return moved;
			});
			const movedTiles = apply(tiles, plan.Tile);
			const movedDrawings = apply(drawings, plan.Drawing);
			const grown = growRealm(before, from, growth);
			const flags = { [SYSTEM_ID]: { [REALM_FLAG]: realmSceneFlag(grown, to) } };
			const read = realmFromDocuments({ flags, tiles: movedTiles, drawings: movedDrawings }, to);
			expect(read.problems).toEqual([]);
			expect(read.realm).toEqual(grown);

			const sync = planRealmSync(grown, to, textures, { tiles: movedTiles, drawings: movedDrawings });
			expect(sync.Tile.delete).toEqual([]);
			expect(sync.Drawing.delete).toEqual([]);
			expect(sync.Drawing.create).toEqual([]);
			const features = new Set(movedTiles.filter((tile) => ["holding", "myth", "landmark", "terrain"].includes(tile.flags[SYSTEM_ID][REALM_FLAG].kind)).map((tile) => tile._id));
			for (const update of sync.Tile.update.filter((change) => features.has(change._id))) {
				const was = movedTiles.find((tile) => tile._id === update._id);
				expect(Object.keys(update).filter((key) => !["_id", "x", "y"].includes(key))).toEqual([]);
				expect(Math.abs((update.x ?? was.x) - was.x)).toBeLessThanOrEqual(1);
				expect(Math.abs((update.y ?? was.y) - was.y)).toBeLessThanOrEqual(1);
			}
			// Blank land has no terrain to lay; only shore pieces at the old map's edge may come and go.
			expect(sync.Tile.create.every((tile) => ["shore", "mouth", "river"].includes(tile.flags[SYSTEM_ID][REALM_FLAG].kind))).toBe(true);
		});
	}
});

describe("shiftPlaceable", () => {
	const shift = { dx: 138.6, dy: 160 };

	it("moves documents placed by a point, in whole pixels", () => {
		expect(shiftPlaceable("Token", { _id: "t", x: 10, y: 20 }, shift)).toEqual({ _id: "t", x: 149, y: 180 });
		expect(shiftPlaceable("Note", { _id: "n", x: 0.4, y: 0 }, shift)).toEqual({ _id: "n", x: 139, y: 160 });
		expect(shiftPlaceable("Token", { _id: "t" }, shift)).toBeNull();
	});

	it("moves a Wall's ends and a Region's shapes", () => {
		expect(shiftPlaceable("Wall", { _id: "w", c: [0, 0, 100, 50] }, shift)).toEqual({ _id: "w", c: [139, 160, 239, 210] });
		const region = { _id: "r", shapes: [
			{ type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
			{ type: "polygon", points: [0, 0, 10, 0, 10, 10] },
			{ type: "circle", x: 5, y: 5, radius: 3 }
		] };
		expect(shiftPlaceable("Region", region, shift).shapes).toEqual([
			{ type: "rectangle", x: 139, y: 160, width: 10, height: 10 },
			{ type: "polygon", points: [139, 160, 149, 160, 149, 170] },
			{ type: "circle", x: 144, y: 165, radius: 3 }
		]);
	});
});

describe("stores kept for each hex", () => {
	const offset = { cols: 2, rows: 1 };

	it("re-keys stores wrapped in hexes, keeping what's beside them", () => {
		expect(shiftHexStore({ version: 1, next: 4, hexes: { "1,1": { a: 1 }, "3,2": { b: 2 } } }, offset))
			.toEqual({ version: 1, next: 4, hexes: { "3,2": { a: 1 }, "5,3": { b: 2 } } });
		expect(shiftHexStore(null, offset)).toBeNull();
	});

	it("re-keys the Barriers met inside what was shared", () => {
		const flag = { hexes: { "2,2": { told: [], met: [{ edge: "2,2|3,2", byName: "Sir A" }] } } };
		expect(shiftShared(flag, offset)).toEqual({ hexes: { "4,3": { told: [], met: [{ edge: "4,3|5,3", byName: "Sir A" }] } } });
	});

	it("re-keys sightings with no wrapper, and both shapes of what's held back", () => {
		expect(shiftSighted({ "1,2": { note: "smoke" } }, offset)).toEqual({ "3,3": { note: "smoke" } });
		expect(shiftHeldBack(["1,1", "2,1"], offset)).toEqual(["3,2", "4,2"]);
		expect(shiftHeldBack({ move: "m", hexes: ["1,1"], kept: false }, offset)).toEqual({ move: "m", hexes: ["3,2"], kept: false });
		expect(shiftHexValue({ col: 1, row: 1 }, offset)).toEqual({ col: 3, row: 2 });
	});

	it("names every per-hex flag the Scene has, and clears the Company's moves", () => {
		const changes = shiftedHexFlags({ hexNames: { hexes: { "1,1": { name: "Ford" } } }, companyMoves: [{ id: 1 }], mythNotes: { 1: "x" } }, offset);
		expect(changes).toEqual({ hexNames: { hexes: { "3,2": { name: "Ford" } } }, companyMoves: null });
	});

	it("moves Journal entries, threads, Timeline keys and the waiting Omen of this Realm only", () => {
		expect(shiftJournalFlag({ scene: "S", hex: "5,7" }, "S", offset)).toEqual({ flag: { scene: "S", hex: "7,8" }, sort: 7008 });
		expect(shiftJournalFlag({ scene: "T", hex: "5,7" }, "S", offset)).toBeNull();
		expect(shiftThreads({ a: { scene: "S", hex: "1,1" }, b: { scene: "T", hex: "1,1" }, c: { scene: "S", hex: "" } }, "S", offset)).toEqual({ a: "3,2" });
		expect(shiftTimelineKey("visit:S:1,1", "S", offset)).toBe("visit:S:3,2");
		expect(shiftTimelineKey("note:T:1,1", "S", offset)).toBeNull();
		expect(shiftTimelineKey("turn:4", "S", offset)).toBeNull();
		expect(shiftOmenEntered({ scene: "S", hex: { col: 1, row: 1 }, myth: 2 }, "S", offset)).toEqual({ scene: "S", hex: { col: 3, row: 2 }, myth: 2 });
		expect(shiftOmenEntered({ scene: "T", hex: { col: 1, row: 1 } }, "S", offset)).toBeUndefined();
	});

	it("comes back to what it was when shifted and shifted back, and loses a hex of the new land", () => {
		const g = realmGeometry({ cols: 4, rows: 4 });
		const flag = { hexes: { "1,1": { a: 1 }, "4,4": { b: 2 } } };
		expect(shiftHexStore(shiftHexStore(flag, offset), reverseOffset(offset), g)).toEqual(flag);
		const added = { hexes: { "1,1": { onNewLand: true }, "3,2": { old: true } } };
		expect(shiftHexStore(added, reverseOffset(offset), g)).toEqual({ hexes: { "1,1": { old: true } } });
		expect(shiftJournalFlag({ scene: "S", hex: "1,1" }, "S", reverseOffset(offset), g)).toEqual({ flag: null });
		expect(shiftThreads({ a: { scene: "S", hex: "1,1" } }, "S", reverseOffset(offset), g)).toEqual({ a: "" });
		expect(shiftTimelineKey("visit:S:1,1", "S", reverseOffset(offset), g)).toBe("visit:S:gone");
		expect(shiftOmenEntered({ scene: "S", hex: { col: 1, row: 1 } }, "S", reverseOffset(offset), g)).toBeNull();
	});
});

describe("numbers shown and old chat cards", () => {
	it("keeps every hex's number across two expansions, running through 0 into negatives", () => {
		const once = loggedGrowth(null, grow(2, 1), { when: 100, keepNumbers: true });
		const twice = loggedGrowth(once, grow(1, 0), { when: 200, keepNumbers: true });
		// Column 5, Row 7 to begin with is stored at 8,8 after both.
		expect(shownHex(hex(8, 8), twice)).toEqual(hex(5, 7));
		expect([1, 2, 3].map((col) => shownHex(hex(col, 1), twice).col)).toEqual([-2, -1, 0]);
		expect(shownHex(hex(1, 1), twice).row).toBe(0);
		expect(storedHex(hex(0, 0), twice)).toEqual(hex(3, 1));
		expect(numbersKept(twice)).toBe(true);
		expect(shownRange(realmGeometry({ cols: 15, rows: 13 }), twice)).toEqual({ col: { min: -2, max: 12 }, row: { min: 0, max: 12 } });
	});

	it("numbers from 1 again when asked, and can keep numbers from there on", () => {
		const renumbered = loggedGrowth(loggedGrowth(null, grow(2, 1), { when: 1, keepNumbers: true }), grow(1), { when: 2, keepNumbers: false });
		expect(shownHex(hex(4, 5), renumbered)).toEqual(hex(4, 5));
		expect(storedHex(hex(4, 5), renumbered)).toEqual(hex(4, 5));
		expect(numbersKept(renumbered)).toBe(false);
		const kept = loggedGrowth(renumbered, grow(0, 2), { when: 3, keepNumbers: true });
		expect(shownHex(hex(4, 7), kept)).toEqual(hex(4, 5));
	});

	it("says whether the hexes have ever moved", () => {
		expect(hasShifted(null)).toBe(false);
		expect(hasShifted(loggedGrowth(null, grow(0, 0, 3, 1), { when: 1, keepNumbers: true }))).toBe(false);
		expect(hasShifted(loggedGrowth(null, grow(1), { when: 1, keepNumbers: false }))).toBe(true);
	});

	it("turns a card's hex into today's by every expansion after it was posted", () => {
		const log = loggedGrowth(loggedGrowth(null, grow(2, 1), { when: 100, keepNumbers: true }), grow(1, 3), { when: 200, keepNumbers: false });
		expect(cardHexKey("5,7", 50, log)).toBe("8,11");
		expect(cardHexKey("5,7", 150, log)).toBe("6,10");
		expect(cardHexKey("5,7", 250, log)).toBe("5,7");
		expect(cardHexKey("bad", 50, log)).toBe("bad");
	});
});

describe("growthPreview", () => {
	it("draws the old hexes and the new apart", () => {
		const preview = growthPreview(realmGeometry({ cols: 3, rows: 2 }), grow(1, 0, 0, 1));
		expect(preview.old.match(/M/g)).toHaveLength(6);
		expect(preview.added.match(/M/g)).toHaveLength(4 * 3 - 6);
		expect(preview.viewBox).toMatch(/^-1 -1 /);
	});
});

describe("rollNewLand", () => {
	const from = realmGeometry();
	const realm = generateRealm({ seed: "new-land", geometry: from });
	const growth = grow(2, 1, 3, 2);
	const to = grownGeometry(from, growth);
	const grown = growRealm(realm, from, growth);
	const added = newLandHexes(from, growth);
	const addedKeys = new Set(added.map((h) => `${h.col},${h.row}`));
	const at = (h) => (h.row - 1) * to.cols + h.col - 1;

	it("rolls terrain into every new hex and leaves every old one as it was, pictures too", () => {
		const rolled = rollNewLand({ seed: "s", realm: grown, geometry: to, added });
		for (const h of allHexes(to)) {
			if (addedKeys.has(`${h.col},${h.row}`)) expect(rolled.terrain[at(h)]).toBeGreaterThan(0);
			else {
				expect(rolled.terrain[at(h)]).toBe(grown.terrain[at(h)]);
				expect(rolled.variants[at(h)]).toBe(grown.variants[at(h)]);
			}
		}
		expect(brokenPictures(to, rolled)).toEqual([]);
		expect(validateRealm(rolled, to)).toEqual([]);
		expect(rolled.landmarks).toEqual(grown.landmarks);
		expect(rolled.barriers).toEqual(grown.barriers);
		expect(rollNewLand({ seed: "s", realm: grown, geometry: to, added })).toEqual(rolled);
	});

	it("rolls hidden Landmarks and Barriers into the new land alone when asked, walling nothing off", () => {
		const rolled = rollNewLand({ seed: "s", realm: grown, geometry: to, added, features: true });
		const landmarks = rolled.landmarks.slice(grown.landmarks.length);
		const barriers = rolled.barriers.slice(grown.barriers.length);
		expect(landmarks.length).toBeGreaterThan(0);
		expect(barriers.length).toBe(Math.floor(added.length / 6));
		for (const landmark of landmarks) {
			expect(addedKeys.has(`${landmark.hex.col},${landmark.hex.row}`)).toBe(true);
			expect(landmark.revealed).toBe(false);
		}
		for (const barrier of barriers) {
			expect(barrier.edge.split("|").some((key) => addedKeys.has(key))).toBe(true);
			expect(barrier.revealed).toBe(false);
		}
		expect(isConnected(to, new Set(rolled.barriers.map((barrier) => barrier.edge)))).toBe(true);
		expect(validateRealm(rolled, to)).toEqual([]);
	});
});
