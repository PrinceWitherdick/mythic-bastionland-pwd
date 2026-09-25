import { describe, expect, it } from "vitest";
import { TERRAIN } from "../../module/rules/realm.js";
import { BOOK_LAYOUT, REALM_LAYOUTS, hexCentre, realmGeometry } from "../../module/rules/realm-geometry.js";
import {
	MAP_HANDLES,
	MAP_ROLES,
	TERRAIN_MARKS,
	calibrationHexes,
	fitFromClicks,
	fittedMapRect,
	fullMapRect,
	handleAt,
	hidesTerrain,
	layoutChoices,
	layoutDiagram,
	mapHandles,
	mapRect,
	normaliseMapPicture,
	normaliseRealmPicture,
	realmPictures,
	resizeMapRect,
	slideMapRect,
	terrainMark
} from "../../module/rules/realm-map.js";

const g = realmGeometry();

/** Where the two hexes a picture is lined up by sit on the map. */
const marks = () => calibrationHexes(g).map((hex) => hexCentre(g, hex));

/** Where a point of a picture falls on the map, so a test can click it. */
const pointOn = (rect, u, v) => ({ x: rect.x - rect.width / 2 + u * rect.width, y: rect.y - rect.height / 2 + v * rect.height });

/** Which share of a picture a point of the map falls at, to check a fit. */
const shareOf = (rect, point) => ({
	u: (point.x - (rect.x - rect.width / 2)) / rect.width,
	v: (point.y - (rect.y - rect.height / 2)) / rect.height
});

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

describe("fitFromClicks", () => {
	it("puts the two hexes exactly where they were clicked", () => {
		const rect = fullMapRect(g);
		// As if the picture were a third again as wide as the map and sitting low and to the right.
		const askew = { x: rect.x + 300, y: rect.y - 120, width: rect.width * 1.3, height: rect.height * 0.8 };
		const [first, second] = [pointOn(askew, 0.12, 0.09), pointOn(askew, 0.86, 0.94)];

		const fitted = fitFromClicks(g, askew, first, second);
		const [from, to] = marks();
		expect(shareOf(fitted, from).u).toBeCloseTo(0.12, 4);
		expect(shareOf(fitted, from).v).toBeCloseTo(0.09, 4);
		expect(shareOf(fitted, to).u).toBeCloseTo(0.86, 4);
		expect(shareOf(fitted, to).v).toBeCloseTo(0.94, 4);
	});

	it("stretches each way on its own, so a photograph a little out of square is put right", () => {
		const rect = fullMapRect(g);
		const fitted = fitFromClicks(g, rect, pointOn(rect, 0.2, 0.2), pointOn(rect, 0.8, 0.6));
		// The clicks are four tenths apart down and six across, so the picture grows more down than across.
		expect(fitted.height / rect.height).toBeGreaterThan(fitted.width / rect.width);
	});

	it("lines a photograph up from the margins and the rules printed beside the map", () => {
		// The sheet photographed whole: the map is only the left half of it, a little in from the top.
		const rect = fullMapRect(g);
		const whole = { x: rect.x, y: rect.y, width: rect.width * 2.4, height: rect.height * 1.2 };
		const fitted = fitFromClicks(g, whole, pointOn(whole, 0.04, 0.05), pointOn(whole, 0.41, 0.95));
		expect(fitted.width).toBeGreaterThan(g.width);
		// The map's own hexes land where they belong, whatever else the photograph holds.
		const [from, to] = marks();
		expect(shareOf(fitted, from).u).toBeCloseTo(0.04, 4);
		expect(shareOf(fitted, to).u).toBeCloseTo(0.41, 4);
	});

	it("takes the two corners in either order", () => {
		const rect = fullMapRect(g);
		const [first, second] = [pointOn(rect, 0.1, 0.1), pointOn(rect, 0.9, 0.9)];
		expect(fitFromClicks(g, rect, second, first)).toEqual(fitFromClicks(g, rect, first, second));
	});

	it("refuses two clicks too close together to say anything", () => {
		const rect = fullMapRect(g);
		expect(fitFromClicks(g, rect, pointOn(rect, 0.5, 0.5), pointOn(rect, 0.52, 0.52))).toBeNull();
		expect(fitFromClicks(g, rect, pointOn(rect, 0.5, 0.5), pointOn(rect, 0.5, 0.5))).toBeNull();
		// Far apart across but not down.
		expect(fitFromClicks(g, rect, pointOn(rect, 0.1, 0.5), pointOn(rect, 0.9, 0.51))).toBeNull();
	});

	it("refuses a pair that would send the picture miles away", () => {
		const rect = fullMapRect(g);
		// One corner clicked before the other across but after it down: the picture would have to be turned over.
		expect(fitFromClicks(g, rect, pointOn(rect, 0.1, 0.9), pointOn(rect, 0.9, 0.1))).toBeNull();
	});

	it("says nothing without a picture to line up", () => {
		expect(fitFromClicks(g, null, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
		expect(fitFromClicks(g, fullMapRect(g), null, { x: 1, y: 1 })).toBeNull();
	});

	it("lines up a map drawn with pointed tops hex for hex", () => {
		// A 980 by 829 picture of a 12 by 12 Realm, pointed tops with the second row set in: its first hex is centred
		// at (50.5, 49.5) and its last at (931.5, 779), and its hexes are 76.6 pixels across the flats.
		const rows = realmGeometry({ layout: "evenRows" });
		const size = { width: 980, height: 829 };
		const rect = fittedMapRect(rows, size);
		const at = (px, py) => pointOn(rect, px / size.width, py / size.height);
		const fitted = fitFromClicks(rows, rect, at(50.5, 49.5), at(931.5, 779));
		// Hex (7,7), in a row not set in, and hex (7,6), in one set in, then fall where the picture draws them.
		const across = 76.6;
		const down = 1.5 * (across / Math.sqrt(3));
		const middle = shareOf(fitted, hexCentre(rows, { col: 7, row: 7 }));
		expect(middle.u * size.width).toBeCloseTo(50.5 + 6 * across, -1);
		expect(middle.v * size.height).toBeCloseTo(49.5 + 6 * down, -1);
		const setIn = shareOf(fitted, hexCentre(rows, { col: 7, row: 6 }));
		expect(setIn.u * size.width).toBeCloseTo(50.5 + 6.5 * across, -1);
		expect(setIn.v * size.height).toBeCloseTo(49.5 + 5 * down, -1);
		// Near enough the picture's own shape: the hexes are regular on it, and on the map.
		expect((fitted.width / fitted.height) / (size.width / size.height)).toBeCloseTo(1, 1);
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

describe("sliding a picture into place", () => {
	const rect = { x: 500, y: 400, width: 1000, height: 800 };

	it("puts a handle on each corner and the middle of each edge", () => {
		const at = Object.fromEntries(mapHandles(rect).map(({ handle, x, y }) => [handle, { x, y }]));
		expect(Object.keys(at)).toEqual(Object.keys(MAP_HANDLES));
		expect(at.nw).toEqual({ x: 0, y: 0 });
		expect(at.se).toEqual({ x: 1000, y: 800 });
		expect(at.e).toEqual({ x: 1000, y: 400 });
	});

	it("takes the handle within reach of the pointer, and slides the whole picture otherwise", () => {
		expect(handleAt(rect, { x: 4, y: -3 }, 10)).toBe("nw");
		expect(handleAt(rect, { x: 500, y: 795 }, 10)).toBe("s");
		expect(handleAt(rect, { x: 500, y: 400 }, 10)).toBeNull();
		expect(handleAt(rect, { x: 20, y: 0 }, 10)).toBeNull();
	});

	it("slides without changing the size", () => {
		expect(slideMapRect(rect, 12.5, -7)).toEqual({ x: 512.5, y: 393, width: 1000, height: 800 });
	});

	it("sizes by a corner keeping the shape, the opposite corner held still", () => {
		const grown = resizeMapRect(g, rect, "se", { x: 1100, y: 900 });
		expect(grown.width / grown.height).toBeCloseTo(rect.width / rect.height, 4);
		expect(grown.x - grown.width / 2).toBeCloseTo(0, 1);
		expect(grown.y - grown.height / 2).toBeCloseTo(0, 1);
		expect(grown.width).toBeGreaterThan(rect.width);
	});

	it("follows the pointer freely from a corner when the shape isn't kept", () => {
		const free = resizeMapRect(g, rect, "nw", { x: 100, y: -50 }, { keepShape: false });
		expect(free).toEqual({ x: 550, y: 375, width: 900, height: 850 });
	});

	it("stretches one way alone by an edge", () => {
		const wider = resizeMapRect(g, rect, "e", { x: 1200, y: 9999 });
		expect(wider).toEqual({ x: 600, y: 400, width: 1200, height: 800 });
		const taller = resizeMapRect(g, rect, "n", { x: -9999, y: -100 });
		expect(taller).toEqual({ x: 500, y: 350, width: 1000, height: 900 });
	});

	it("never lets a picture be dragged inside out or down to nothing", () => {
		const crushed = resizeMapRect(g, rect, "e", { x: -500, y: 400 });
		expect(crushed.width).toBeGreaterThan(0);
		expect(crushed.width).toBeCloseTo(g.width * 0.1, 2);
		const shrunk = resizeMapRect(g, rect, "se", { x: -500, y: -500 });
		expect(shrunk.width).toBeGreaterThanOrEqual(g.width * 0.1 - 0.01);
		expect(shrunk.height).toBeGreaterThanOrEqual(g.height * 0.1 - 0.01);
	});
});
