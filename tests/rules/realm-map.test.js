import { describe, expect, it } from "vitest";
import { TERRAIN } from "../../module/rules/realm.js";
import { BOOK_LAYOUT, REALM_LAYOUTS, hexCentre, hexVertices, realmGeometry } from "../../module/rules/realm-geometry.js";
import {
	MAP_ROLES,
	TERRAIN_MARKS,
	calibrationHexes,
	fitToMarks,
	fittedMapRect,
	fullMapRect,
	hidesTerrain,
	layoutChoices,
	layoutDiagram,
	mapRect,
	markAt,
	markedHexOutline,
	markedHexScale,
	markedHexLettering,
	normaliseMapPicture,
	normaliseRealmPicture,
	realmPictures,
	resizesMapPicture,
	sizeMapRect,
	slideMapRect,
	terrainMark,
	viewOfPicture,
	withMapPlaces
} from "../../module/rules/realm-map.js";

const g = realmGeometry();

/** Where the two hexes a picture is lined up by sit on the map. */
const marks = () => calibrationHexes(g).map((hex) => hexCentre(g, hex));

describe("normaliseMapPicture", () => {
	it("keeps a picture with nowhere to be, since it hasn't been lined up yet", () => {
		expect(normaliseMapPicture({ src: "maps/realm.webp" })).toEqual({ src: "maps/realm.webp" });
		expect(normaliseMapPicture({ src: " maps/realm.webp " })).toEqual({ src: "maps/realm.webp" });
	});

	it("keeps where it lies once it has all four measurements", () => {
		expect(normaliseMapPicture({ src: "a.png", x: 10.005, y: 20, width: 30, height: 40 }))
			.toEqual({ src: "a.png", x: 10.01, y: 20, width: 30, height: 40 });
	});

	it("drops measurements that say nothing", () => {
		for (const bad of [{ width: 0, height: 40 }, { width: 30 }, { width: "30", height: 40 }, { width: 30, height: Number.NaN }]) {
			expect(normaliseMapPicture({ src: "a.png", x: 0, y: 0, ...bad })).toEqual({ src: "a.png" });
		}
	});

	it("is nothing without a picture", () => {
		for (const bad of [null, undefined, {}, { src: "" }, { src: "   " }, { src: 7 }]) expect(normaliseMapPicture(bad)).toBeNull();
	});
});

describe("normaliseRealmPicture", () => {
	it("is nothing without a players' map", () => {
		expect(normaliseRealmPicture(null)).toBeNull();
		expect(normaliseRealmPicture({ referee: { src: "secret.png" }, features: true })).toBeNull();
	});

	it("keeps the players' map, dropping a referee's map and the features tick from before", () => {
		expect(normaliseRealmPicture({ players: { src: "open.png" }, referee: { src: "secret.png" }, features: 1 }))
			.toEqual({ players: { src: "open.png" } });
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
