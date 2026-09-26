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
 * How the name written in the middle of each hex already marked is lettered,
 * so no hex is taken for unmarked, or for the wrong ground, because its tint
 * is faint over a dark drawing. The longest names, Meadow and Plains, fit
 * inside the hex with room to spare.
 * @param {number} size The hex's height.
 * @returns {{fontSize: number, strokeThickness: number}} In canvas pixels, whole ones.
 */
export function markedHexLettering(size) {
	const fontSize = Math.max(10, Math.round(size * 0.17));
	return { fontSize, strokeThickness: Math.max(2, Math.round(fontSize * 0.22)) };
}

/** How far off the Scene's own size a picture may be fitted, so a bad pair of marks can't send it miles away. */
const SIZE_LIMITS = Object.freeze({ least: 0.1, most: 20 });

/**
 * @param {object} g
 * @param {{width: number, height: number}} rect
 * @returns {boolean} Whether a picture this size is within SIZE_LIMITS of the map's.
 */
const withinSizeLimits = (g, rect) => [[rect.width, g.width], [rect.height, g.height]]
	.every(([length, map]) => length >= map * SIZE_LIMITS.least && length <= map * SIZE_LIMITS.most);

/**
 * How far, in degrees, the line between two marks may turn from the line
 * between the map's first and last hex. The picture is never turned, so marks
 * further round than a photograph taken a little askew can't be its corners.
 */
const MOST_TURNED = 10;

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
 * deleted comes back where it was; while the Tile is there its place is the
 * truth, so a GM who drags it with Foundry's own tools has moved the picture.
 * Its size is the flag's: a picture keeps the size it was laid at, so a Tile
 * sized any other way is put back to it. One never measured takes the Tile's
 * size as well.
 * @param {object|null|undefined} picture
 * @param {Record<string, {x: number, y: number, width: number, height: number}>} places By role, from the Tiles on the Scene.
 * @returns {object|null|undefined}
 */
export const withMapPlaces = (picture, places) => (picture
	? { ...picture, ...Object.fromEntries(MAP_ROLES.flatMap((role) => {
		const map = picture[role];
		const place = places?.[role];
		if (!map || !place) return [];
		return [[role, map.width > 0 ? { ...map, x: place.x, y: place.y } : { ...map, ...place }]];
	})) }
	: picture);

/**
 * Whether a change to a picture's Tile would size the picture. A picture is
 * never sized by hand: it's laid at the size that fits, and sized again only
 * evenly, by two hexes marked on it (fitToMarks), so it can't be stretched out
 * of its shape. A picture never measured has no size to keep.
 * @param {MapPicture|null|undefined} picture What the Realm says of the picture.
 * @param {{width?: number, height?: number}|null|undefined} changes To its Tile.
 * @returns {boolean}
 */
export function resizesMapPicture(picture, changes) {
	if (!(picture?.width > 0) || !changes) return false;
	// Tiles are sized in whole pixels, the picture to the hundredth.
	return [["width", picture.width], ["height", picture.height]]
		.some(([key, size]) => key in changes && !(Math.abs(Number(changes[key]) - size) < 1));
}

/**
 * @param {object} g
 * @returns {{x: number, y: number, width: number, height: number}} The whole map, which a picture covers until it's lined up.
 */
export const fullMapRect = (g) => ({ x: g.width / 2, y: g.height / 2, width: g.width, height: g.height });

/**
 * Where a picture lies before it's lined up: as large as fits on the map
 * without being stretched, in the middle of it. A map drawn edge to edge is
 * then in place already, and only has to be slid; one with a border round it
 * is sized to its hexes by marking two of them.
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
 * Corners as far apart as the map allows, so a mark a few pixels out barely
 * moves anything.
 * @param {object} g
 * @returns {{col: number, row: number}[]}
 */
export const calibrationHexes = (g) => [{ col: 1, row: 1 }, { col: g.cols, row: g.rows }];

/**
 * How two marks on a picture compare with the map's first and last hex: the
 * line from one mark to the other, the line from the one hex to the other,
 * and how much the picture must be sized, evenly, for the one to become the
 * other. The best even size for two points is the one that matches the
 * lines' lengths along the map's own line.
 * @param {object} g
 * @param {{x: number, y: number}|null|undefined} first Where the first hex's centre is marked.
 * @param {{x: number, y: number}|null|undefined} second Where the last hex's centre is marked.
 * @returns {{scale: number, marked: {x: number, y: number}, hexes: {x: number, y: number}}|null} Null for two marks that
 *   can't be the map's corners: missing, on top of each other, the wrong way round, or turned too far from the map's line.
 */
function compareMarks(g, first, second) {
	if (!first || !second) return null;
	const [from, to] = calibrationHexes(g).map((hex) => hexCentre(g, hex));
	const marked = { x: second.x - first.x, y: second.y - first.y };
	const hexes = { x: to.x - from.x, y: to.y - from.y };
	const along = marked.x * hexes.x + marked.y * hexes.y;
	const lengths = Math.hypot(marked.x, marked.y) * Math.hypot(hexes.x, hexes.y);
	if (!(along > 0) || !(lengths > 0) || along / lengths < Math.cos(MOST_TURNED * Math.PI / 180)) return null;
	return { scale: along / (marked.x ** 2 + marked.y ** 2), marked, hexes };
}

/**
 * How large a picture's hexes are beside the Realm's own, going by where the
 * GM has marked the centres of the map's first and last hex on it: the same
 * both ways, since a picture is only ever sized evenly.
 * @param {object} g
 * @param {{x: number, y: number}|null|undefined} first
 * @param {{x: number, y: number}|null|undefined} second
 * @returns {number|null} Null until both are marked, or for marks that can't be the map's corners.
 */
export function markedHexScale(g, first, second) {
	const compared = compareMarks(g, first, second);
	return compared ? 1 / compared.scale : null;
}

/**
 * Line a picture up from the hexes marked on it: sized evenly so its hexes
 * are the Realm's own size, and moved so the marks land where the map's
 * first and last hex are, as near as the two allow. Never stretched, so a map
 * drawn right needs no cropping: the margins, the numbers and the legend
 * round it fall off the map's edges, where nothing is drawn.
 * @param {object} g
 * @param {{x: number, y: number, width: number, height: number}} rect Where the picture lies now.
 * @param {{x: number, y: number}[]} marks Where the first and last hex are marked on it, in that order.
 * @returns {{x: number, y: number, width: number, height: number}|null} Null without both marks, for marks
 *   that can't be the map's corners, or for a fit that would leave the picture far too large or small.
 */
export function fitToMarks(g, rect, marks) {
	const [first, second] = marks ?? [];
	const compared = rect?.width > 0 && rect?.height > 0 ? compareMarks(g, first, second) : null;
	if (!compared) return null;
	const { scale } = compared;
	const [from, to] = calibrationHexes(g).map((hex) => hexCentre(g, hex));
	// The point halfway between the marks lands halfway between the hexes, and the picture is sized about it.
	const middle = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
	const target = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
	const fitted = {
		x: round(target.x + (rect.x - middle.x) * scale),
		y: round(target.y + (rect.y - middle.y) * scale),
		width: round(rect.width * scale),
		height: round(rect.height * scale)
	};
	return withinSizeLimits(g, fitted) ? fitted : null;
}

/**
 * The outline of a hex marked on a picture: centred where the GM put the
 * mark, and as large as the picture's own hexes are once both marks say so,
 * so the GM can see it sit squarely over the hex drawn there or not. Every
 * hex of a Realm is the same shape, so any one of them serves.
 * @param {object} g
 * @param {{x: number, y: number}} point Where the mark is.
 * @param {number} [scale] From markedHexScale: the Realm's own hex size without it.
 * @returns {{x: number, y: number}[]} Its corners, in order round it.
 */
export function markedHexOutline(g, point, scale = 1) {
	const hex = { col: 1, row: 1 };
	const centre = hexCentre(g, hex);
	return hexVertices(g, hex).map(({ x, y }) => ({ x: point.x + (x - centre.x) * scale, y: point.y + (y - centre.y) * scale }));
}

/**
 * @param {{x: number, y: number}[]} corners A shape with no dents, in order round it.
 * @param {{x: number, y: number}} point
 * @returns {boolean} Whether the point is inside it or on its edge.
 */
function inside(corners, point) {
	let side = 0;
	for (const [index, a] of corners.entries()) {
		const b = corners[(index + 1) % corners.length];
		const turn = Math.sign((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x));
		if (!turn) continue;
		if (side && turn !== side) return false;
		side = turn;
	}
	return true;
}

/**
 * Which mark on a picture the pointer has hold of: anywhere inside its hex,
 * or near enough its centre when the hex is drawn too small to aim at. Where
 * two overlap, the one whose centre is nearer.
 * @param {object} g
 * @param {{x: number, y: number}[]} marks Where each is.
 * @param {{x: number, y: number}} point Where the pointer is on the map.
 * @param {object} [options]
 * @param {number} [options.scale] From markedHexScale.
 * @param {number} [options.reach] How near a mark's centre is always near enough, in map pixels.
 * @returns {number} The mark's index, or -1 for none.
 */
export function markAt(g, marks, point, { scale = 1, reach = 0 } = {}) {
	let nearest = -1;
	let best = Infinity;
	for (const [index, mark] of marks.entries()) {
		const distance = Math.hypot(point.x - mark.x, point.y - mark.y);
		const held = distance <= reach || inside(markedHexOutline(g, mark, scale), point);
		if (held && distance < best) [nearest, best] = [index, distance];
	}
	return nearest;
}

/**
 * Where to look at the map from for the whole of a picture to be in view
 * inside part of the screen, as large as it fits there: the centre and zoom
 * Foundry's canvas is panned to. The zoom is kept within what the canvas
 * allows, so a picture too large to fit even at the furthest the map zooms out
 * is still centred in that part of the screen, running over its edges alike.
 * @param {{x: number, y: number, width: number, height: number}} rect The picture on the map, by its centre.
 * @param {{left: number, top: number, right: number, bottom: number}} room The part of the screen, in CSS pixels.
 * @param {{width: number, height: number}} screen The whole canvas on screen: the view is its middle.
 * @param {{min: number, max: number}} zoom How far the canvas zooms out and in.
 * @param {number} [margin] Room kept round the picture, in CSS pixels.
 * @returns {{x: number, y: number, scale: number}|null} Null for a picture or a part of the screen with no size.
 */
export function viewOfPicture(rect, room, screen, zoom, margin = 0) {
	const wide = room.right - room.left - 2 * margin;
	const tall = room.bottom - room.top - 2 * margin;
	if (!(rect?.width > 0) || !(rect?.height > 0) || !(wide > 0) || !(tall > 0)) return null;
	const scale = Math.min(Math.max(Math.min(wide / rect.width, tall / rect.height), zoom.min), zoom.max);
	// The map point at the middle of the screen, for the picture's centre to fall in the middle of the room.
	return {
		x: rect.x - (((room.left + room.right) / 2) - (screen.width / 2)) / scale,
		y: rect.y - (((room.top + room.bottom) / 2) - (screen.height / 2)) / scale,
		scale
	};
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
 * Size a picture evenly about a point on it, so what's under that point stays
 * put: the pointer, when the GM sizes it with the wheel.
 * @param {object} g
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {number} factor How much larger it's made: below 1 makes it smaller.
 * @param {{x: number, y: number}} about
 * @returns {{x: number, y: number, width: number, height: number}|null} The picture sized, its shape kept; null for a
 *   size too far from the map's, or a factor that isn't one.
 */
export function sizeMapRect(g, rect, factor, about) {
	if (!(factor > 0) || !(rect?.width > 0) || !(rect?.height > 0)) return null;
	const sized = {
		x: round(about.x + (rect.x - about.x) * factor),
		y: round(about.y + (rect.y - about.y) * factor),
		width: round(rect.width * factor),
		height: round(rect.height * factor)
	};
	return withinSizeLimits(g, sized) ? sized : null;
}
