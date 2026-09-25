/**
 * A Realm whose map is a picture the GM already has: a photograph or scan of a
 * Realm drawn on paper, laid under the hexes in place of the system's own ink.
 * The picture is only the look of it; what each hex holds is still marked with
 * the terrain brush, so Travel, the Wilderness Roll and the Lay of the Land
 * work on a traced Realm exactly as they do on a rolled one.
 *
 * One picture: the players' map, which everyone looks at. Whatever it shows,
 * the players see (p14: "Players get a copy of the map with Holdings and
 * general terrain marked. They cannot see Myths, Landmarks, and Barriers"), so
 * the Landmarks and the rest are placed over it afterwards, not traced from it.
 *
 * A map of the GM's own needn't be laid out as the book's sheet is: its hexes
 * may have pointed tops, or have the first column set lower rather than the
 * second. The GM says which (REALM_LAYOUTS), and the Realm's own hexes are laid
 * out the same way, so the two can meet hex for hex.
 *
 * Pure, so it can be tested without Foundry.
 */
import { ART_ROOT } from "./book-art.js";
import { BOOK_LAYOUT, REALM_LAYOUTS, allHexes, hexCentre, hexVertices, normaliseLayout, realmGeometry } from "./realm-geometry.js";

/** Where pictures of a GM's own Realm maps are saved, under Data rather than a world. */
export const REALM_MAP_DIR = `${ART_ROOT}/realm-maps`;

/** The pictures a Realm may carry, in the order they're laid down. Names live under `bastionland.realm.picture.roles`. */
export const MAP_ROLES = Object.freeze(["players"]);

/**
 * A colour for each terrain in the d12 order, to mark the hexes already
 * marked while the GM works over a picture. These are not the colour set's
 * tints: those are mixed from five kinds of ground, so Marsh and Bog come out
 * alike, which is no use for picking every Valley out of a photograph. Twelve
 * colours told apart at a glance instead.
 */
export const TERRAIN_MARKS = Object.freeze([
	"#4a8f7b", "#a85fa0", "#7d7f86", "#5560c8", "#1d6b2a", "#8fae22",
	"#b07423", "#63cc55", "#6b4a26", "#2a7ad4", "#d4557a", "#d6b030"
]);

const MARK_NUMBERS = Object.freeze(TERRAIN_MARKS.map((hex) => Number(hex.replace("#", "0x"))));

/**
 * @param {number} terrain 1-12.
 * @returns {number} Its mark's colour, as the canvas wants it.
 */
export const terrainMark = (terrain) => MARK_NUMBERS[terrain - 1] ?? MARK_NUMBERS[0];

/** How solid a mark is drawn over the picture: enough to tell the terrain, faint enough to read the drawing under it. */
export const MARK_ALPHA = 0.38;

/**
 * How far apart, as a share of the picture, two clicks lining it up must be.
 * Closer than this and a small slip of the hand would throw the whole map out.
 */
const LEAST_APART = 0.05;

/** How far off the Scene's own size a picture may end up, so a bad pair of clicks can't send it miles away. */
const SIZE_LIMITS = Object.freeze({ least: 0.1, most: 20 });

/** Kept to the hundredth of a pixel, so a Realm read back and written again doesn't rewrite itself. */
const round = (value) => Math.round(value * 100) / 100;

/**
 * @typedef {object} MapPicture One of a Realm's pictures. `x` and `y` are its
 *   centre, as a Tile is placed. A picture is laid as large as fits on the map
 *   as it's chosen (fittedMapRect) and moved when it's lined up; one with no
 *   measurements, kept from before pictures were measured, lies over the whole
 *   map until it's lined up.
 * @property {string} src
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [width]
 * @property {number} [height]
 */

/**
 * @typedef {object} RealmPicture
 * @property {MapPicture} players The map everyone looks at.
 */

/**
 * @param {object|null|undefined} picture
 * @returns {MapPicture|null} Null without a picture to show.
 */
export function normaliseMapPicture(picture) {
	const src = typeof picture?.src === "string" ? picture.src.trim() : "";
	if (!src) return null;
	const { x, y, width, height } = picture;
	const measured = [x, y, width, height].every((value) => Number.isFinite(value)) && width > 0 && height > 0;
	return measured ? { src, x: round(x), y: round(y), width: round(width), height: round(height) } : { src };
}

/**
 * A Realm's pictures with anything unusable dropped, including the referee's
 * map Realms once carried over the players' and the word that the picture
 * drew the Holdings, Landmarks and Myths itself.
 * @param {object|null|undefined} picture
 * @returns {RealmPicture|null}
 */
export function normaliseRealmPicture(picture) {
	const players = normaliseMapPicture(picture?.players);
	return players ? { players } : null;
}

/**
 * A Realm's pictures with each one put where its Tile actually stands. The
 * Scene's flag remembers where each was left, so a picture whose Tile is
 * deleted comes back where it was; while the Tile is there it is the truth,
 * so a GM who nudges it with Foundry's own handles has moved the picture.
 * @param {object|null|undefined} picture
 * @param {Record<string, {x: number, y: number, width: number, height: number}>} places By role, from the Tiles on the Scene.
 * @returns {object|null|undefined}
 */
export const withMapPlaces = (picture, places) => (picture
	? { ...picture, ...Object.fromEntries(MAP_ROLES.flatMap((role) => (picture[role] && places?.[role] ? [[role, { ...picture[role], ...places[role] }]] : []))) }
	: picture);

/**
 * @param {object} g
 * @returns {{x: number, y: number, width: number, height: number}} The whole map, which a picture covers until it's lined up.
 */
export const fullMapRect = (g) => ({ x: g.width / 2, y: g.height / 2, width: g.width, height: g.height });

/**
 * Where a picture lies before it's lined up: as large as fits on the map
 * without being stretched, in the middle of it. A map drawn edge to edge is
 * then nearly in place already, and the two clicks only have to nudge it.
 * @param {object} g
 * @param {{width: number, height: number}|null|undefined} size The picture's own size, in its pixels.
 * @returns {{x: number, y: number, width: number, height: number}} The whole map for a picture of no known size.
 */
export function fittedMapRect(g, size) {
	const width = Number(size?.width);
	const height = Number(size?.height);
	if (!(width > 0) || !(height > 0)) return fullMapRect(g);
	const scale = Math.min(g.width / width, g.height / height);
	return { x: round(g.width / 2), y: round(g.height / 2), width: round(width * scale), height: round(height * scale) };
}

/** How big, in the diagram's own units, each hex of a layout's little picture is across its flat sides. */
const DIAGRAM_HEX = 20;

/** Room left round a diagram, so the lines on its edges aren't cut in half. */
const DIAGRAM_MARGIN = 2;

/**
 * A little picture of a layout's top-left corner, four hexes by three inside
 * the map's top and left edges, drawn from the same geometry the Realm itself
 * is laid out by, so the choice looks exactly like what it makes. The GM
 * picks the one that looks like the corner of their own map.
 * @param {string} layout One of REALM_LAYOUTS.
 * @returns {{viewBox: string, edge: string, hexes: {points: string}[]}} For an SVG: the map's edges as a path, and the hexes as polygons.
 */
export function layoutDiagram(layout) {
	const g = realmGeometry({ size: DIAGRAM_HEX, cols: 4, rows: 3, layout });
	const box = [-DIAGRAM_MARGIN, -DIAGRAM_MARGIN, g.width + 2 * DIAGRAM_MARGIN, g.height + 2 * DIAGRAM_MARGIN];
	return {
		viewBox: box.map(round).join(" "),
		edge: `M0 ${round(g.height)} V0 H${round(g.width)}`,
		hexes: allHexes(g).map((hex) => ({
			points: hexVertices(g, hex).map(({ x, y }) => `${round(x)},${round(y)}`).join(" ")
		}))
	};
}

/**
 * The layouts a GM can say their map is drawn in, for a dialog.
 * @param {string} [current] The one chosen now.
 * @returns {{key: string, checked: boolean, book: boolean, diagram: ReturnType<typeof layoutDiagram>}[]}
 */
export function layoutChoices(current = BOOK_LAYOUT) {
	const chosen = normaliseLayout(current);
	return REALM_LAYOUTS.map((key) => ({ key, checked: key === chosen, book: key === BOOK_LAYOUT, diagram: layoutDiagram(key) }));
}

/**
 * @param {object} g
 * @param {MapPicture|null|undefined} picture
 * @returns {{x: number, y: number, width: number, height: number}} Where it lies.
 */
export const mapRect = (g, picture) => (picture?.width > 0
	? { x: picture.x, y: picture.y, width: picture.width, height: picture.height }
	: fullMapRect(g));

/**
 * @param {import("./realm.js").Realm} realm
 * @param {object} g
 * @returns {{role: string, src: string, x: number, y: number, width: number, height: number}[]} Each picture and where it lies.
 */
export const realmPictures = (realm, g) => MAP_ROLES.flatMap((role) => {
	const picture = realm.picture?.[role];
	return picture ? [{ role, src: picture.src, ...mapRect(g, picture) }] : [];
});

/**
 * @param {import("./realm.js").Realm} realm
 * @returns {boolean} Whether the system's own terrain, river and lake drawings give way to a picture.
 */
export const hidesTerrain = (realm) => Boolean(realm.picture);

/**
 * The two hexes a picture is lined up by: the first of the map and the last.
 * Corners as far apart as the map allows, so a click a few pixels out barely
 * moves anything.
 * @param {object} g
 * @returns {{col: number, row: number}[]}
 */
export const calibrationHexes = (g) => [{ col: 1, row: 1 }, { col: g.cols, row: g.rows }];

/**
 * Solve one axis: where the picture must lie for two points of it to fall on
 * two known places.
 * @param {number} first Where the first click was, along this axis.
 * @param {number} second
 * @param {number} centre Where the picture's centre is now.
 * @param {number} length How long the picture is now.
 * @param {number} from Where the first click should have landed.
 * @param {number} to
 * @returns {{centre: number, length: number}|null} Null for clicks too close together to say anything.
 */
function solveAxis(first, second, centre, length, from, to) {
	const origin = centre - length / 2;
	const a = (first - origin) / length;
	const b = (second - origin) / length;
	if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b - a) < LEAST_APART) return null;
	const size = (to - from) / (b - a);
	return { centre: from - a * size + size / 2, length: size };
}

/**
 * @param {object} g
 * @param {{width: number, height: number}} rect
 * @returns {boolean} Whether a picture that size is worth writing.
 */
const sized = (g, rect) => [[rect.width, g.width], [rect.height, g.height]]
	.every(([length, map]) => length >= map * SIZE_LIMITS.least && length <= map * SIZE_LIMITS.most);

/**
 * Line a picture up from two clicks on it: the centre of the map's first hex,
 * then the centre of its last. Each axis is solved on its own, so a photograph
 * taken a little askew of square is still put right, and anything past the
 * picture's edge — the margins of the sheet, the rules printed beside the map —
 * falls off the map of its own accord.
 *
 * Clicked the other way round, the two are swapped rather than refused: which
 * corner the GM started from is not worth an error.
 * @param {object} g
 * @param {{x: number, y: number, width: number, height: number}} rect Where the picture lies now.
 * @param {{x: number, y: number}} first Where the first hex's centre was clicked.
 * @param {{x: number, y: number}} second Where the last hex's centre was clicked.
 * @returns {{x: number, y: number, width: number, height: number}|null} Where it should lie, or null for a pair of
 *   clicks that says nothing: too close together, or one corner clicked before the other on one axis but after it on the other.
 */
export function fitFromClicks(g, rect, first, second) {
	if (!rect?.width || !rect?.height || !first || !second) return null;
	const [from, to] = calibrationHexes(g).map((hex) => hexCentre(g, hex));

	for (const [a, b] of [[first, second], [second, first]]) {
		const across = solveAxis(a.x, b.x, rect.x, rect.width, from.x, to.x);
		const down = solveAxis(a.y, b.y, rect.y, rect.height, from.y, to.y);
		if (!across || !down || across.length <= 0 || down.length <= 0) continue;
		const fitted = { x: round(across.centre), y: round(down.centre), width: round(across.length), height: round(down.length) };
		if (sized(g, fitted)) return fitted;
	}
	return null;
}

/**
 * The handles a picture is sized by while it's slid into place: its corners
 * and the middle of each edge, each with the way it lies from the picture's
 * centre as a share of its half-width and half-height.
 */
export const MAP_HANDLES = Object.freeze({
	nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0],
	se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0]
});

/**
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {{handle: string, x: number, y: number}[]} Where each handle stands on the map.
 */
export const mapHandles = (rect) => Object.entries(MAP_HANDLES).map(([handle, [across, down]]) => ({
	handle,
	x: rect.x + across * rect.width / 2,
	y: rect.y + down * rect.height / 2
}));

/**
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {{x: number, y: number}} point Where the pointer is on the map.
 * @param {number} reach How near a handle the pointer must be to take it, in map pixels.
 * @returns {string|null} The handle nearest the pointer within reach, or null to slide the whole picture.
 */
export function handleAt(rect, point, reach) {
	let nearest = null;
	let best = reach;
	for (const { handle, x, y } of mapHandles(rect)) {
		const distance = Math.hypot(point.x - x, point.y - y);
		if (distance <= best) [nearest, best] = [handle, distance];
	}
	return nearest;
}

/**
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {number} across How far to move it, in map pixels.
 * @param {number} down
 * @returns {{x: number, y: number, width: number, height: number}} The picture slid that far, its size kept.
 */
export const slideMapRect = (rect, across, down) => ({
	x: round(rect.x + across),
	y: round(rect.y + down),
	width: rect.width,
	height: rect.height
});

/**
 * Size a picture by one of its handles, the side or corner opposite held
 * still. A corner keeps the picture's shape unless told otherwise, since a
 * photograph is mostly the right shape already and only the wrong size; an
 * edge stretches that way alone, for one taken a little out of square.
 * @param {object} g
 * @param {{x: number, y: number, width: number, height: number}} rect Where the picture lay as the handle was taken.
 * @param {string} handle One of MAP_HANDLES.
 * @param {{x: number, y: number}} point Where the handle has been dragged to.
 * @param {object} [options]
 * @param {boolean} [options.keepShape] For a corner: grow both ways alike rather than following the pointer freely.
 * @returns {{x: number, y: number, width: number, height: number}} Never smaller or larger than a picture may be.
 */
export function resizeMapRect(g, rect, handle, point, { keepShape = true } = {}) {
	const sides = MAP_HANDLES[handle];
	if (!sides || !point) return rect;
	const [across, down] = sides;
	// The side or corner that stays where it is.
	const anchor = { x: rect.x - across * rect.width / 2, y: rect.y - down * rect.height / 2 };
	const least = { width: g.width * SIZE_LIMITS.least, height: g.height * SIZE_LIMITS.least };
	const most = { width: g.width * SIZE_LIMITS.most, height: g.height * SIZE_LIMITS.most };
	const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

	if (across && down && keepShape) {
		// How far along the line from the held corner to the one taken the pointer has come.
		const reach = { x: across * rect.width, y: down * rect.height };
		const scale = ((point.x - anchor.x) * reach.x + (point.y - anchor.y) * reach.y) / (reach.x ** 2 + reach.y ** 2);
		const lowest = Math.max(least.width / rect.width, least.height / rect.height);
		const highest = Math.min(most.width / rect.width, most.height / rect.height);
		const kept = clamp(scale, lowest, highest);
		return {
			x: round(anchor.x + reach.x * kept / 2),
			y: round(anchor.y + reach.y * kept / 2),
			width: round(rect.width * kept),
			height: round(rect.height * kept)
		};
	}

	const width = across ? clamp(across * (point.x - anchor.x), least.width, most.width) : rect.width;
	const height = down ? clamp(down * (point.y - anchor.y), least.height, most.height) : rect.height;
	return {
		x: round(across ? anchor.x + across * width / 2 : rect.x),
		y: round(down ? anchor.y + down * height / 2 : rect.y),
		width: round(width),
		height: round(height)
	};
}
