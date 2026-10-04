/**
 * A Realm whose map is a picture the GM already has: a photograph or scan of a
 * Realm drawn on paper, laid under the hexes in place of the system's own ink.
 * The picture is only the look of it; what each hex holds is still marked with
 * the terrain brush, so Travel, the Wilderness Roll and the Lay of the Land
 * work on a traced Realm exactly as they do on a rolled one.
 *
 * One picture: the players' map, which everyone looks at. Whatever it shows,
 * the players see (p14: their map shows the Holdings and the lie of the land,
 * but not the Myths, Landmarks or Barriers), so
 * the Landmarks and the rest are placed over it afterwards, not traced from it.
 *
 * A map of the GM's own needn't be laid out as the book's sheet is: its hexes
 * may have pointed tops, or have the first column set lower rather than the
 * second. The GM says which (REALM_LAYOUTS), and the Realm's own hexes are laid
 * out the same way, so the two can meet hex for hex.
 *
 * Or the map has no hexes on it at all, as a painted map hasn't (BARE_MAP).
 * Then the Realm lays its own over it: as many as its shape takes, so they
 * cover it edge to edge, and the picture is laid large enough to cover them.
 *
 * Either way, a map of the GM's own needn't be the book's 12 by 12 hexes: a
 * Realm made from one takes as many as the GM counts on it, or as its shape
 * takes, without the rules for setup being ignored.
 *
 * Pure, so it can be tested without Foundry.
 */
import { ART_ROOT } from "./book-art.js";
import { colourNumber } from "./colour.js";
import { BOOK_LAYOUT, REALM_LAYOUTS, allHexes, hexCentre, hexVertices, normaliseLayout, realmGeometry } from "./realm-geometry.js";
import { BOOK_SETUP, OTHER_SIDE, OWN_SIZE_LIMITS, ownSideLimits, within, withinOwnSize } from "./realm-setup.js";

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

const MARK_NUMBERS = Object.freeze(TERRAIN_MARKS.map(colourNumber));

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
 * @property {boolean} bare Whether the picture has no hexes on it, so the Realm's own are laid over it.
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
	// Said either way: the Scene's flag is merged into, so a word left out would leave the last one written standing.
	const bare = picture.bare === true;
	const measured = [x, y, width, height].every((value) => Number.isFinite(value)) && width > 0 && height > 0;
	return measured ? { src, bare, x: round(x), y: round(y), width: round(width), height: round(height) } : { src, bare };
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
 * @param {{width: number, height: number}|null|undefined} size
 * @returns {boolean} Whether a picture's own size is known.
 */
const measured = (size) => Number(size?.width) > 0 && Number(size?.height) > 0;

/**
 * A picture laid evenly in the middle of the map.
 * @param {object} g
 * @param {{width: number, height: number}|null|undefined} size The picture's own size, in its pixels.
 * @param {(across: number, down: number) => number} pick Which of the two scales that meet the map's edges.
 * @returns {{x: number, y: number, width: number, height: number}} The whole map for a picture of no known size.
 */
function laid(g, size, pick) {
	if (!measured(size)) return fullMapRect(g);
	const scale = pick(g.width / Number(size.width), g.height / Number(size.height));
	return { x: round(g.width / 2), y: round(g.height / 2), width: round(size.width * scale), height: round(size.height * scale) };
}

/**
 * Where a picture with hexes on it lies before it's lined up: as large as
 * fits on the map without being stretched, in the middle of it, until it's
 * sized to its hexes by marking two of them.
 * @param {object} g
 * @param {{width: number, height: number}|null|undefined} size The picture's own size, in its pixels.
 * @returns {{x: number, y: number, width: number, height: number}} The whole map for a picture of no known size.
 */
export const fittedMapRect = (g, size) => laid(g, size, Math.min);

/**
 * Where a picture with no hexes on it lies before it's lined up: just large
 * enough to cover the whole map without being stretched, in the middle of it,
 * so no hex is left on bare paper. Whatever runs past the map's edges isn't shown.
 * @param {object} g
 * @param {{width: number, height: number}|null|undefined} size The picture's own size, in its pixels.
 * @returns {{x: number, y: number, width: number, height: number}} The whole map for a picture of no known size.
 */
export const coveredMapRect = (g, size) => laid(g, size, Math.max);

/**
 * How much of a map with no hexes on it falls outside the Realm once it's
 * laid to cover it: none when the two are the same shape.
 * @param {object} g
 * @param {{width: number, height: number}|null|undefined} size The picture's own size, in its pixels.
 * @returns {number} The share of the picture, 0 to 1; 0 for a picture of no known size.
 */
export function coveredCrop(g, size) {
	if (!measured(size)) return 0;
	const { width, height } = coveredMapRect(g, size);
	return Math.max(0, 1 - (g.width * g.height) / (width * height));
}

/**
 * @param {object} g
 * @param {{width: number, height: number}|null|undefined} size The picture's own size, in its pixels.
 * @param {object} [options]
 * @param {boolean} [options.bare] Whether the picture has no hexes on it.
 * @returns {{x: number, y: number, width: number, height: number}} Where the picture lies before it's lined up.
 */
export const laidMapRect = (g, size, { bare = false } = {}) => (bare ? coveredMapRect : fittedMapRect)(g, size);

/**
 * How much of a picture may fall outside a Realm before it's a map of another
 * shape from the Realm's: about a fifth is a border or a strip of sea, and the
 * square picture of a Realm Sheet loses less than that.
 */
export const MUCH_CROPPED = 0.2;

/**
 * Whether a map is far from the shape of a typical Realm's, laid out its way,
 * so it wants more hexes one way than the book's 12 by 12 (p14) and fewer the other.
 * @param {{width: number, height: number}|null|undefined} size The picture's own size.
 * @param {string} [layout] One of REALM_LAYOUTS.
 * @returns {"wide"|"tall"|null} Null for a map of about the book's shape, or a picture of no known size.
 */
export function unusualMapShape(size, layout = BOOK_LAYOUT) {
	if (!measured(size)) return null;
	const g = realmGeometry({ layout });
	if (coveredCrop(g, size) <= MUCH_CROPPED) return null;
	return Number(size.width) / Number(size.height) > g.width / g.height ? "wide" : "tall";
}

/** The word a dialog gives for a map with no hexes on it, beside the layouts (REALM_LAYOUTS) one with hexes may be drawn in. */
export const BARE_MAP = "bare";

/**
 * How far the shape of a map so many hexes across and down is from a
 * picture's: none for the same shape. Laid to cover the map, the picture loses
 * 1 - e^-miss of its width or its height past the map's edges.
 * @param {{width: number, height: number}} size
 * @param {number} cols
 * @param {number} rows
 * @param {string} layout
 * @returns {number}
 */
function shapeMiss(size, cols, rows, layout) {
	const g = realmGeometry({ cols, rows, layout });
	return Math.abs(Math.log((g.width / g.height) / (Number(size.width) / Number(size.height))));
}

/**
 * @param {"cols"|"rows"} side
 * @param {number} [other] How many the other side has, if that's settled.
 * @returns {number[]} Every count that side of a map with no hexes on it may have (OWN_SIZE_LIMITS).
 */
const sideCounts = (side, other) => {
	const { min, max } = ownSideLimits(side, other);
	return Array.from({ length: max - min + 1 }, (_, index) => min + index);
};

/**
 * @param {number[]} counts
 * @param {(count: number) => number} miss
 * @returns {number} The count that misses least, the smaller where two miss alike.
 */
const closest = (counts, miss) => {
	let [best] = counts;
	let least = miss(best);
	for (const count of counts.slice(1)) {
		const next = miss(count);
		if (next < least) [best, least] = [count, next];
	}
	return best;
};

/**
 * How many hexes the other side of a map with no hexes on it takes for so
 * many along one side, so the Realm comes out as near its shape as whole hexes allow.
 * @param {{width: number, height: number}|null|undefined} size The picture's own size.
 * @param {"cols"|"rows"} side The side that's settled.
 * @param {number} count How many that side has.
 * @param {string} [layout] One of REALM_LAYOUTS.
 * @returns {number|null} Null for a picture of no known size.
 */
export function otherSideForPicture(size, side, count, layout = BOOK_LAYOUT) {
	if (!measured(size)) return null;
	const given = within(count, BOOK_SETUP[side], OWN_SIZE_LIMITS[side]);
	return closest(sideCounts(OTHER_SIDE[side], given), sideMiss(size, side, given, layout));
}

/**
 * How far from the picture's shape each count of the other side is, with one side settled.
 * @param {{width: number, height: number}} size The picture's own size.
 * @param {"cols"|"rows"} side The side that's settled.
 * @param {number} count How many that side has.
 * @param {string} layout One of REALM_LAYOUTS.
 * @returns {(n: number) => number}
 */
const sideMiss = (size, side, count, layout) =>
	(n) => (side === "cols" ? shapeMiss(size, count, n, layout) : shapeMiss(size, n, count, layout));

/**
 * A size with one side kept and the other following the picture's shape.
 * @param {{width: number, height: number}} size The picture's own size, measured.
 * @param {"cols"|"rows"} lead The side that's kept.
 * @param {{cols: number, rows: number}} given
 * @param {string} layout One of REALM_LAYOUTS.
 * @returns {{cols: number, rows: number}}
 */
const followShape = (size, lead, given, layout) =>
	({ ...given, [OTHER_SIDE[lead]]: otherSideForPicture(size, lead, given[lead], layout) });

/**
 * How much a suggested size is held against for having more or fewer hexes
 * than a typical Realm, beside how much of the picture it loses: twice as many
 * or half as many weighs as much as losing 3.5% of the picture. Enough to keep
 * a size near a typical Realm's, but not to crop a long, thin map for it, as
 * whole rows of hexes would.
 */
const STRAY_WEIGHT = 0.05;

/**
 * How many hexes a map with no hexes on it is given to start with: about as
 * many as a typical Realm's (p14), in its shape. Of the sizes that fit its
 * shape, the one that loses least of the picture and strays least from a
 * typical Realm's count, weighed together (STRAY_WEIGHT).
 * @param {{width: number, height: number}|null|undefined} size The picture's own size.
 * @param {string} [layout] One of REALM_LAYOUTS.
 * @returns {{cols: number, rows: number}|null} Null for a picture of no known size.
 */
export function suggestedMapSize(size, layout = BOOK_LAYOUT) {
	if (!measured(size)) return null;
	const typical = BOOK_SETUP.cols * BOOK_SETUP.rows;
	const scored = sideCounts("cols").map((cols) => {
		const rows = otherSideForPicture(size, "cols", cols, layout);
		const lost = 1 - Math.exp(-shapeMiss(size, cols, rows, layout));
		return { cols, rows, score: lost + STRAY_WEIGHT * Math.abs(Math.log((cols * rows) / typical)) };
	});
	const best = scored.reduce((kept, next) => (next.score < kept.score ? next : kept));
	return { cols: best.cols, rows: best.rows };
}

/**
 * How many hexes go over a map with no hexes on it, as the GM sets them: the
 * side they set last is kept and the other follows the picture's shape, so the
 * hexes still cover it edge to edge. Until they set one, it's the suggestion.
 * @param {{width: number, height: number}|null|undefined} size The picture's own size.
 * @param {object} [given]
 * @param {unknown} [given.cols]
 * @param {unknown} [given.rows]
 * @param {"cols"|"rows"|null} [given.lead] The side the GM set last.
 * @param {string} [layout] One of REALM_LAYOUTS.
 * @returns {{cols: number, rows: number}} Within OWN_SIZE_LIMITS; as given for a picture of no known size.
 */
export function bareMapSize(size, { cols, rows, lead = null } = {}, layout = BOOK_LAYOUT) {
	const given = withinOwnSize(cols, rows, lead ?? "cols");
	if (!measured(size)) return given;
	return lead === "cols" || lead === "rows" ? followShape(size, lead, given, layout) : suggestedMapSize(size, layout);
}

/**
 * How many hexes a map with hexes drawn on it is given, as the GM counts them:
 * a side they've set is kept, and until they set the other it follows the
 * picture's shape. Until they set either, it's the book's 12 by 12 (p14), or
 * the suggestion for a map far from that shape (unusualMapShape).
 * @param {{width: number, height: number}|null|undefined} size The picture's own size.
 * @param {object} [given]
 * @param {unknown} [given.cols]
 * @param {unknown} [given.rows]
 * @param {("cols"|"rows")[]} [given.typed] The sides the GM has set, the last set last.
 * @param {string} [layout] One of REALM_LAYOUTS.
 * @returns {{cols: number, rows: number}} Within OWN_SIZE_LIMITS; as given for a picture of no known size.
 */
export function drawnMapSize(size, { cols, rows, typed = [] } = {}, layout = BOOK_LAYOUT) {
	const given = withinOwnSize(cols, rows, typed.at(-1) ?? "cols");
	const [setCols, setRows] = [typed.includes("cols"), typed.includes("rows")];
	if (!measured(size) || (setCols && setRows)) return given;
	if (setCols || setRows) return followShape(size, setCols ? "cols" : "rows", given, layout);
	return unusualMapShape(size, layout) ? suggestedMapSize(size, layout) : { cols: BOOK_SETUP.cols, rows: BOOK_SETUP.rows };
}

/** The last picture's sizes, kept: the Map size page asks for them at every keystroke, both ways. */
let shapedSizesKept = null;

/**
 * Every size whose one side follows the picture's shape from the other, the
 * sizes steppedMapSize steps between.
 * @param {{width: number, height: number}} size The picture's own size, measured.
 * @param {string} layout One of REALM_LAYOUTS.
 * @returns {{cols: number, rows: number, lead: "cols"|"rows", hexes: number, miss: number}[]}
 */
function shapedSizes(size, layout) {
	const kept = shapedSizesKept;
	if (kept && kept.width === size.width && kept.height === size.height && kept.layout === layout) return kept.sizes;
	const sizes = ["cols", "rows"].flatMap((lead) => {
		const other = OTHER_SIDE[lead];
		return sideCounts(lead).flatMap((count) => {
			const follows = otherSideForPicture(size, lead, count, layout);
			const pair = { [lead]: count, [other]: follows, lead };
			// Held to the hexes in all, rather than the shape: no step to it.
			if (follows !== closest(sideCounts(other), sideMiss(size, lead, count, layout))) return [];
			return [{ ...pair, hexes: count * follows, miss: shapeMiss(size, pair.cols, pair.rows, layout) }];
		});
	});
	shapedSizesKept = { width: size.width, height: size.height, layout, sizes };
	return sizes;
}

/**
 * The next size up or down that keeps a picture's shape, so the GM can have
 * more hexes or fewer without setting both sides by hand: of every size whose
 * one side follows the picture's shape from the other (otherSideForPicture),
 * the one nearest in hexes past the size now, the closer to the shape where two
 * have as many. A side the hexes in all (OWN_SIZE_LIMITS) cut short of the
 * shape isn't stepped to, nor is one past a side's own limit.
 * @param {{width: number, height: number}|null|undefined} size The picture's own size.
 * @param {{cols: unknown, rows: unknown}} now The size the map has now.
 * @param {1|-1} step More hexes, or fewer.
 * @param {string} [layout] One of REALM_LAYOUTS.
 * @returns {{cols: number, rows: number, lead: "cols"|"rows"}|null} With the side the other follows;
 *   null for a picture of no known size, or with no size further that way.
 */
export function steppedMapSize(size, now, step, layout = BOOK_LAYOUT) {
	if (!measured(size)) return null;
	const { cols, rows } = withinOwnSize(now?.cols, now?.rows);
	const hexes = cols * rows;
	const ahead = shapedSizes(size, layout).filter((next) => Math.sign(next.hexes - hexes) === Math.sign(step));
	if (!ahead.length) return null;
	const best = ahead.reduce((kept, next) => {
		const [far, near] = [Math.abs(next.hexes - hexes), Math.abs(kept.hexes - hexes)];
		return far < near || (far === near && next.miss < kept.miss) ? next : kept;
	});
	return { cols: best.cols, rows: best.rows, lead: best.lead };
}

/** Kept to the tenth of a pixel, which is finer than a preview is drawn. */
const tenth = (value) => Math.round(value * 10) / 10;

/**
 * The Realm's hexes laid over a map edge to edge, drawn in the picture's own
 * pixels, for a preview: an SVG with this viewBox, stretched over the picture,
 * lies exactly on it. The picture is laid as coveredMapRect lays it, which is
 * where a map with no hexes on it starts; over a map with hexes on it, they
 * show how many the GM has counted, before the two are lined up.
 * @param {{width: number, height: number}|null|undefined} size The picture's own size.
 * @param {object} [options]
 * @param {number} [options.cols]
 * @param {number} [options.rows]
 * @param {string} [options.layout] One of REALM_LAYOUTS.
 * @returns {{viewBox: string, hexes: string, outside: string}|null} SVG path data: every hex, and the
 *   picture outside the map, filled evenodd, or "" when none of it is. Null for a picture of no known size.
 */
export function hexOverlay(size, { cols, rows, layout = BOOK_LAYOUT } = {}) {
	if (!measured(size)) return null;
	const [width, height] = [Number(size.width), Number(size.height)];
	const g = realmGeometry({ ...withinOwnSize(cols, rows), layout });
	// How many of the map's pixels one of the picture's is, and where the map's own edges fall on the picture.
	const scale = Math.max(g.width / width, g.height / height);
	const [across, down] = [g.width / scale, g.height / scale];
	const [left, top] = [(width - across) / 2, (height - down) / 2];
	const at = ({ x, y }) => `${tenth(left + x / scale)} ${tenth(top + y / scale)}`;
	const hexes = allHexes(g).map((hex) => {
		const [first, ...rest] = hexVertices(g, hex);
		return `M${at(first)}${rest.map((corner) => `L${at(corner)}`).join("")}Z`;
	}).join("");
	const outside = left >= 0.5 || top >= 0.5
		? `M0 0H${width}V${height}H0Z M${tenth(left)} ${tenth(top)}h${tenth(across)}v${tenth(down)}h${tenth(-across)}Z`
		: "";
	return { viewBox: `0 0 ${width} ${height}`, hexes, outside };
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
 * What a GM can say of the map they import: the layouts its hexes may be drawn
 * in, then that it has none (BARE_MAP), pictured as a map's corner with nothing on it.
 * @param {string} [current] The layout chosen now.
 * @param {object} [options]
 * @param {boolean} [options.bare] Whether the map has no hexes on it now.
 * @returns {{key: string, checked: boolean, book: boolean, bare: boolean, diagram: ReturnType<typeof layoutDiagram>}[]}
 */
export function pictureChoices(current = BOOK_LAYOUT, { bare = false } = {}) {
	const { viewBox, edge } = layoutDiagram(BOOK_LAYOUT);
	return [
		...layoutChoices(current).map((choice) => ({ ...choice, checked: choice.checked && !bare, bare: false })),
		{ key: BARE_MAP, checked: bare, book: false, bare: true, diagram: { viewBox, edge, hexes: [] } }
	];
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
