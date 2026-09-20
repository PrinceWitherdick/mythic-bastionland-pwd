/**
 * How each Realm skin draws each picture in a colour set, as the SVG files
 * scripts/realm-placeholders.js ships under assets/realm. Only that script and
 * the tests draw, so none of this, nor the Blank Realm's traced art, is loaded
 * in Foundry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrast, mix } from "../../module/rules/colour.js";
import { chargeNotice, recolourCharge } from "../../module/rules/heraldry-charges.js";
import { HOLDING_STYLES, LANDMARK_TYPES, MYTH_COUNT, RIVER_SHAPES, TERRAIN } from "../../module/rules/realm.js";
import { PICTURE_NAME, realmPalette, skinPictures } from "../../module/rules/realm-skins.js";
import { SHORE_SHAPES } from "../../module/rules/realm-rivers.js";
import { escapeHTML } from "../../module/rules/text.js";
import { curvePath, drawInk, inkNumeral, inkRing } from "./realm-ink.js";

/** Hex pictures are drawn at three times the size a hex is shown at, so they stay crisp when zoomed. */
const SCALE = 3;
const HEX_H = 160 * SCALE;
const HEX_W = (2 * HEX_H) / Math.sqrt(3);
/** Badges, such as Holdings and Myths, are square. */
const BADGE = 300;
const f = (value) => Number(value.toFixed(2));

const svg = (width, height, body) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="${f(width)}" height="${f(height)}" viewBox="0 0 ${f(width)} ${f(height)}">${body}</svg>\n`;

/** @returns {string} The points of the hex, shrunk about its centre by `scale`. */
const hexPoints = (scale = 1) => [[HEX_W, HEX_H / 2], [0.75 * HEX_W, HEX_H], [0.25 * HEX_W, HEX_H], [0, HEX_H / 2], [0.25 * HEX_W, 0], [0.75 * HEX_W, 0]]
	.map(([x, y]) => `${f(HEX_W / 2 + (x - HEX_W / 2) * scale)},${f(HEX_H / 2 + (y - HEX_H / 2) * scale)}`).join(" ");

/** @returns {string} Whichever of the paper and ink stands out more on `fill`. */
const onColour = (fill, p) => (contrast(fill, p.paper) >= contrast(fill, p.ink) ? p.paper : p.ink);

const FONT = "Georgia, serif";
/** Georgia's numerals rise and fall about the line, so a Myth's number sits off-centre in it. */
const NUMERAL_FONT = "'Times New Roman', Times, serif";

/**
 * A few ink marks for each terrain, drawn in a 100 by 100 box. A drawing given as several paths is
 * layered from the back forward, each filled with the hex's own colour, so the trees of a wood stand
 * in front of one another instead of showing through.
 */
const TERRAIN_MARKS = {
	marsh: "M15 45h22M45 40h20M25 62h25M58 60h24M20 45v-10M52 40v-12M34 62v-9M70 60v-11",
	heath: "M18 40l6 8 6-8M44 34l6 8 6-8M66 44l6 8 6-8M28 62l6 8 6-8M54 64l6 8 6-8",
	crag: "M15 70l12-26 10 10 12-24 14 20 8-8 14 28z",
	peaks: "M10 72l24-44 24 44M40 72l24-40 26 40M28 50l6-6 6 8",
	forest: [
		"M19 49q-2 -10 8 -14q4 -10 14 -1q13 -4 11 10q6 8 2 14z",
		"M51 47q-2 -10 8 -14q4 -10 14 -1q13 -4 11 10q6 8 2 14z",
		"M22 71v-12M8 59q-2 -10 8 -14q4 -9 13 -1q12 -4 10 10q6 8 1 14z",
		"M78 71v-12M64 59q-2 -10 8 -14q4 -9 13 -1q12 -4 10 10q6 8 1 14z",
		"M50 73v-13M34 60q-2 -11 9 -16q5 -10 14 -1q14 -4 12 11q6 9 2 16z"
	],
	valley: "M12 30c20 10 26 30 30 44M88 30c-20 10-26 30-30 44M40 74h20",
	hills: "M10 64c14-24 34-24 46 0M46 64c12-18 30-18 44 0",
	meadow: "M20 70l-4-16M24 70l0-18M28 70l4-16M48 66l-4-16M52 66l0-18M56 66l4-16M74 72l-4-16M78 72l0-18M82 72l4-16",
	bog: "M16 44h16M40 44h14M62 44h20M24 62h18M50 62h16M72 62h12M30 52h0.1M58 53h0.1M44 72h0.1",
	lake: "M14 40c8-6 16 6 24 0s16 6 24 0 16 6 24 0M14 56c8-6 16 6 24 0s16 6 24 0 16 6 24 0M24 72c8-6 16 6 24 0s16 6 24 0",
	glade: [
		"M24 61v-12M10 49q-2 -10 8 -14q4 -9 13 -1q12 -4 10 10q6 8 1 14z",
		"M76 61v-12M62 49q-2 -10 8 -14q4 -9 13 -1q12 -4 10 10q6 8 1 14z",
		"M34 69h32"
	],
	plains: "M30 44h0.1M62 40h0.1M46 60h0.1M72 64h0.1M28 70h0.1"
};

const LANDMARK_LETTERS = { dwelling: "D", sanctum: "S", monument: "M", hazard: "H", curse: "C", ruin: "R" };

/** A drawn sign for each Landmark, in a 100 by 100 box, for the skins that don't letter them. */
const LANDMARK_MARKS = {
	dwelling: "M22 80V46L50 22l28 24v34zM42 80V60h16v20",
	sanctum: "M14 50c20-26 52-26 72 0-20 26-52 26-72 0zM41 50a9 9 0 1 0 18 0a9 9 0 1 0-18 0",
	monument: "M40 84l4-56 6-10 6 10 4 56zM30 84h40",
	hazard: "M50 16L88 82H12zM50 40v20M50 70v2",
	curse: "M62 18a32 32 0 1 0 0 64a26 26 0 1 1 0-64zM72 30l4 8 8 2-8 3-4 8-3-8-8-3 8-2z",
	ruin: "M22 84V40h14v44M46 84V56l8-6 6 4v30M70 84V48h10v36M16 84h70"
};

/**
 * Icons from game-icons.net, in a 512 by 512 box, shared under CC BY 3.0: the
 * town, castle, tower and fortress Holdings.
 */
const GAME_ICONS = Object.freeze({
	castle: {
		credit: "Castle icon by Delapouite (https://delapouite.com), from game-icons.net, CC BY 3.0.",
		d: "m255.95 27.11-75.35 80.504 150.7 1.168-75.35-81.674h-.003zM25 109.895v68.01l19.412 25.99h71.06l19.528-26v-68h-14v15.995h-18v-15.994H89v15.995H71v-15.994H57v15.995H39v-15.994H25zm352 0v68l19.527 26h71.06L487 177.906v-68.01h-14v15.995h-18v-15.994h-14v15.995h-18v-15.994h-14v15.995h-18v-15.994h-14zm-176 15.877V260.89h110V126.63l-110-.857zm55 20.118c8 0 16 4 16 12v32h-32v-32c0-8 8-12 16-12zM41 221.897V484.89h78V221.897H41zm352 0V484.89h78V221.897h-78zM56 241.89c4 0 8 4 8 12v32H48v-32c0-8 4-12 8-12zm400 0c4 0 8 4 8 12v32h-16v-32c0-8 4-12 8-12zm-303 37v23h-16v183h87v-55c0-24 16-36 32-36s32 12 32 36v55h87v-183h-16v-23h-14v23h-18v-23h-14v23h-18v-23h-14v23h-18v-23h-14v23h-18v-23h-14v23h-18v-23h-14v23h-18v-23h-14zm-49 43c4 0 8 4 8 12v32H96v-32c0-8 4-12 8-12zm72 0c8 0 16 4 16 12v32h-32v-32c0-8 8-12 16-12zm80 0c8 0 16 4 16 12v32h-32v-32c0-8 8-12 16-12zm80 0c8 0 16 4 16 12v32h-32v-32c0-8 8-12 16-12zm72 0c4 0 8 4 8 12v32h-16v-32c0-8 4-12 8-12zm-352 64c4 0 8 4 8 12v32H48v-32c0-8 4-12 8-12zm400 0c4 0 8 4 8 12v32h-16v-32c0-8 4-12 8-12z"
	},
	tower: {
		credit: "White Tower icon by Lorc (https://lorcblog.blogspot.com), from game-icons.net, CC BY 3.0.",
		d: "M97.812 23.375v92.875l46.22 51.72V351h-25.845L94.594 491.906H414.53L390.938 351h-25.875V167.97l46.22-51.72V23.375h-53.938v43.97H324.5v-43.97h-53.938v43.97h-32.437v-43.97h-53.938v43.97H151.75v-43.97H97.812zm73.75 152.875h18.688v50.22h-18.688v-50.22zm73.594 0h18.688v50.22h-18.688v-50.22zm74.156 0H338v50.22h-18.688v-50.22z"
	},
	village: {
		credit: "Village icon by Delapouite (https://delapouite.com), from game-icons.net, CC BY 3.0.",
		d: "m109.902 35.87-71.14 59.284h142.28l-71.14-59.285zm288 32-71.14 59.284h142.28l-71.14-59.285zM228.73 84.403l-108.9 90.75h217.8l-108.9-90.75zm-173.828 28.75v62h36.81l73.19-60.992v-1.008h-110zm23 14h16v18h-16v-18zm265 18v10.963l23 19.166v-16.13h16v18h-13.756l.104.087 19.098 15.914h-44.446v14h78v-39h18v39h14v-62h-110zm-194.345 48v20.08l24.095-20.08h-24.095zm28.158 0 105.1 87.582 27.087-22.574v-65.008H176.715zm74.683 14h35.735v34h-35.735v-34zm-76.714 7.74L30.37 335.153H319l-144.314-120.26zm198.046 13.51-76.857 64.047 32.043 26.704H481.63l-108.9-90.75zm-23.214 108.75.103.086 19.095 15.914h-72.248v77.467h60.435v-63.466h50v63.467h46v-93.466H349.516zm-278.614 16V476.13h126v-76.976h50v76.977h31.565V353.155H70.902zm30 30h50v50h-50v-50z"
	},
	rempart: {
		credit: "Rempart icon by Delapouite (https://delapouite.com), from game-icons.net, CC BY 3.0.",
		d: "M18 27v467h476V304h-46v64h-80v-64h-64v64h-80v-64h-64v64H80V192h48L18 27zm97 373h18v64h-18v-64zm144 0h18v64h-18v-64zm144 0h18v64h-18v-64z"
	}
});

/** The Seat of Power's crown is gold in every colour set, outlined in whatever its badge contrasts with. */
const CROWN_GOLD = "#c9a227";

/** Gold stands out from anything when it is rimmed in whichever of the paper and ink stands out from gold. */
const goldRim = (p) => onColour(CROWN_GOLD, p);

/**
 * @returns {string} The Seat's gold ring about the badge's middle, rimmed as the crown is and left open,
 *   so the Holding it is pinned above shows through it.
 */
const goldRing = (radius, width, rim) =>
	`<circle cx="150" cy="150" r="${f(radius)}" fill="none" stroke="${rim}" stroke-width="${f(width + 5)}"/>`
	+ `<circle cx="150" cy="150" r="${f(radius)}" fill="none" stroke="${CROWN_GOLD}" stroke-width="${f(width)}"/>`;

/** A heater shield filling a badge. */
const SHIELD = "M46 26h208v112c0 84-58 126-104 146C104 264 46 222 46 138z";

/** Midpoint of a hex's edge in direction k, and the unit vector pointing inwards from it. */
function edgeMidpoint(k) {
	const angle = ((60 * k + 30) * Math.PI) / 180;
	const apothem = HEX_H / 2;
	return { x: HEX_W / 2 + apothem * Math.cos(angle), y: HEX_H / 2 + apothem * Math.sin(angle), inX: -Math.cos(angle), inY: -Math.sin(angle) };
}

/** The edge each river piece leaves by, drawn from the south edge (direction 1). A spring ends in the hex. */
const RIVER_ENDS = { straight: 4, bend: 3, sharp: 2, end: null };

/**
 * A fork is drawn as two courses from the south edge, splitting as they go, by
 * the edge each leaves by: a straight course and a bend, two bends, or a bend
 * and a sharp one. Each is the course a piece leaving by that edge runs, so a
 * fork meets its neighbours just as they do.
 */
const FORK_COURSES = Object.freeze({ "fork-left": [4, 3], "fork-right": [4, 5], "fork-wide": [3, 5], fan: [3, 2] });

/** A river path from the south edge (direction 1) to the edge in `to`, meeting each edge square on. */
function riverPath(to) {
	const start = edgeMidpoint(1);
	const reach = HEX_H * 0.28;
	if (to === null) {
		const centre = { x: HEX_W / 2, y: HEX_H / 2 };
		return `M${f(start.x)} ${f(start.y)}C${f(start.x)} ${f(start.y - reach)} ${f(centre.x)} ${f(centre.y + reach / 2)} ${f(centre.x)} ${f(centre.y)}`;
	}
	const end = edgeMidpoint(to);
	return `M${f(start.x)} ${f(start.y)}C${f(start.x + start.inX * reach)} ${f(start.y + start.inY * reach)} `
		+ `${f(end.x + end.inX * reach)} ${f(end.y + end.inY * reach)} ${f(end.x)} ${f(end.y)}`;
}

/** @returns {string} A mark from a 100 by 100 box, drawn `size` wide with its middle at (x, y). */
const mark = (d, { x, y, size, stroke, width, fill = "none" }) =>
	`<g transform="translate(${f(x - size / 2)} ${f(y - size / 2)}) scale(${f(size / 100)})">`
	+ [d].flat().map((path) => `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${f(width)}" stroke-linecap="round" stroke-linejoin="round"/>`).join("")
	+ "</g>";

/**
 * @returns {string} A game-icons.net icon, credited, drawn `size` wide with its middle at (x, y). A `halo`
 *   of `width` rings it, behind the icon so its holes stay open.
 */
function gameIcon(name, { x, y, size, fill, halo, width = 8 }) {
	const { credit, d } = GAME_ICONS[name];
	const scale = size / 512;
	const outline = halo ? ` stroke="${halo}" stroke-width="${f((2 * width) / scale)}" stroke-linejoin="round" paint-order="stroke"` : "";
	return `<desc>${credit}</desc><g transform="translate(${f(x - size / 2)} ${f(y - size / 2)}) scale(${f(scale)})"><path d="${d}" fill="${fill}"${outline}/></g>`;
}

/** The game-icons.net icon each Holding is drawn with. */
const HOLDING_ICONS = { town: "village", castle: "castle", tower: "tower", fortress: "rempart" };

/** An icon fills its box where a drawn mark leaves a margin, so Holdings' icons are drawn smaller to sit beside the marks. */
const HOLDING_ICON_SHARE = 0.8;

/** @returns {string} A Holding's icon, `size` wide before the share, with its middle at (x, y), filled as `icon` says. */
const holdingMark = (style, { x, y, size }, icon) => gameIcon(HOLDING_ICONS[style], { x, y, size: size * HOLDING_ICON_SHARE, ...icon });

/** @returns {string} A terrain's drawing, in the hex's own `paper` so a layered one hides what's behind. */
const terrainMark = (key, stroke, width, paper, share = 0.62) => mark(TERRAIN_MARKS[key],
	{ x: HEX_W / 2, y: HEX_H / 2, size: HEX_H * share, stroke, width, fill: Array.isArray(TERRAIN_MARKS[key]) ? paper : "none" });

const text = (content, { x, y, size, fill, weight = "normal", style = "normal", font = FONT }) =>
	`<text x="${f(x)}" y="${f(y)}" font-family="${font}" font-size="${f(size)}" font-weight="${weight}" font-style="${style}" fill="${fill}" text-anchor="middle">${content}</text>`;

/** @returns {string} A wax seal's scalloped rim about the badge's middle. */
function scallops(radius, bumps = 18) {
	const point = (angle, r) => [f(BADGE / 2 + r * Math.cos(angle)), f(BADGE / 2 + r * Math.sin(angle))];
	const step = (2 * Math.PI) / bumps;
	let d = `M${point(0, radius).join(" ")}`;
	for (let index = 0; index < bumps; index++) {
		const control = point(step * (index + 0.5), radius * 1.12);
		const end = point(step * (index + 1), radius);
		d += `Q${control.join(" ")} ${end.join(" ")}`;
	}
	return `${d}z`;
}

/** @returns {string} Points of a burst of `rays` about the badge's middle. */
function burst(outer, inner, rays = 8) {
	return Array.from({ length: rays * 2 }, (_, index) => {
		const r = index % 2 ? inner : outer;
		const angle = (Math.PI * index) / rays - Math.PI / 2;
		return `${f(BADGE / 2 + r * Math.cos(angle))},${f(BADGE / 2 + r * Math.sin(angle))}`;
	}).join(" ");
}

/**
 * A river drawn as banks of `edge` either side of `water`, with an optional line down the middle. A fork's
 * courses are each drawn in the one path, all their banks before any water, so the water runs together.
 */
function river(shape, { bank, water, edge, width, middle }) {
	const d = FORK_COURSES[shape] ? FORK_COURSES[shape].map(riverPath).join("") : riverPath(RIVER_ENDS[shape]);
	const pool = shape === "end" ? `<circle cx="${f(HEX_W / 2)}" cy="${f(HEX_H / 2)}" r="${f(HEX_H * 0.07)}" fill="${water}" stroke="${bank}" stroke-width="${f(edge)}"/>` : "";
	const banks = bank ? `<path d="${d}" fill="none" stroke="${bank}" stroke-width="${f(width + 2 * edge)}" stroke-linecap="butt"/>` : "";
	const line = middle ? `<path d="${d}" fill="none" stroke="${middle.stroke}" stroke-width="${f(middle.width)}" stroke-dasharray="${middle.dash ?? "none"}" stroke-linecap="butt"/>` : "";
	return svg(HEX_W, HEX_H, `${banks}<path d="${d}" fill="none" stroke="${water}" stroke-width="${f(width)}" stroke-linecap="butt"/>${line}${pool}`);
}

/* -------------------------------------------- */
/*  The Blank Realm's own art                   */
/* -------------------------------------------- */

/** The legend of the Blank Realm sheet, traced by scripts/realm-sheet-art.py. */
const SHEET_ART = JSON.parse(readFileSync(join(import.meta.dirname, "..", "data", "realm-sheet-art.json"), "utf8"));

const SHEET_CREDIT = `<desc>${SHEET_ART.$source}</desc>`;

/**
 * On the sheet each terrain's picture is a little larger than its hex, and
 * centred on it: this much of the hex's height for each of the picture's
 * pixels. The sheet's hexes are a touch wider than true ones, so this is
 * measured across the hex's height.
 */
const SHEET_TERRAIN_SCALE = (HEX_H / 158) * 0.97;

/**
 * A traced picture from the sheet, hung inside a box by its middle, which the
 * tracer measures from the picture itself: a Holding stands in the middle of
 * its hex with its shadow falling to one side of it, rather than sitting to
 * one side so that the shadow can have half the hex. The picture is fitted so
 * that all of it, shadow and all, still lies inside the box.
 * @param {string} name A picture's name, such as "holding-castle".
 * @param {{x: number, y: number, width: number, height: number, scale?: number, ink: string, paper: string}} place
 *   The box's middle and size; `scale` sets the size outright instead.
 * @returns {string}
 */
function sheetArt(name, { x, y, width, height, scale, ink, paper }) {
	const art = SHEET_ART[name];
	// Terrain is traced without a middle of its own, so it hangs by the middle of its box.
	const middle = art.middle ?? [art.width / 2, art.height / 2];
	const reach = [Math.max(middle[0], art.width - middle[0]), Math.max(middle[1], art.height - middle[1])];
	const size = scale ?? Math.min(width / (2 * reach[0]), height / (2 * reach[1]));
	const body = (art.paper ? `<path d="${art.paper}" fill="${paper}"/>` : "") + `<path d="${art.ink}" fill="${ink}"/>`;
	return `<g transform="translate(${f(x - middle[0] * size)} ${f(y - middle[1] * size)}) scale(${f(size)})">${body}</g>`;
}

/** @returns {string} A drawing from realm-ink.js, drawn `size` wide with its middle at (x, y). */
const inkMark = (parts, { x, y, size, ink, paper }) =>
	`<g transform="translate(${f(x - size / 2)} ${f(y - size / 2)}) scale(${f(size / 100)})">${drawInk(parts, { ink, paper })}</g>`;

/**
 * The Realm Sheets' rivers, across a hex 480 high: the water's width, a bank's
 * weight where it meets a hex's edge, the weights it swells to on the outside
 * of a bend and thins to on the inside, the radius of bend at which it does so
 * fully, and how far a hand lets the banks waver.
 */
const INKED_RIVER = Object.freeze({ water: 58, bank: 17, heavy: 36, light: 9, bend: 160, waver: 3.5 });

const cubicAt = ([p0, p1, p2, p3], t) => {
	const u = 1 - t;
	const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
	return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
};

/**
 * Where a river piece runs, as cubic Béziers from the middle of the south
 * edge. It meets each edge square on, so pieces join whichever way they're laid.
 * @param {string} shape One of RIVER_SHAPES.
 * @returns {{x: number, y: number}[][]}
 */
function riverCourse(shape) {
	const start = edgeMidpoint(1);
	const inward = (edge, reach) => ({ x: edge.x + edge.inX * reach, y: edge.y + edge.inY * reach });
	const middle = { x: HEX_W / 2, y: HEX_H / 2 };
	switch (shape) {
		case "straight": {
			// A straight run still meanders, as the sheet's rivers do: out one way, then back.
			const end = edgeMidpoint(4);
			const lean = { x: Math.sin(0.42), y: -Math.cos(0.42) };
			const reach = HEX_H * 0.24;
			return [
				[start, inward(start, HEX_H * 0.24), { x: middle.x - lean.x * reach, y: middle.y - lean.y * reach }, middle],
				[middle, { x: middle.x + lean.x * reach, y: middle.y + lean.y * reach }, inward(end, HEX_H * 0.24), end]
			];
		}
		case "end": {
			const spring = { x: middle.x, y: middle.y + HEX_H * 0.04 };
			return [[start, inward(start, HEX_H * 0.2), { x: spring.x, y: spring.y + HEX_H * 0.12 }, spring]];
		}
		default: {
			const end = edgeMidpoint(RIVER_ENDS[shape]);
			const reach = shape === "sharp" ? HEX_H * 0.44 : HEX_H * 0.3;
			return [[start, inward(start, reach), inward(end, reach), end]];
		}
	}
}

/**
 * The course a piece leaving by `edge` runs, bending either way.
 * @param {number} edge A direction other than the south.
 * @returns {{x: number, y: number}[][]}
 */
function courseTo(edge) {
	if (edge === RIVER_ENDS.straight) return riverCourse("straight");
	const start = edgeMidpoint(1);
	const end = edgeMidpoint(edge);
	const reach = edge === 0 || edge === 2 ? HEX_H * 0.44 : HEX_H * 0.3;
	return [[start, { x: start.x + start.inX * reach, y: start.y + start.inY * reach }, { x: end.x + end.inX * reach, y: end.y + end.inY * reach }, end]];
}

/** @returns {{x: number, y: number}[][][]} Each course a river piece runs, as cubic Béziers from the south edge. */
const pieceCourses = (shape) => (FORK_COURSES[shape] ?? [RIVER_ENDS[shape]]).map((edge) => (edge === null || edge === undefined ? riverCourse(shape) : courseTo(edge)));

/**
 * Points with the direction the line runs through each, in the order they come.
 * @param {{x: number, y: number}[]} points
 * @returns {{x: number, y: number, dx: number, dy: number}[]}
 */
function directed(points) {
	const last = points.length - 1;
	return points.map((point, index) => {
		const [a, b] = [points[Math.max(0, index - 1)], points[Math.min(last, index + 1)]];
		const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
		return { x: point.x, y: point.y, dx: (b.x - a.x) / length, dy: (b.y - a.y) / length };
	});
}

/**
 * Points evenly spaced along a line, each with its direction.
 * @param {{x: number, y: number}[]} points A densely drawn line.
 * @param {number} count Spaces between the points.
 * @returns {{x: number, y: number, dx: number, dy: number}[]}
 */
function evenly(points, count) {
	const lengths = [0];
	for (let index = 1; index < points.length; index++) {
		lengths.push(lengths[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y));
	}
	const total = lengths.at(-1);
	let segment = 1;
	return directed(Array.from({ length: count + 1 }, (_, index) => {
		const along = (total * index) / count;
		while (segment < points.length - 1 && lengths[segment] < along) segment++;
		const [a, b] = [points[segment - 1], points[segment]];
		const t = Math.min(1, Math.max(0, (along - lengths[segment - 1]) / (lengths[segment] - lengths[segment - 1] || 1)));
		return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
	}));
}

/**
 * A number from 0 to 1 for a shape, steady from one run to the next, to vary
 * how each river piece wavers.
 */
const phaseOf = (shape, salt) => ([...shape].reduce((sum, character) => sum + character.charCodeAt(0) * (salt + 3), 0) % 97) / 97;

/**
 * One inked bank: the line along the water's edge, running with the water on
 * its right, is thickened outwards. It swells where it rounds the outside of a
 * bend and thins on the inside, but meets the hex's edges at its usual weight,
 * so neighbouring pieces join.
 * @param {{x: number, y: number, dx: number, dy: number}[]} edge
 * @param {number} phase
 * @returns {string} A closed path.
 */
function bank(edge, phase) {
	const { bank: usual, heavy, light, bend } = INKED_RIVER;
	const last = edge.length - 1;
	const outer = edge.map((point, index) => {
		const s = index / last;
		const [before, after] = [edge[Math.max(0, index - 1)], edge[Math.min(last, index + 1)]];
		const step = Math.hypot(after.x - before.x, after.y - before.y) || 1;
		// Turning toward the water, this bank is on the outside of the bend.
		const turning = ((before.dx * after.dy - before.dy * after.dx) / step) * bend;
		const swell = Math.sin(Math.PI * s);
		const weight = (usual + swell * (Math.min(1, Math.max(0, turning)) * (heavy - usual) - Math.min(1, Math.max(0, -turning)) * (usual - light)))
			* (1 + swell * 0.18 * Math.sin(2 * Math.PI * (1.7 * s + phase)));
		return { x: point.x + point.dy * weight, y: point.y - point.dx * weight };
	});
	const corner = (point) => ({ ...point, sharp: true });
	return curvePath([corner(edge[0]), ...edge.slice(1, last), corner(edge[last]), corner(outer[last]), ...outer.slice(1, last).reverse(), corner(outer[0])], true);
}

const upstream = (points) => [...points].reverse().map((point) => ({ ...point, dx: -point.dx, dy: -point.dy }));
const ends = (points) => points.map((point, index) => (index === 0 || index === points.length - 1 ? { ...point, sharp: true } : point));

/** @returns {{x: number, y: number}[]} Points close together along cubic Béziers. */
const densely = (segments) => segments.flatMap((segment, index) => Array.from({ length: 81 }, (_, step) => cubicAt(segment, step / 80)).slice(index ? 1 : 0));

/**
 * One run of river as the Realm Sheets ink it, along cubic Béziers: its
 * course, each side of its water, the water, and the two banks.
 * @param {{x: number, y: number}[][]} segments
 * @param {string} shape The piece it's part of, whose name sets how its banks waver.
 * @returns {{course: object[], left: object[], right: object[], water: string, banks: string}}
 */
function inkedRun(segments, shape, { waver = INKED_RIVER.waver } = {}) {
	const { water } = INKED_RIVER;
	const course = evenly(densely(segments), 48);
	const last = course.length - 1;
	// Where the course crosses a hex's edge it runs square to it, so the banks meet the edge square on too.
	const heading = (from, to) => {
		const length = Math.hypot(to.x - from.x, to.y - from.y);
		return { dx: (to.x - from.x) / length, dy: (to.y - from.y) / length };
	};
	Object.assign(course[0], heading(segments[0][0], segments[0][1]));
	Object.assign(course[last], heading(segments.at(-1)[2], segments.at(-1)[3]));
	const phase = phaseOf(shape, 1);

	// Each side of the water, wavering a little between the hex's edges, running with the course. Looking downstream, `side(-1)` is on the left.
	const side = (sign) => course.map((point, index) => {
		const s = index / last;
		const reach = water / 2 + Math.sin(Math.PI * s) * waver * Math.sin(2 * Math.PI * (1.3 * s + phase + (sign > 0 ? 0 : 0.37)));
		return { x: point.x - sign * point.dy * reach, y: point.y + sign * point.dx * reach, dx: point.dx, dy: point.dy };
	});
	const left = side(-1);
	const right = side(1);
	return {
		course,
		left,
		right,
		water: curvePath([...ends(left), ...ends(right).reverse()], true),
		banks: `${bank(left, phase)}${bank(upstream(right), phaseOf(shape, 2))}`
	};
}

/**
 * A river piece as the Realm Sheets draw their rivers: white water between two
 * hand-inked banks, the one on the outside of each bend drawn heavier. A fork
 * draws every bank before any water, so its courses' water runs together.
 * @param {string} shape One of RIVER_SHAPES.
 * @param {object} p A colour set.
 * @returns {string} The piece's paths.
 */
function inkedRiverBody(shape, p) {
	if (FORK_COURSES[shape]) {
		const runs = pieceCourses(shape).map((segments) => inkedRun(segments, shape));
		return `<path d="${runs.map((run) => run.banks).join("")}" fill="${p.ink}"/><path d="${runs.map((run) => run.water).join("")}" fill="${p.water}"/>`;
	}
	const { course, left, right, water, banks } = inkedRun(riverCourse(shape), shape);
	if (shape !== "end") return `<path d="${water}" fill="${p.water}"/><path d="${banks}" fill="${p.ink}"/>`;

	// The banks meet around the spring, in one line running with the water on its right.
	const last = course.length - 1;
	const tip = course[last];
	const start = Math.atan2(left[last].y - tip.y, left[last].x - tip.x);
	const cap = Array.from({ length: 9 }, (_, index) => {
		const angle = start + (Math.PI * (index + 1)) / 10;
		return { x: tip.x + (Math.cos(angle) * INKED_RIVER.water) / 2, y: tip.y + (Math.sin(angle) * INKED_RIVER.water) / 2 };
	});
	const around = evenly([...left, ...cap, ...upstream(right)], 72);
	Object.assign(around[0], { dx: course[0].dx, dy: course[0].dy });
	Object.assign(around.at(-1), { dx: -course[0].dx, dy: -course[0].dy });
	return `<path d="${curvePath(ends(around), true)}" fill="${p.water}"/><path d="${bank(around, phaseOf(shape, 1))}" fill="${p.ink}"/>`;
}

/** @returns {string} A river piece as the Realm Sheets draw it. */
const inkedRiver = (shape, p) => svg(HEX_W, HEX_H, inkedRiverBody(shape, p));

/* -------------------------------------------- */
/*  Lakes on the Blank Realm                   */
/* -------------------------------------------- */

/**
 * A lake's shore where lakes are joined, across a hex 480 high: how far in
 * from its hex's edge the shore runs, how far along the next edge it crosses
 * into the lake beside, how heavy its ink is and how far that swells, and how
 * jagged a hand draws it, less where a river may run in.
 */
const LAKE_SHORE = Object.freeze({ inset: 66, crossing: 60, weight: 18, swell: 8, jag: 9, calm: 2 });

/** A number from 0 to 1 for a whole number and a salt, the same on every machine. */
function noise(index, salt) {
	let hash = Math.imul(index + 7919, 0x9e3779b1) ^ Math.imul(salt + 104729, 0x85ebca6b);
	hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
	hash = Math.imul(hash ^ (hash >>> 12), 0x297a2d39);
	return ((hash ^ (hash >>> 15)) >>> 0) / 2 ** 32;
}

/** The hex's corners, corner k at 60k degrees about its middle. */
const corner = (k) => ({ x: HEX_W / 2 + (HEX_W / 2) * Math.cos((Math.PI * k) / 3), y: HEX_H / 2 + (HEX_W / 2) * Math.sin((Math.PI * k) / 3) });

/** @returns {{x: number, y: number}} `distance` along from `a` toward `b`. */
const toward = (a, b, distance) => {
	const length = Math.hypot(b.x - a.x, b.y - a.y);
	return { x: a.x + ((b.x - a.x) / length) * distance, y: a.y + ((b.y - a.y) / length) * distance };
};

/**
 * Open water filling the hex, hatched as the Blank Realm's lake is, in rows
 * spaced so they carry on from one lake hex into the next. Shores are laid
 * over it.
 */
function lakeWater(p) {
	const fill = p.terrain[TERRAIN.indexOf("lake")];
	const strokes = [];
	for (let row = 0; row < 10; row++) {
		const y = 24 + 48 * row;
		let x = -40 + noise(row, 1) * 60;
		for (let dash = 0; x < HEX_W + 20; dash++) {
			const salt = row * 31 + dash;
			const length = 60 + noise(salt, 2) * 170;
			const thick = 8 + noise(salt, 3) * 6;
			const lift = (noise(salt, 4) - 0.5) * 8;
			const bow = (noise(salt, 5) - 0.5) * 7;
			const points = Array.from({ length: 7 }, (_, step) => {
				const t = step / 6;
				return { x: x + length * t, y: y + lift + bow * Math.sin(Math.PI * t) + 1.5 * Math.sin(5 * t + salt) };
			});
			// A pen stroke, blunt at each end and a little fuller in the middle.
			const half = (index) => (thick / 2) * (0.6 + 0.4 * Math.sin((Math.PI * index) / 6));
			const upper = points.map((point, index) => ({ x: point.x, y: point.y - half(index) }));
			const lower = points.map((point, index) => ({ x: point.x, y: point.y + half(index) }));
			strokes.push(curvePath([...upper, ...lower.reverse()], true));
			x += length + 16 + noise(salt, 6) * 34;
		}
	}
	return svg(HEX_W, HEX_H, `<defs><clipPath id="hex"><polygon points="${hexPoints()}"/></clipPath></defs>`
		+ `<polygon points="${hexPoints()}" fill="${fill}" stroke="${p.rule}" stroke-width="${1.5 * SCALE}"/>`
		+ `<g clip-path="url(#hex)"><path d="${strokes.join("")}" fill="${p.ink}"/></g>`);
}

/**
 * Where a shore along the south edge runs, from its end at the south-east
 * corner to its end at the south-west one. Beside a shore of the same lake it
 * ends on the line from the corner to the hex's middle, turning as the next
 * shore does; beside open water it crosses the next edge square on, as the
 * shore of the lake beside carries on from it.
 * @param {string} shape One of SHORE_SHAPES.
 * @returns {{x: number, y: number, dx: number, dy: number}[]} Evenly spaced, running with the water on the right.
 */
function shoreCourse(shape) {
	const { inset, crossing } = LAKE_SHORE;
	const middle = { x: HEX_W / 2, y: HEX_H / 2 };
	const along = inset / Math.sin(Math.PI / 3);
	const end = (open, near, next, turned) => (open
		? { point: toward(corner(near), corner(next), crossing), heading: turned.open }
		: { point: toward(corner(near), middle, along), heading: turned.closed });
	const east = end(shape === "ccw" || shape === "both", 1, 0, { open: { x: -0.866, y: -0.5 }, closed: { x: -0.866, y: 0.5 } });
	const west = end(shape === "cw" || shape === "both", 2, 3, { open: { x: -0.866, y: 0.5 }, closed: { x: -0.866, y: -0.5 } });
	const mid = { x: HEX_W / 2, y: HEX_H - inset };
	const handle = (a, b) => Math.hypot(b.x - a.x, b.y - a.y) / 3;
	const east1 = handle(east.point, mid);
	const west1 = handle(mid, west.point);
	const segments = [
		[east.point, { x: east.point.x + east.heading.x * east1, y: east.point.y + east.heading.y * east1 }, { x: mid.x + east1, y: mid.y }, mid],
		[mid, { x: mid.x - west1, y: mid.y }, { x: west.point.x - west.heading.x * west1, y: west.point.y - west.heading.y * west1 }, west.point]
	];
	const course = evenly(densely(segments), 40);
	Object.assign(course[0], { dx: east.heading.x, dy: east.heading.y });
	Object.assign(course.at(-1), { dx: west.heading.x, dy: west.heading.y });
	return course;
}

/**
 * A lake's shore along the south edge: the land between it and the edge, and
 * the shore inked heavily along the water, jagged as a hand draws it but calm
 * about the middle, where a river may run in, and plain at its ends, where it
 * meets the next shore.
 * @param {string} shape One of SHORE_SHAPES.
 */
function lakeShore(shape, p) {
	const { weight, swell, jag, calm } = LAKE_SHORE;
	const course = shoreCourse(shape);
	const last = course.length - 1;
	const line = course.map((point, index) => {
		const s = index / last;
		const settled = Math.min(1, Math.abs(point.x - HEX_W / 2) / 90);
		// Now and then the pen jabs out into the water, as the sheet's own lake shore does.
		const jab = noise(index, 8) > 0.82 ? 1.8 : 1;
		const reach = Math.sin(Math.PI * s) * (calm + (jag - calm) * settled) * (2 * noise(index, 7) - 1) * (jab > 1 ? jab * settled : 1);
		// Into the water is to the right of the way the shore runs.
		return { ...point, x: point.x - point.dy * reach, y: point.y + point.dx * reach, sharp: jab > 1 && settled > 0.5 };
	});
	const outer = line.map((point, index) => {
		const s = index / last;
		const heavy = weight + Math.sin(Math.PI * s) * swell * Math.sin(2 * Math.PI * (1.6 * s + 0.2));
		return { x: point.x + point.dy * heavy, y: point.y - point.dx * heavy };
	});
	const sharp = (point) => ({ ...point, sharp: true });
	const ink = curvePath([sharp(line[0]), ...line.slice(1, last), sharp(line[last]), sharp(outer[last]), ...outer.slice(1, last).reverse(), sharp(outer[0])], true);
	const land = curvePath([sharp(corner(1)), sharp(line[0]), ...line.slice(1, last), sharp(line[last]), sharp(corner(2))], true);
	const fill = p.terrain[TERRAIN.indexOf("lake")];
	const rule = [[corner(2), corner(1)], ...(shape === "ccw" || shape === "both" ? [[corner(1), course[0]]] : []), ...(shape === "cw" || shape === "both" ? [[course[last], corner(2)]] : [])]
		.map(([a, b]) => `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`).join("");
	return svg(HEX_W, HEX_H, `<path d="${land}" fill="${fill}"/><path d="${rule}" fill="none" stroke="${p.rule}" stroke-width="${1.5 * SCALE}"/><path d="${ink}" fill="${p.ink}"/>`);
}

/**
 * A river running in from the south edge through a lake's shore: its banks
 * end in the shore's ink, and its water runs on through the ink to the lake.
 */
function riverMouth(p) {
	const start = edgeMidpoint(1);
	const shore = HEX_H - LAKE_SHORE.inset;
	const run = (to) => inkedRun([[start, { x: start.x, y: HEX_H - 20 }, { x: start.x, y: to + 20 }, { x: start.x, y: to }]], "mouth", { waver: 0 });
	return svg(HEX_W, HEX_H, `<path d="${run(shore + LAKE_SHORE.weight / 2).banks}" fill="${p.ink}"/>`
		+ `<path d="${run(shore - LAKE_SHORE.calm - 3).water}" fill="${p.water}"/>`);
}

/* -------------------------------------------- */
/*  The Armorial skin's drawings                */
/* -------------------------------------------- */

/** Drawings from the Book of Traceable Heraldic Art, each with its credit, cleaned by scripts/realm-armorial-art.js. */
const ARMORIAL_ART = JSON.parse(readFileSync(join(import.meta.dirname, "..", "data", "realm-armorial-art.json"), "utf8"));

/**
 * The drawing each of the Armorial skin's pictures is made from. No drawing
 * reads as a valley, so the Valley keeps the drawn mark.
 */
const ARMORIAL = Object.freeze({
	terrain: {
		marsh: "cattail", heath: "broom-sprig-fructed-2", crag: "stone-4", peaks: "mount-of-six-hillocks-couped",
		forest: "hurst-of-trees-issuant-from-a-mount", valley: null, hills: "trimount-couped-4", meadow: "sheep-statant",
		bog: "tree-stump-eradicated", lake: "roundel-barry-wavy-or-fountain", glade: "tree-fructed", plains: "stalk-of-wheat-3"
	},
	holding: { castle: "castle-of-three-towers-4", town: "house-3", fortress: "castle-of-one-tower", tower: "tower-16" },
	landmark: { dwelling: "house-3", sanctum: "church-2", monument: "beacon", hazard: "flame-5", curse: "skull-6", ruin: "arch" },
	seat: "eastern-crown-3"
});

/**
 * @returns {string} The Seat of Power's crown, the Armorial skin's Eastern Crown in every skin: gold,
 *   lined in whatever gold stands out from, `size` wide in the badge's middle.
 */
const crown = (p, size) => heraldicArt(ARMORIAL.seat, { x: 150, y: 150, width: size, height: size, fill: CROWN_GOLD, line: goldRim(p) });

/**
 * @param {string} key One of ARMORIAL_ART's drawings.
 * @param {{x: number, y: number, width: number, height: number, fill: string, line: string}} place The middle of
 *   the box it fits in, the box's size, and the colours it's drawn in where the heraldry painter would tint it and for its lines.
 * @returns {string} The drawing, credited.
 */
function heraldicArt(key, { x, y, width, height, fill, line }) {
	const art = ARMORIAL_ART[key];
	const root = /^<svg\b[^>]*>/.exec(art.svg)[0];
	const viewBox = /\sviewBox="([^"]+)"/.exec(root)[1];
	const body = recolourCharge(art.svg.slice(root.length, -"</svg>".length), fill, line);
	return `<desc>${escapeHTML(chargeNotice(art))}</desc>`
		+ `<svg x="${f(x - width / 2)}" y="${f(y - height / 2)}" width="${f(width)}" height="${f(height)}" viewBox="${viewBox}" fill="${line}">${body}</svg>`;
}

/* -------------------------------------------- */
/*  Skins                                       */
/* -------------------------------------------- */

/**
 * How each skin draws each picture, given a colour set.
 * @type {Record<string, {terrain: Function, holding: Function, landmark: Function, myth: Function, seat: Function, river: Function}>}
 */
const SKINS = {
	/**
	 * The Blank Realm sheet's own terrain, Holdings and Landmarks, rivers as the
	 * Realm Sheets ink them, numerals drawn to go with them, and the heraldic crown every skin's Seat wears.
	 */
	sheet: {
		terrain: (key, index, p) => svg(HEX_W, HEX_H, SHEET_CREDIT
			+ `<defs><clipPath id="hex"><polygon points="${hexPoints()}"/></clipPath></defs>`
			+ `<polygon points="${hexPoints()}" fill="${p.terrain[index]}" stroke="${p.rule}" stroke-width="${1.5 * SCALE}"/>`
			+ `<g clip-path="url(#hex)">${sheetArt(PICTURE_NAME.terrain(index + 1), { x: HEX_W / 2, y: HEX_H / 2, scale: SHEET_TERRAIN_SCALE, ink: p.ink, paper: p.terrain[index] })}</g>`),
		holding: (style, p) => svg(BADGE, BADGE, SHEET_CREDIT + sheetArt(PICTURE_NAME.holding(style), { x: 150, y: 150, width: 292, height: 292, ink: p.ink, paper: p.paper })),
		landmark: (type, p) => svg(BADGE, BADGE, SHEET_CREDIT + sheetArt(PICTURE_NAME.landmark(type), { x: 150, y: 150, width: 292, height: 292, ink: p.accent, paper: p.paper })),
		// Myths are the GM's secret, so they're numbered in the red pen the sheet marks Landmarks in.
		myth: (number, p) => svg(BADGE, BADGE, inkMark(inkNumeral(number), { x: 150, y: 150, size: 290, ink: p.accent, paper: p.paper })),
		// Ringed as the sheet rings a Myth, but in the crown's gold and left open, so the Holding shows through.
		seat: (p) => svg(BADGE, BADGE, inkMark(inkRing(42, { shadow: false, open: true, width: 9 }), { x: 150, y: 150, size: 290, ink: goldRim(p), paper: p.paper })
			+ inkMark(inkRing(42, { shadow: false, open: true, width: 5.5 }), { x: 150, y: 150, size: 290, ink: CROWN_GOLD, paper: p.paper })
			+ crown(p, 184)),
		river: inkedRiver,
		// The sheet's lake sits inside its hex, so lakes that meet are drawn as open water inside shores.
		lake: { water: lakeWater, shore: lakeShore, mouth: riverMouth }
	},

	/** Pale tinted hexes ruled in ink, and lettered roundels. */
	classic: {
		terrain: (key, index, p) => svg(HEX_W, HEX_H,
			`<polygon points="${hexPoints()}" fill="${p.terrain[index]}" stroke="${p.rule}" stroke-width="${2 * SCALE}"/>`
			+ terrainMark(key, p.ink, 3.2, p.terrain[index])),
		holding: (style, p) => svg(BADGE, BADGE, holdingMark(style, { x: 150, y: 150, size: 300 }, { fill: p.ink, halo: p.paper, width: 6 })),
		landmark: (type, p) => svg(BADGE, BADGE, `<circle cx="150" cy="150" r="130" fill="${p.paper}" stroke="${p.accent}" stroke-width="16"/>`
			+ text(LANDMARK_LETTERS[type], { x: 150, y: 196, size: 140, fill: p.accent, weight: "bold" })),
		myth: (number, p) => svg(BADGE, BADGE, `<circle cx="150" cy="150" r="130" fill="${p.ink}" stroke="${p.accent}" stroke-width="14"/>`
			+ text(number, { x: 150, y: 200, size: 150, fill: p.paper, font: NUMERAL_FONT })),
		seat: (p) => svg(BADGE, BADGE, goldRing(126, 12, goldRim(p))
			+ crown(p, 194)),
		river: (shape, p) => river(shape, { bank: p.ink, water: p.water, edge: 1.75 * SCALE, width: 4.5 * SCALE })
	},

	/** Bold cuts: a double-ruled hex, Holdings and Myths on shields, Landmarks on lozenges. */
	woodcut: {
		terrain: (key, index, p) => svg(HEX_W, HEX_H,
			`<polygon points="${hexPoints()}" fill="${p.terrain[index]}" stroke="${p.rule}" stroke-width="${2 * SCALE}"/>`
			+ `<polygon points="${hexPoints(0.88)}" fill="none" stroke="${p.ink}" stroke-width="${1.6 * SCALE}"/>`
			+ terrainMark(key, p.ink, 5.5, p.terrain[index], 0.56)),
		holding: (style, p) => svg(BADGE, BADGE, `<path d="${SHIELD}" fill="${p.accent}" stroke="${p.ink}" stroke-width="12" stroke-linejoin="round"/>`
			+ holdingMark(style, { x: 150, y: 142, size: 170 }, { fill: p.paper, halo: p.ink, width: 4 })),
		landmark: (type, p) => svg(BADGE, BADGE, `<path d="M150 14L286 150 150 286 14 150z" fill="${p.paper}" stroke="${p.ink}" stroke-width="14" stroke-linejoin="round"/>`
			+ mark(LANDMARK_MARKS[type], { x: 150, y: 150, size: 140, stroke: p.accent, width: 8 })),
		myth: (number, p) => svg(BADGE, BADGE, `<path d="${SHIELD}" fill="${p.ink}" stroke="${p.accent}" stroke-width="14" stroke-linejoin="round"/>`
			+ text(number, { x: 150, y: 196, size: 140, fill: p.paper, weight: "bold", font: NUMERAL_FONT })),
		seat: (p) => svg(BADGE, BADGE, goldRing(124, 15, goldRim(p))
			+ crown(p, 188)),
		river: (shape, p) => river(shape, { bank: p.ink, water: p.water, edge: 3 * SCALE, width: 6 * SCALE, middle: { stroke: p.ink, width: 1.2 * SCALE, dash: `${6 * SCALE} ${5 * SCALE}` } })
	},

	/** A surveyor's map: faint washes, fine marks, silhouettes and drawn signs. */
	atlas: {
		terrain: (key, index, p) => {
			const fill = mix(p.paper, p.terrain[index], 0.9);
			return svg(HEX_W, HEX_H, `<polygon points="${hexPoints()}" fill="${fill}"/>`
				+ terrainMark(key, mix(p.ink, p.paper, 0.12), 3, fill, 0.54));
		},
		holding: (style, p) => svg(BADGE, BADGE, holdingMark(style, { x: 150, y: 150, size: 280 }, { fill: p.ink, halo: p.paper, width: 4 })),
		landmark: (type, p) => svg(BADGE, BADGE, `<circle cx="150" cy="150" r="100" fill="${p.paper}" stroke="${p.ink}" stroke-width="7"/>`
			+ mark(LANDMARK_MARKS[type], { x: 150, y: 150, size: 128, stroke: p.ink, width: 5 })),
		myth: (number, p) => svg(BADGE, BADGE, `<polygon points="${burst(140, 104)}" fill="${p.accent}" stroke="${p.ink}" stroke-width="6" stroke-linejoin="round"/>`
			+ text(number, { x: 150, y: 188, size: 110, fill: onColour(p.accent, p), style: "italic", font: NUMERAL_FONT })),
		seat: (p) => svg(BADGE, BADGE, `<circle cx="150" cy="150" r="136" fill="none" stroke="${goldRim(p)}" stroke-width="3"/>`
			+ goldRing(120, 8, goldRim(p))
			+ crown(p, 186)),
		river: (shape, p) => river(shape, { bank: mix(p.ink, p.paper, 0.3), water: p.water, edge: 1 * SCALE, width: 3.5 * SCALE })
	},

	/** Strong colour and wax seals: solid hexes, marks in whichever of paper or ink shows best. */
	seal: {
		terrain: (key, index, p) => {
			const fill = p.solid[index];
			const on = onColour(fill, p);
			return svg(HEX_W, HEX_H,
				`<polygon points="${hexPoints()}" fill="${fill}" stroke="${p.rule}" stroke-width="${2 * SCALE}"/>`
				+ terrainMark(key, on, 4.2, fill));
		},
		holding: (style, p) => svg(BADGE, BADGE, `<path d="${scallops(126)}" fill="${p.accent}"/>`
			+ `<circle cx="150" cy="150" r="108" fill="none" stroke="${onColour(p.accent, p)}" stroke-width="5"/>`
			+ holdingMark(style, { x: 150, y: 150, size: 170 }, { fill: onColour(p.accent, p) })),
		landmark: (type, p) => svg(BADGE, BADGE, `<path d="${scallops(126)}" fill="${p.ink}"/>`
			+ mark(LANDMARK_MARKS[type], { x: 150, y: 150, size: 150, stroke: onColour(p.ink, p), width: 7 })),
		myth: (number, p) => svg(BADGE, BADGE, `<path d="${scallops(126)}" fill="${p.accent}"/>`
			+ `<circle cx="150" cy="150" r="100" fill="none" stroke="${onColour(p.accent, p)}" stroke-width="6"/>`
			+ text(number, { x: 150, y: 196, size: 130, fill: onColour(p.accent, p), weight: "bold", font: NUMERAL_FONT })),
		// The Seat alone is a rim without its wax, so the Holding it is pinned above shows through.
		seat: (p) => svg(BADGE, BADGE, `<path d="${scallops(116)}" fill="none" stroke="${goldRim(p)}" stroke-width="20"/>`
			+ `<path d="${scallops(116)}" fill="none" stroke="${CROWN_GOLD}" stroke-width="14"/>`
			+ crown(p, 170)),
		river: (shape, p) => river(shape, { bank: null, water: p.water, edge: 2 * SCALE, width: 9 * SCALE, middle: { stroke: mix(p.water, p.paper, 0.55), width: 2 * SCALE } })
	},

	/** Charges from old heraldry books: a drawing in each tinted hex, Landmarks in red roundels, Myths on shields. */
	armorial: {
		terrain: (key, index, p) => {
			const fill = p.terrain[index];
			const art = ARMORIAL.terrain[key];
			return svg(HEX_W, HEX_H, `<polygon points="${hexPoints()}" fill="${fill}" stroke="${p.rule}" stroke-width="${2 * SCALE}"/>`
				+ (art
					? heraldicArt(art, { x: HEX_W / 2, y: HEX_H / 2, width: HEX_H * 0.6, height: HEX_H * 0.58, fill, line: p.ink })
					// Drawn about as fine as the heraldry drawings' lines, so it doesn't stand out among them.
					: terrainMark(key, p.ink, 1.6, fill)));
		},
		holding: (style, p) => svg(BADGE, BADGE, heraldicArt(ARMORIAL.holding[style],
			{ x: 150, y: 150, width: BADGE * HOLDING_ICON_SHARE, height: BADGE * HOLDING_ICON_SHARE, fill: p.paper, line: p.ink })),
		landmark: (type, p) => svg(BADGE, BADGE, `<circle cx="150" cy="150" r="130" fill="${p.paper}" stroke="${p.accent}" stroke-width="16"/>`
			+ heraldicArt(ARMORIAL.landmark[type], { x: 150, y: 150, width: 168, height: 168, fill: p.paper, line: p.ink })),
		myth: (number, p) => svg(BADGE, BADGE, `<path d="${SHIELD}" fill="${p.accent}" stroke="${p.ink}" stroke-width="8" stroke-linejoin="round"/>`
			+ text(number, { x: 150, y: 186, size: 130, fill: onColour(p.accent, p), font: NUMERAL_FONT })),
		seat: (p) => svg(BADGE, BADGE, goldRing(126, 12, goldRim(p)) + crown(p, 184)),
		river: (shape, p) => river(shape, { bank: p.ink, water: p.water, edge: 1.75 * SCALE, width: 4.5 * SCALE })
	}
};

/** Skins drawn, by name under `bastionland.realm.look.skins`. */
export const DRAWN_SKINS = Object.freeze(Object.keys(SKINS));

/**
 * Every picture of one skin in one colour set.
 * @param {string} skin One of REALM_SKINS.
 * @param {string} paletteKey One of REALM_PALETTES' keys.
 * @returns {Record<string, string>} SVG source by file name, one for each of REALM_PICTURES.
 */
export function drawRealmSet(skin, paletteKey) {
	const draw = SKINS[skin];
	if (!draw) throw new Error(`No Realm skin called ${skin}`);
	const p = realmPalette(paletteKey);
	const files = {};
	TERRAIN.forEach((key, index) => { files[`${PICTURE_NAME.terrain(index + 1)}.svg`] = draw.terrain(key, index, p); });
	for (const style of HOLDING_STYLES) files[`${PICTURE_NAME.holding(style)}.svg`] = draw.holding(style, p);
	for (const type of LANDMARK_TYPES) files[`${PICTURE_NAME.landmark(type)}.svg`] = draw.landmark(type, p);
	for (let number = 1; number <= MYTH_COUNT; number++) files[`${PICTURE_NAME.myth(number)}.svg`] = draw.myth(number, p);
	files[`${PICTURE_NAME.seat}.svg`] = draw.seat(p);
	for (const shape of RIVER_SHAPES) files[`${PICTURE_NAME.river(shape)}.svg`] = draw.river(shape, p);
	// The skin's own extras, by the picture names skinPictures gives.
	const extras = new Map([
		[PICTURE_NAME.water, () => draw.lake.water(p)],
		...SHORE_SHAPES.map((shape) => [PICTURE_NAME.shore(shape), () => draw.lake.shore(shape, p)]),
		[PICTURE_NAME.mouth, () => draw.lake.mouth(p)]
	]);
	for (const name of skinPictures(skin)) files[`${name}.svg`] = extras.get(name)();
	return files;
}
