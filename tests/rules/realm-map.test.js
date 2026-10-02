import { describe, expect, it } from "vitest";
import { TERRAIN } from "../../module/rules/realm.js";
import { BOOK_LAYOUT, REALM_LAYOUTS, hexCentre, hexVertices, normaliseLayout, realmGeometry } from "../../module/rules/realm-geometry.js";
import {
	BARE_MAP,
	MAP_ROLES,
	TERRAIN_MARKS,
	bareHexOverlay,
	bareMapSize,
	calibrationHexes,
	coveredCrop,
	coveredMapRect,
	fitToMarks,
	fittedMapRect,
	fullMapRect,
	hidesTerrain,
	laidMapRect,
	layoutChoices,
	layoutDiagram,
	mapRect,
	markAt,
	markedHexOutline,
	markedHexScale,
	markedHexLettering,
	normaliseMapPicture,
	normaliseRealmPicture,
	otherSideForPicture,
	pictureChoices,
	realmPictures,
	resizesMapPicture,
	sizeMapRect,
	slideMapRect,
	suggestedMapSize,
	terrainMark,
	viewOfPicture,
	withMapPlaces
} from "../../module/rules/realm-map.js";

const g = realmGeometry();

/** Where the two hexes a picture is lined up by sit on the map. */
const marks = () => calibrationHexes(g).map((hex) => hexCentre(g, hex));

describe("normaliseMapPicture", () => {
	it("keeps a picture with nowhere to be, since it hasn't been lined up yet", () => {
		expect(normaliseMapPicture({ src: "maps/realm.webp" })).toEqual({ src: "maps/realm.webp", bare: false });
		expect(normaliseMapPicture({ src: " maps/realm.webp " })).toEqual({ src: "maps/realm.webp", bare: false });
	});

	it("keeps where it lies once it has all four measurements", () => {
		expect(normaliseMapPicture({ src: "a.png", x: 10.005, y: 20, width: 30, height: 40 }))
			.toEqual({ src: "a.png", bare: false, x: 10.01, y: 20, width: 30, height: 40 });
	});

	it("drops measurements that say nothing", () => {
		for (const bad of [{ width: 0, height: 40 }, { width: 30 }, { width: "30", height: 40 }, { width: 30, height: Number.NaN }]) {
			expect(normaliseMapPicture({ src: "a.png", x: 0, y: 0, ...bad })).toEqual({ src: "a.png", bare: false });
		}
	});

	it("is nothing without a picture", () => {
		for (const bad of [null, undefined, {}, { src: "" }, { src: "   " }, { src: 7 }]) expect(normaliseMapPicture(bad)).toBeNull();
	});

	it("always says whether the picture has no hexes on it, so a flag merged into can't keep an old word", () => {
		expect(normaliseMapPicture({ src: "a.png", bare: true })).toEqual({ src: "a.png", bare: true });
		expect(normaliseMapPicture({ src: "a.png", bare: true, x: 1, y: 2, width: 3, height: 4 }))
			.toEqual({ src: "a.png", bare: true, x: 1, y: 2, width: 3, height: 4 });
		for (const not of [undefined, false, "yes", 1]) expect(normaliseMapPicture({ src: "a.png", bare: not }).bare).toBe(false);
	});
});

describe("normaliseRealmPicture", () => {
	it("is nothing without a players' map", () => {
		expect(normaliseRealmPicture(null)).toBeNull();
		expect(normaliseRealmPicture({ referee: { src: "secret.png" }, features: true })).toBeNull();
	});

	it("keeps the players' map, dropping a referee's map and the features tick from before", () => {
		expect(normaliseRealmPicture({ players: { src: "open.png" }, referee: { src: "secret.png" }, features: 1 }))
			.toEqual({ players: { src: "open.png", bare: false } });
	});

	it("names the players' map alone", () => {
		expect(MAP_ROLES).toEqual(["players"]);
	});
});

describe("mapRect", () => {
	it("covers the whole map until a picture is lined up", () => {
		expect(fullMapRect(g)).toEqual({ x: g.width / 2, y: g.height / 2, width: g.width, height: g.height });
		expect(mapRect(g, { src: "a.png" })).toEqual(fullMapRect(g));
		expect(mapRect(g, null)).toEqual(fullMapRect(g));
	});

	it("takes a picture at its own measurements once it has them", () => {
		expect(mapRect(g, { src: "a.png", x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
	});
});

describe("realmPictures", () => {
	it("lays the players' map down, and nothing a referee's map from before left behind", () => {
		const realm = { picture: { players: { src: "open.png" }, referee: { src: "secret.png", x: 5, y: 6, width: 7, height: 8 } } };
		expect(realmPictures(realm, g)).toEqual([{ role: "players", src: "open.png", ...fullMapRect(g) }]);
	});

	it("is empty on a Realm drawn in the system's own ink", () => {
		expect(realmPictures({ picture: undefined }, g)).toEqual([]);
		expect(hidesTerrain({})).toBe(false);
		expect(hidesTerrain({ picture: { players: { src: "a.png" } } })).toBe(true);
	});
});

describe("a picture keeps its size", () => {
	const laid = { src: "a.png", x: 500, y: 600, width: 900, height: 1000 };

	it("reads where its Tile stands, but not the Tile's size", () => {
		const read = withMapPlaces({ players: laid }, { players: { x: 520, y: 590, width: 1200, height: 700 } });
		expect(read.players).toEqual({ ...laid, x: 520, y: 590 });
	});

	it("still has no hexes on it wherever its Tile stands", () => {
		expect(withMapPlaces({ players: { ...laid, bare: true } }, { players: { x: 1, y: 2, width: 3, height: 4 } }).players.bare).toBe(true);
	});

	it("takes the Tile's size for a picture never measured", () => {
		const place = { x: 520, y: 590, width: 1200, height: 700 };
		expect(withMapPlaces({ players: { src: "a.png" } }, { players: place }).players).toEqual({ src: "a.png", ...place });
		expect(withMapPlaces({ players: laid }, {}).players).toEqual(laid);
		expect(withMapPlaces(null, { players: place })).toBeNull();
	});

	it("says a change to its Tile's size would size it, and a move wouldn't", () => {
		expect(resizesMapPicture(laid, { width: 1200 })).toBe(true);
		expect(resizesMapPicture(laid, { height: 999 })).toBe(true);
		expect(resizesMapPicture(laid, { x: 10, y: 20 })).toBe(false);
		// The Realm's own writes carry the size it already has, in whole pixels.
		expect(resizesMapPicture({ ...laid, width: 900.4 }, { width: 900, height: 1000, x: 3 })).toBe(false);
		expect(resizesMapPicture(laid, { width: "nonsense" })).toBe(true);
	});

	it("has no size to keep before it's measured", () => {
		expect(resizesMapPicture({ src: "a.png" }, { width: 1200 })).toBe(false);
		expect(resizesMapPicture(null, { width: 1200 })).toBe(false);
		expect(resizesMapPicture(laid, null)).toBe(false);
	});
});

describe("fittedMapRect", () => {
	it("lays a picture as large as fits on the map, unstretched, in the middle", () => {
		const wide = fittedMapRect(g, { width: 980, height: 829 });
		expect(wide.width).toBeCloseTo(g.width, 0);
		expect(wide.width / wide.height).toBeCloseTo(980 / 829, 2);
		expect(wide.height).toBeLessThanOrEqual(g.height);
		expect(wide).toMatchObject({ x: g.width / 2, y: g.height / 2 });

		const tall = fittedMapRect(g, { width: 1000, height: 4000 });
		expect(tall.height).toBeCloseTo(g.height, 0);
		expect(tall.width).toBeCloseTo(g.height / 4, 0);
	});

	it("lays a picture of no known size over the whole map", () => {
		expect(fittedMapRect(g, null)).toEqual(fullMapRect(g));
		expect(fittedMapRect(g, { width: 0, height: 10 })).toEqual(fullMapRect(g));
	});
});

/** A painted map with no hexes on it, as wide as a screen. */
const WIDE = Object.freeze({ width: 3840, height: 2160 });

/** A picture the shape of the book's Realm Sheet, 12 hexes by 12. */
const SHEET = Object.freeze({ width: 1709, height: 2000 });

describe("coveredMapRect", () => {
	it("lays a map with no hexes on it just large enough to cover the whole map, unstretched, in the middle", () => {
		expect(coveredMapRect(g, WIDE)).toEqual({ x: 854.5, y: 1000, width: 3555.56, height: 2000 });
		expect(coveredMapRect(g, SHEET)).toEqual({ x: 854.5, y: 1000, width: 1709, height: 2000 });
		expect(coveredMapRect(g, null)).toEqual(fullMapRect(g));
	});

	it("says how much of the picture falls outside the map", () => {
		// Half of a wide map is lost over the book's 12 by 12, and next to none over hexes laid in its shape.
		expect(coveredCrop(g, WIDE)).toBeCloseTo(1 - 1709 / 3555.56, 3);
		expect(coveredCrop(realmGeometry({ cols: 17, rows: 8 }), WIDE)).toBeLessThan(0.01);
		expect(coveredCrop(g, SHEET)).toBe(0);
		expect(coveredCrop(g, null)).toBe(0);
	});

	it("is how a bare picture is laid, and a picture with hexes is still fitted inside", () => {
		expect(laidMapRect(g, WIDE, { bare: true })).toEqual(coveredMapRect(g, WIDE));
		expect(laidMapRect(g, WIDE)).toEqual(fittedMapRect(g, WIDE));
	});
});

describe("how many hexes go over a map with no hexes on it", () => {
	it("takes as many rows as the picture's shape needs for so many across, and the other way round", () => {
		expect(otherSideForPicture(WIDE, "cols", 17)).toBe(8);
		expect(otherSideForPicture(WIDE, "cols", 18)).toBe(8);
		expect(otherSideForPicture(WIDE, "cols", 20)).toBe(9);
		expect(otherSideForPicture(WIDE, "rows", 8)).toBe(17);
		expect(otherSideForPicture(WIDE, "rows", 10)).toBe(21);
		expect(otherSideForPicture(WIDE, "rows", 3)).toBe(7);
		expect(otherSideForPicture(SHEET, "cols", 12)).toBe(12);
		expect(otherSideForPicture(SHEET, "rows", 12)).toBe(12);
		expect(otherSideForPicture(SHEET, "cols", 20)).toBe(20);
	});

	it("keeps within the sizes a map may have", () => {
		expect(otherSideForPicture({ width: 4000, height: 1000 }, "cols", 3)).toBe(3);
		expect(otherSideForPicture({ width: 1000, height: 4000 }, "cols", 30)).toBe(30);
		expect(otherSideForPicture(null, "cols", 12)).toBeNull();
		expect(otherSideForPicture({ width: 0, height: 10 }, "rows", 12)).toBeNull();
	});

	it("starts close to a typical Realm's count, in the picture's shape", () => {
		const { cols, rows } = realmGeometry();
		expect(suggestedMapSize(SHEET)).toEqual({ cols, rows });
		expect(suggestedMapSize(WIDE)).toEqual({ cols: 17, rows: 8 });
		expect(suggestedMapSize({ width: 2048, height: 1536 })).toEqual({ cols: 16, rows: 10 });
		expect(suggestedMapSize({ width: 2000, height: 2000 })).toEqual({ cols: 13, rows: 11 });
	});

	it("starts in the picture's shape with pointed tops as well", () => {
		expect(suggestedMapSize(WIDE, "evenRows")).toEqual({ cols: 14, rows: 9 });
		expect(suggestedMapSize({ width: 2000, height: 2000 }, "evenRows")).toEqual({ cols: 11, rows: 13 });
		expect(suggestedMapSize(SHEET, "oddRows")).toEqual({ cols: 10, rows: 14 });
		expect(suggestedMapSize(null)).toBeNull();
	});

	it("keeps the side the GM set and follows the picture with the other, until then the suggestion", () => {
		expect(bareMapSize(WIDE, { cols: 12, rows: 12 })).toEqual({ cols: 17, rows: 8 });
		expect(bareMapSize(WIDE, { cols: 20, rows: 12, lead: "cols" })).toEqual({ cols: 20, rows: 9 });
		expect(bareMapSize(WIDE, { cols: 3, rows: 10, lead: "rows" })).toEqual({ cols: 21, rows: 10 });
		expect(bareMapSize(null, { cols: "40", rows: "", lead: "cols" })).toEqual({ cols: 40, rows: 12 });
		expect(bareMapSize(null, { cols: 60, rows: 60, lead: "rows" })).toEqual({ cols: 15, rows: 60 });
	});

	it("covers very wide and very tall maps, losing next to none of them", () => {
		const shapes = {
			"8:1": [{ width: 8000, height: 1000 }, { cols: 41, rows: 4 }],
			"12:1": [{ width: 12000, height: 1000 }, { cols: 48, rows: 3 }],
			"1:5": [{ width: 1000, height: 5000 }, { cols: 6, rows: 27 }],
			"1:20": [{ width: 1000, height: 20000 }, { cols: 3, rows: 57 }]
		};
		for (const [picture, expected] of Object.values(shapes)) {
			const suggested = suggestedMapSize(picture);
			expect(suggested).toEqual(expected);
			expect(coveredCrop(realmGeometry(suggested), picture)).toBeLessThan(0.02);
		}
	});

	it("never gives a map with no hexes on it more hexes than the largest Realm with the rules ignored", () => {
		// A square map 60 across would want 60 rows: it's held to 15.
		expect(otherSideForPicture({ width: 2000, height: 2000 }, "cols", 60)).toBe(15);
		expect(otherSideForPicture({ width: 2000, height: 2000 }, "rows", 60)).toBe(15);
		expect(bareMapSize({ width: 2000, height: 2000 }, { cols: 60, rows: 12, lead: "cols" })).toEqual({ cols: 60, rows: 15 });
	});
});

describe("bareHexOverlay", () => {
	it("draws every hex in the picture's own pixels, as the picture is laid to cover them", () => {
		const overlay = bareHexOverlay(WIDE, { cols: 17, rows: 8 });
		expect(overlay.viewBox).toBe("0 0 3840 2160");
		expect(overlay.hexes.match(/M/g)).toHaveLength(17 * 8);

		// The first hex's first corner, back on the map through where the picture is laid.
		const g17 = realmGeometry({ cols: 17, rows: 8 });
		const rect = coveredMapRect(g17, WIDE);
		const [x, y] = overlay.hexes.slice(1).split("L")[0].split(" ").map(Number);
		const onMap = { x: rect.x - rect.width / 2 + x * (rect.width / WIDE.width), y: rect.y - rect.height / 2 + y * (rect.height / WIDE.height) };
		const corner = hexVertices(g17, { col: 1, row: 1 })[0];
		expect(onMap.x).toBeCloseTo(corner.x, 0);
		expect(onMap.y).toBeCloseTo(corner.y, 0);
	});

	it("shades the strips of picture outside the map, and none where the shapes meet", () => {
		expect(bareHexOverlay(WIDE, { cols: 17, rows: 8 }).outside).toBe("M0 0H3840V2160H0Z M12.5 0h3814.9v2160h-3814.9Z");
		expect(bareHexOverlay(SHEET, { cols: 12, rows: 12 }).outside).toBe("");
	});

	it("lays pointed tops too, and nothing for a picture of no known size", () => {
		expect(bareHexOverlay(WIDE, { cols: 14, rows: 9, layout: "evenRows" }).hexes.match(/M/g)).toHaveLength(14 * 9);
		expect(bareHexOverlay(null, { cols: 12, rows: 12 })).toBeNull();
	});
});

describe("layoutDiagram and layoutChoices", () => {
	it("draws four hexes by three inside the map's top and left edges", () => {
		for (const layout of REALM_LAYOUTS) {
			const { viewBox, edge, hexes } = layoutDiagram(layout);
			const [, , width, height] = viewBox.split(" ").map(Number);
			expect(hexes).toHaveLength(12);
			for (const { points } of hexes) expect(points.split(" ")).toHaveLength(6);
			expect(edge).toMatch(/^M0 \d+(\.\d+)? V0 H\d+(\.\d+)?$/);
			expect(width).toBeGreaterThan(0);
			expect(height).toBeGreaterThan(0);
		}
	});

	it("sets the second row in with pointed tops, and the first with the other kind", () => {
		const leftmost = (layout, index) => Math.min(...layoutDiagram(layout).hexes[index].points.split(" ").map((point) => Number(point.split(",")[0])));
		// Hex 4 is the first of the second row.
		expect(leftmost("evenRows", 4)).toBeGreaterThan(leftmost("evenRows", 0));
		expect(leftmost("oddRows", 4)).toBeLessThan(leftmost("oddRows", 0));
	});

	it("offers every layout, with the one in use chosen and the book's marked", () => {
		const choices = layoutChoices("oddRows");
		expect(choices.map((choice) => choice.key)).toEqual(REALM_LAYOUTS);
		expect(choices.filter((choice) => choice.checked).map((choice) => choice.key)).toEqual(["oddRows"]);
		expect(choices.find((choice) => choice.book).key).toBe(BOOK_LAYOUT);
		expect(layoutChoices("sideways").find((choice) => choice.checked).key).toBe(BOOK_LAYOUT);
	});

	it("offers a map with no hexes on it after the layouts, laid out the book's way", () => {
		expect(REALM_LAYOUTS).not.toContain(BARE_MAP);
		expect(normaliseLayout(BARE_MAP)).toBe(BOOK_LAYOUT);
		const choices = pictureChoices("oddRows");
		expect(choices.map((choice) => choice.key)).toEqual([...REALM_LAYOUTS, BARE_MAP]);
		expect(choices.filter((choice) => choice.checked).map((choice) => choice.key)).toEqual(["oddRows"]);

		const bare = pictureChoices("oddRows", { bare: true });
		expect(bare.filter((choice) => choice.checked).map((choice) => choice.key)).toEqual([BARE_MAP]);
		const { diagram } = bare.at(-1);
		expect(diagram.hexes).toEqual([]);
		expect(diagram).toMatchObject({ viewBox: layoutDiagram(BOOK_LAYOUT).viewBox, edge: layoutDiagram(BOOK_LAYOUT).edge });
	});
});

describe("terrainMark", () => {
	it("gives every terrain a colour of its own", () => {
		expect(TERRAIN_MARKS).toHaveLength(TERRAIN.length);
		expect(new Set(TERRAIN_MARKS).size).toBe(TERRAIN.length);
		for (const mark of TERRAIN_MARKS) expect(mark).toMatch(/^#[0-9a-f]{6}$/);
	});

	it("hands the canvas a number", () => {
		expect(terrainMark(1)).toBe(Number(TERRAIN_MARKS[0].replace("#", "0x")));
		expect(terrainMark(TERRAIN.length)).toBe(Number(TERRAIN_MARKS.at(-1).replace("#", "0x")));
		// An unmarked hex is never drawn, but nothing here should throw over it.
		expect(terrainMark(0)).toBe(terrainMark(1));
	});
});

describe("markedHexLettering", () => {
	it("letters a marked hex's name to the hex's size, in whole pixels", () => {
		const { fontSize, strokeThickness } = markedHexLettering(g.size);
		expect(Number.isInteger(fontSize)).toBe(true);
		expect(Number.isInteger(strokeThickness)).toBe(true);
		// Six letters of a bold serif run about 3.6 ems: Meadow and Plains stay inside the hex.
		expect(fontSize * 3.6).toBeLessThan(g.size);
		expect(strokeThickness).toBeGreaterThanOrEqual(2);
		expect(markedHexLettering(g.size * 2).fontSize).toBeGreaterThan(fontSize);
		// Never too small to read on a tiny grid.
		expect(markedHexLettering(20).fontSize).toBe(10);
	});
});

describe("sliding a picture into place", () => {
	const rect = { x: 500, y: 400, width: 1000, height: 800 };

	it("slides without changing the size", () => {
		expect(slideMapRect(rect, 12.5, -7)).toEqual({ x: 512.5, y: 393, width: 1000, height: 800 });
	});
});

describe("sizing a picture with the wheel", () => {
	const rect = { x: 500, y: 400, width: 1000, height: 800 };

	it("sizes it evenly, keeping the point under the pointer where it was", () => {
		const about = { x: 100, y: 200 };
		const sized = sizeMapRect(g, rect, 1.1, about);
		expect(sized).toEqual({ x: 540, y: 420, width: 1100, height: 880 });
		// The picture's own point that was under the pointer is under it still.
		const share = (r) => ({ x: (about.x - r.x) / r.width, y: (about.y - r.y) / r.height });
		expect(share(sized).x).toBeCloseTo(share(rect).x);
		expect(share(sized).y).toBeCloseTo(share(rect).y);
	});

	it("sizes it about its centre when the pointer is there", () => {
		expect(sizeMapRect(g, rect, 0.5, { x: 500, y: 400 })).toEqual({ x: 500, y: 400, width: 500, height: 400 });
	});

	it("won't size it far out of the map's size, or by no factor at all", () => {
		expect(sizeMapRect(g, { ...rect, width: g.width, height: g.height }, 25, rect)).toBeNull();
		expect(sizeMapRect(g, { ...rect, width: g.width, height: g.height }, 0.05, rect)).toBeNull();
		expect(sizeMapRect(g, rect, 0, rect)).toBeNull();
		expect(sizeMapRect(g, rect, Number.NaN, rect)).toBeNull();
	});
});

describe("marking two hexes on a picture", () => {
	const [from, to] = marks();
	/** Where a picture lies when its drawn hexes sit on the Realm's: a sheet with a border round the map. */
	const inPlace = { x: 900, y: 1000, width: 2000, height: 2200 };
	/** The same picture as it was laid, before it was lined up: shrunk to 0.8 and moved, so its hexes are too small. */
	const shrink = 0.8;
	const shift = { x: 300, y: 400 };
	const laid = (point) => ({ x: shift.x + shrink * point.x, y: shift.y + shrink * point.y });
	const rect = { ...laid(inPlace), width: inPlace.width * shrink, height: inPlace.height * shrink };
	/** Where the map's first and last hex are drawn on the picture as it was laid. */
	const drawn = [laid(from), laid(to)];
	const near = (a, b, digits = 2) => ["x", "y", "width", "height"].forEach((key) => expect(a[key]).toBeCloseTo(b[key], digits));

	it("sizes the picture evenly and moves it so its drawn hexes land on the Realm's", () => {
		near(fitToMarks(g, rect, drawn), inPlace);
	});

	it("never stretches it out of its shape", () => {
		const fitted = fitToMarks(g, rect, [drawn[0], { x: drawn[1].x + 30, y: drawn[1].y - 20 }]);
		expect(fitted.width / fitted.height).toBeCloseTo(rect.width / rect.height, 6);
	});

	it("splits a mark a few pixels out between the two corners", () => {
		const fitted = fitToMarks(g, rect, [drawn[0], { x: drawn[1].x + 4, y: drawn[1].y }]);
		// Each corner hex is out by less than the slip of the hand.
		const mapOf = (point) => ({ x: fitted.x + (point.x - rect.x) * (fitted.width / rect.width), y: fitted.y + (point.y - rect.y) * (fitted.height / rect.height) });
		for (const [index, hex] of [from, to].entries()) {
			const landed = mapOf(index ? { x: drawn[1].x + 4, y: drawn[1].y } : drawn[0]);
			expect(Math.hypot(landed.x - hex.x, landed.y - hex.y)).toBeLessThan(4);
		}
	});

	it("refuses marks that can't be the map's corners", () => {
		// The wrong way round, on top of each other, or along a row rather than corner to corner.
		expect(fitToMarks(g, rect, [drawn[1], drawn[0]])).toBeNull();
		expect(fitToMarks(g, rect, [drawn[0], drawn[0]])).toBeNull();
		expect(fitToMarks(g, rect, [drawn[0], { x: drawn[1].x, y: drawn[0].y }])).toBeNull();
		// So close together the picture would have to be sized past all reason.
		expect(fitToMarks(g, rect, [drawn[0], { x: drawn[0].x + 2, y: drawn[0].y + 2 }])).toBeNull();
	});

	it("does nothing without both marks or a picture", () => {
		expect(fitToMarks(g, rect, [drawn[0]])).toBeNull();
		expect(fitToMarks(g, rect, [drawn[0], null])).toBeNull();
		expect(fitToMarks(g, null, drawn)).toBeNull();
	});

	it("reads how large the picture's hexes are from the two marks", () => {
		expect(markedHexScale(g, from, to)).toBeCloseTo(1, 6);
		expect(markedHexScale(g, ...drawn)).toBeCloseTo(shrink, 6);
		expect(markedHexScale(g, from, null)).toBeNull();
		expect(markedHexScale(g, to, from)).toBeNull();
	});

	it("draws a mark as one of the Realm's hexes until the picture's hexes are known", () => {
		const point = { x: 123, y: 456 };
		const outline = markedHexOutline(g, point);
		const own = hexVertices(g, { col: 1, row: 1 });
		outline.forEach((corner, index) => {
			expect(corner.x - point.x).toBeCloseTo(own[index].x - from.x, 6);
			expect(corner.y - point.y).toBeCloseTo(own[index].y - from.y, 6);
		});
	});

	it("draws a mark as large as the picture's hexes, the same both ways", () => {
		const width = (outline) => Math.max(...outline.map(({ x }) => x)) - Math.min(...outline.map(({ x }) => x));
		const height = (outline) => Math.max(...outline.map(({ y }) => y)) - Math.min(...outline.map(({ y }) => y));
		const own = markedHexOutline(g, from);
		const drawnHex = markedHexOutline(g, from, shrink);
		expect(width(drawnHex)).toBeCloseTo(width(own) * shrink, 6);
		expect(height(drawnHex)).toBeCloseTo(height(own) * shrink, 6);
	});

	it("draws a pointed-top Realm's marks pointed", () => {
		const pointed = realmGeometry({ layout: REALM_LAYOUTS.find((layout) => !realmGeometry({ layout }).columns) });
		const outline = markedHexOutline(pointed, { x: 0, y: 0 });
		expect(outline.some(({ x, y }) => Math.abs(x) < 0.001 && y < 0)).toBe(true);
	});

	it("takes hold of a mark anywhere inside its hex, and of the nearer where two overlap", () => {
		const pins = [{ x: 200, y: 200 }, { x: 200 + g.size * 0.6, y: 200 }];
		expect(markAt(g, pins, { x: 200 - g.size * 0.5, y: 200 })).toBe(0);
		expect(markAt(g, pins, { x: 200 + g.size * 0.5, y: 200 })).toBe(1);
		expect(markAt(g, pins, { x: 200, y: 200 + g.size * 3 })).toBe(-1);
	});

	it("takes hold of a mark drawn too small to aim at by its centre", () => {
		const pins = [{ x: 500, y: 500 }];
		expect(markAt(g, pins, { x: 510, y: 500 }, { scale: 0.05 })).toBe(-1);
		expect(markAt(g, pins, { x: 510, y: 500 }, { scale: 0.05, reach: 12 })).toBe(0);
	});
});

describe("bringing a picture into view", () => {
	const screen = { width: 1600, height: 1000 };
	const zoom = { min: 0.1, max: 3 };
	/** Where a map point lands on screen, looking from a view. */
	const onScreen = (view, point) => ({
		x: screen.width / 2 + (point.x - view.x) * view.scale,
		y: screen.height / 2 + (point.y - view.y) * view.scale
	});
	const rect = { x: 900, y: 1000, width: 1700, height: 1900 };
	const room = { left: 100, top: 50, right: 1300, bottom: 800 };

	it("fits the whole picture inside the room, its corners on the room's edges", () => {
		const view = viewOfPicture(rect, room, screen, zoom);
		const topLeft = onScreen(view, { x: rect.x - rect.width / 2, y: rect.y - rect.height / 2 });
		const bottomRight = onScreen(view, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
		expect(topLeft.y).toBeCloseTo(room.top, 6);
		expect(bottomRight.y).toBeCloseTo(room.bottom, 6);
		expect(topLeft.x).toBeGreaterThanOrEqual(room.left);
		expect(bottomRight.x).toBeLessThanOrEqual(room.right);
		expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo((room.left + room.right) / 2, 6);
	});

	it("keeps a margin round it", () => {
		const view = viewOfPicture(rect, room, screen, zoom, 16);
		expect(onScreen(view, { x: rect.x, y: rect.y + rect.height / 2 }).y).toBeCloseTo(room.bottom - 16, 6);
	});

	it("stops at the furthest the canvas zooms out, still centred in the room", () => {
		const view = viewOfPicture(rect, room, screen, { min: 0.6, max: 3 });
		expect(view.scale).toBe(0.6);
		const centre = onScreen(view, rect);
		expect(centre.x).toBeCloseTo((room.left + room.right) / 2, 6);
		expect(centre.y).toBeCloseTo((room.top + room.bottom) / 2, 6);
	});

	it("stops at the nearest the canvas zooms in, for a small picture", () => {
		expect(viewOfPicture({ x: 0, y: 0, width: 10, height: 10 }, room, screen, zoom).scale).toBe(3);
	});

	it("says nothing for a picture or a room with no size", () => {
		expect(viewOfPicture({ ...rect, width: 0 }, room, screen, zoom)).toBeNull();
		expect(viewOfPicture(rect, { ...room, bottom: room.top }, screen, zoom)).toBeNull();
		expect(viewOfPicture(rect, room, screen, zoom, 1000)).toBeNull();
	});
});
