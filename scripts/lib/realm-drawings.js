/**
 * How each Realm skin draws each picture in a colour set, as the SVG files
 * scripts/realm-placeholders.js ships under assets/realm. Only that script and
 * the tests draw, so none of this, nor the Blank Realm's traced art, is loaded
 * in Foundry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrast, mix } from "../../module/rules/colour.js";
import { HOLDING_STYLES, LANDMARK_TYPES, MYTH_COUNT, RIVER_SHAPES, TERRAIN } from "../../module/rules/realm.js";
import { PICTURE_NAME, realmPalette } from "../../module/rules/realm-skins.js";
import { INK_CROWN, curvePath, drawInk, inkNumeral } from "./realm-ink.js";

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

/** A few ink marks for each terrain, drawn in a 100 by 100 box. */
const TERRAIN_MARKS = {
	marsh: "M15 45h22M45 40h20M25 62h25M58 60h24M20 45v-10M52 40v-12M34 62v-9M70 60v-11",
	heath: "M18 40l6 8 6-8M44 34l6 8 6-8M66 44l6 8 6-8M28 62l6 8 6-8M54 64l6 8 6-8",
	crag: "M15 70l12-26 10 10 12-24 14 20 8-8 14 28z",
	peaks: "M10 72l24-44 24 44M40 72l24-40 26 40M28 50l6-6 6 8",
	forest: "M28 70v-14M50 70v-18M72 70v-14M28 56a10 10 0 1 0 0.1 0M50 52a12 12 0 1 0 0.1 0M72 56a10 10 0 1 0 0.1 0",
	valley: "M12 30c20 10 26 30 30 44M88 30c-20 10-26 30-30 44M40 74h20",
	hills: "M10 64c14-24 34-24 46 0M46 64c12-18 30-18 44 0",
	meadow: "M20 70l-4-16M24 70l0-18M28 70l4-16M48 66l-4-16M52 66l0-18M56 66l4-16M74 72l-4-16M78 72l0-18M82 72l4-16",
	bog: "M16 44h16M40 44h14M62 44h20M24 62h18M50 62h16M72 62h12M30 52h0.1M58 53h0.1M44 72h0.1",
	lake: "M14 40c8-6 16 6 24 0s16 6 24 0 16 6 24 0M14 56c8-6 16 6 24 0s16 6 24 0 16 6 24 0M24 72c8-6 16 6 24 0s16 6 24 0",
	glade: "M36 72v-16M36 56a10 10 0 1 0 0.1 0M62 66h0.1M70 60h0.1M66 72h0.1M58 58h0.1",
	plains: "M30 44h0.1M62 40h0.1M46 60h0.1M72 64h0.1M28 70h0.1"
};

/** Simple drawings of each Holding, in a 100 by 100 box. */
const HOLDING_MARKS = {
	castle: "M18 86V40h12v8h8v-8h12v8h8v-8h12v8h8v-8h12v46zM44 86V66a6 6 0 0 1 12 0v20M26 30l6-14 6 14M62 30l6-14 6 14",
	town: "M14 80c10-24 62-24 72 0zM26 64l8-12 8 12v10H26zM46 58l8-12 8 12v14H46zM62 66l6-10 6 10v8H62z",
	fortress: "M22 86V36h56v50zM22 36l4-8h48l4 8M32 28v-8h8v8M46 28v-8h8v8M60 28v-8h8v8M42 86V68h16v18",
	tower: "M38 88V38h24v50zM34 38l16-24 16 24zM46 88V74h8v14M46 52h8v8h-8z"
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

const CROWN = "M70 200l-10-90 50 40 40-70 40 70 50-40-10 90z";

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
	+ `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${f(width)}" stroke-linecap="round" stroke-linejoin="round"/></g>`;

const terrainMark = (key, stroke, width, share = 0.62) =>
	mark(TERRAIN_MARKS[key], { x: HEX_W / 2, y: HEX_H / 2, size: HEX_H * share, stroke, width });

const text = (content, { x, y, size, fill, weight = "normal", style = "normal" }) =>
	`<text x="${f(x)}" y="${f(y)}" font-family="${FONT}" font-size="${f(size)}" font-weight="${weight}" font-style="${style}" fill="${fill}" text-anchor="middle">${content}</text>`;

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

/** A river drawn as banks of `edge` either side of `water`, with an optional line down the middle. */
function river(shape, { bank, water, edge, width, middle }) {
	const d = riverPath(RIVER_ENDS[shape]);
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
 * A traced picture from the sheet, fitted inside a box and centred on it.
 * @param {string} name A picture's name, such as "holding-castle".
 * @param {{x: number, y: number, width: number, height: number, scale?: number, ink: string, paper: string}} place
 *   The box's middle and size; `scale` sets the size outright instead.
 * @returns {string}
 */
function sheetArt(name, { x, y, width, height, scale, ink, paper }) {
	const art = SHEET_ART[name];
	const size = scale ?? Math.min(width / art.width, height / art.height);
	const body = (art.paper ? `<path d="${art.paper}" fill="${paper}"/>` : "") + `<path d="${art.ink}" fill="${ink}"/>`;
	return `<g transform="translate(${f(x - (art.width * size) / 2)} ${f(y - (art.height * size) / 2)}) scale(${f(size)})">${body}</g>`;
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

/**
 * A river piece as the Realm Sheets draw their rivers: white water between two
 * hand-inked banks, the one on the outside of each bend drawn heavier.
 * @param {string} shape One of RIVER_SHAPES.
 * @param {object} p A colour set.
 * @returns {string}
 */
function inkedRiver(shape, p) {
	const { water, waver } = INKED_RIVER;
	const segments = riverCourse(shape);
	const dense = segments.flatMap((segment, index) => Array.from({ length: 81 }, (_, step) => cubicAt(segment, step / 80)).slice(index ? 1 : 0));
	const course = evenly(dense, 48);
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
	const upstream = (points) => [...points].reverse().map((point) => ({ ...point, dx: -point.dx, dy: -point.dy }));
	const left = side(-1);
	const right = side(1);
	const ends = (points) => points.map((point, index) => (index === 0 || index === points.length - 1 ? { ...point, sharp: true } : point));

	if (shape === "end") {
		// The banks meet around the spring, in one line running with the water on its right.
		const tip = course[last];
		const start = Math.atan2(left[last].y - tip.y, left[last].x - tip.x);
		const cap = Array.from({ length: 9 }, (_, index) => {
			const angle = start + (Math.PI * (index + 1)) / 10;
			return { x: tip.x + (Math.cos(angle) * water) / 2, y: tip.y + (Math.sin(angle) * water) / 2 };
		});
		const around = evenly([...left, ...cap, ...upstream(right)], 72);
		Object.assign(around[0], { dx: course[0].dx, dy: course[0].dy });
		Object.assign(around.at(-1), { dx: -course[0].dx, dy: -course[0].dy });
		return svg(HEX_W, HEX_H, `<path d="${curvePath(ends(around), true)}" fill="${p.water}"/><path d="${bank(around, phase)}" fill="${p.ink}"/>`);
	}

	const waterPath = curvePath([...ends(left), ...ends(right).reverse()], true);
	return svg(HEX_W, HEX_H, `<path d="${waterPath}" fill="${p.water}"/>`
		+ `<path d="${bank(left, phase)}${bank(upstream(right), phaseOf(shape, 2))}" fill="${p.ink}"/>`);
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
	 * Realm Sheets ink them, and numerals and a crown drawn to go with them.
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
		seat: (p) => svg(BADGE, BADGE, inkMark(INK_CROWN, { x: 150, y: 150, size: 290, ink: p.ink, paper: p.paper })),
		river: inkedRiver
	},

	/** Pale tinted hexes ruled in ink, and lettered roundels. */
	classic: {
		terrain: (key, index, p) => svg(HEX_W, HEX_H,
			`<polygon points="${hexPoints()}" fill="${p.terrain[index]}" stroke="${p.rule}" stroke-width="${2 * SCALE}"/>`
			+ terrainMark(key, p.ink, 3.2)),
		holding: (style, p) => svg(BADGE, BADGE, mark(HOLDING_MARKS[style], { x: 150, y: 150, size: 300, stroke: p.ink, width: 4, fill: p.paper })),
		landmark: (type, p) => svg(BADGE, BADGE, `<circle cx="150" cy="150" r="130" fill="${p.paper}" stroke="${p.accent}" stroke-width="16"/>`
			+ text(LANDMARK_LETTERS[type], { x: 150, y: 196, size: 140, fill: p.accent, weight: "bold" })),
		myth: (number, p) => svg(BADGE, BADGE, `<circle cx="150" cy="150" r="130" fill="${p.ink}" stroke="${p.accent}" stroke-width="14"/>`
			+ text(number, { x: 150, y: 200, size: 150, fill: p.paper })),
		seat: (p) => svg(BADGE, BADGE, `<circle cx="150" cy="150" r="130" fill="${p.paper}" stroke="${p.ink}" stroke-width="12"/><path d="${CROWN}" fill="${p.ink}"/>`),
		river: (shape, p) => river(shape, { bank: p.ink, water: p.water, edge: 1.75 * SCALE, width: 4.5 * SCALE })
	},

	/** Bold cuts: a double-ruled hex, Holdings and Myths on shields, Landmarks on lozenges. */
	woodcut: {
		terrain: (key, index, p) => svg(HEX_W, HEX_H,
			`<polygon points="${hexPoints()}" fill="${p.terrain[index]}" stroke="${p.rule}" stroke-width="${2 * SCALE}"/>`
			+ `<polygon points="${hexPoints(0.88)}" fill="none" stroke="${p.ink}" stroke-width="${1.6 * SCALE}"/>`
			+ terrainMark(key, p.ink, 5.5, 0.56)),
		holding: (style, p) => svg(BADGE, BADGE, `<path d="${SHIELD}" fill="${p.accent}" stroke="${p.ink}" stroke-width="12" stroke-linejoin="round"/>`
			+ mark(HOLDING_MARKS[style], { x: 150, y: 142, size: 170, stroke: p.ink, width: 5, fill: p.paper })),
		landmark: (type, p) => svg(BADGE, BADGE, `<path d="M150 14L286 150 150 286 14 150z" fill="${p.paper}" stroke="${p.ink}" stroke-width="14" stroke-linejoin="round"/>`
			+ mark(LANDMARK_MARKS[type], { x: 150, y: 150, size: 140, stroke: p.accent, width: 8 })),
		myth: (number, p) => svg(BADGE, BADGE, `<path d="${SHIELD}" fill="${p.ink}" stroke="${p.accent}" stroke-width="14" stroke-linejoin="round"/>`
			+ text(number, { x: 150, y: 196, size: 140, fill: p.paper, weight: "bold" })),
		seat: (p) => svg(BADGE, BADGE, `<circle cx="150" cy="150" r="128" fill="${p.accent}" stroke="${p.ink}" stroke-width="14"/><path d="${CROWN}" fill="${p.paper}" stroke="${p.ink}" stroke-width="8" stroke-linejoin="round"/>`),
		river: (shape, p) => river(shape, { bank: p.ink, water: p.water, edge: 3 * SCALE, width: 6 * SCALE, middle: { stroke: p.ink, width: 1.2 * SCALE, dash: `${6 * SCALE} ${5 * SCALE}` } })
	},

	/** A surveyor's map: faint washes, fine marks, silhouettes and drawn signs. */
	atlas: {
		terrain: (key, index, p) => svg(HEX_W, HEX_H,
			`<polygon points="${hexPoints()}" fill="${mix(p.paper, p.terrain[index], 0.9)}"/>`
			+ terrainMark(key, mix(p.ink, p.paper, 0.12), 3, 0.54)),
		holding: (style, p) => svg(BADGE, BADGE, mark(HOLDING_MARKS[style], { x: 150, y: 150, size: 280, stroke: p.paper, width: 3, fill: p.ink })),
		landmark: (type, p) => svg(BADGE, BADGE, `<circle cx="150" cy="150" r="100" fill="${p.paper}" stroke="${p.ink}" stroke-width="7"/>`
			+ mark(LANDMARK_MARKS[type], { x: 150, y: 150, size: 128, stroke: p.ink, width: 5 })),
		myth: (number, p) => svg(BADGE, BADGE, `<polygon points="${burst(140, 104)}" fill="${p.accent}" stroke="${p.ink}" stroke-width="6" stroke-linejoin="round"/>`
			+ text(number, { x: 150, y: 188, size: 110, fill: onColour(p.accent, p), style: "italic" })),
		seat: (p) => svg(BADGE, BADGE, `<path d="M96 272V30" stroke="${p.ink}" stroke-width="14" stroke-linecap="round"/>`
			+ `<path d="M103 36h140l-36 48 36 48H103z" fill="${p.accent}" stroke="${p.ink}" stroke-width="8" stroke-linejoin="round"/>`),
		river: (shape, p) => river(shape, { bank: mix(p.ink, p.paper, 0.3), water: p.water, edge: 1 * SCALE, width: 3.5 * SCALE })
	},

	/** Strong colour and wax seals: solid hexes, marks in whichever of paper or ink shows best. */
	seal: {
		terrain: (key, index, p) => {
			const fill = p.solid[index];
			const on = onColour(fill, p);
			return svg(HEX_W, HEX_H,
				`<polygon points="${hexPoints()}" fill="${fill}" stroke="${p.rule}" stroke-width="${2 * SCALE}"/>`
				+ terrainMark(key, on, 4.2));
		},
		holding: (style, p) => svg(BADGE, BADGE, `<path d="${scallops(126)}" fill="${p.accent}"/>`
			+ `<circle cx="150" cy="150" r="108" fill="none" stroke="${onColour(p.accent, p)}" stroke-width="5"/>`
			+ mark(HOLDING_MARKS[style], { x: 150, y: 150, size: 170, stroke: onColour(p.accent, p), width: 5 })),
		landmark: (type, p) => svg(BADGE, BADGE, `<path d="${scallops(126)}" fill="${p.ink}"/>`
			+ mark(LANDMARK_MARKS[type], { x: 150, y: 150, size: 150, stroke: onColour(p.ink, p), width: 7 })),
		myth: (number, p) => svg(BADGE, BADGE, `<path d="${scallops(126)}" fill="${p.accent}"/>`
			+ `<circle cx="150" cy="150" r="100" fill="none" stroke="${onColour(p.accent, p)}" stroke-width="6"/>`
			+ text(number, { x: 150, y: 196, size: 130, fill: onColour(p.accent, p), weight: "bold" })),
		seat: (p) => svg(BADGE, BADGE, `<path d="${scallops(126)}" fill="${p.ink}"/><path d="${CROWN}" fill="${p.accent}"/>`),
		river: (shape, p) => river(shape, { bank: null, water: p.water, edge: 2 * SCALE, width: 9 * SCALE, middle: { stroke: mix(p.water, p.paper, 0.55), width: 2 * SCALE } })
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
	return files;
}
