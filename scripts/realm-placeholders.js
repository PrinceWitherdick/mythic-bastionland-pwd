/**
 * Draws the placeholder pictures a Realm uses until the GM imports the icons
 * from their own Blank Realm PDF. They are simple originals, not the book's
 * art. Run after changing the Realm tables:
 *
 *   node scripts/realm-placeholders.js
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOLDING_STYLES, LANDMARK_TYPES, MYTH_COUNT, TERRAIN } from "../module/rules/realm.js";
import { RIVER_SHAPES } from "../module/rules/realm-documents.js";

const out = join(import.meta.dirname, "..", "assets", "realm");
mkdirSync(out, { recursive: true });

const INK = "#3b342c";
const RULE = "#a89f90";
const PAPER = "#efe8d8";
const BLOOD = "#8b1e1e";
const WATER = "#dde8ec";

/** Hex pictures are drawn at three times the size a hex is shown at, so they stay crisp when zoomed. */
const SCALE = 3;
const HEX_H = 160 * SCALE;
const HEX_W = (2 * HEX_H) / Math.sqrt(3);
const f = (value) => Number(value.toFixed(2));

const svg = (width, height, body) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="${f(width)}" height="${f(height)}" viewBox="0 0 ${f(width)} ${f(height)}">${body}</svg>\n`;

const hexPoints = [[HEX_W, HEX_H / 2], [0.75 * HEX_W, HEX_H], [0.25 * HEX_W, HEX_H], [0, HEX_H / 2], [0.25 * HEX_W, 0], [0.75 * HEX_W, 0]]
	.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");

const TERRAIN_FILLS = ["#dfe6d2", "#e8dcc8", "#ddd6cc", "#e3e0dc", "#d6e3c8", "#e2e8cf", "#e6e2c6", "#e4ecc8", "#d8dccb", "#d3e0e6", "#dde9cf", "#efe8d6"];

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

/** Midpoint of a hex's edge in direction k, and the unit vector pointing inwards from it. */
function edgeMidpoint(k) {
	const angle = ((60 * k + 30) * Math.PI) / 180;
	const apothem = HEX_H / 2;
	return {
		x: HEX_W / 2 + apothem * Math.cos(angle),
		y: HEX_H / 2 + apothem * Math.sin(angle),
		inX: -Math.cos(angle),
		inY: -Math.sin(angle)
	};
}

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

const files = {};

TERRAIN.forEach((key, index) => {
	const box = HEX_H * 0.62;
	const mark = `<g transform="translate(${f(HEX_W / 2 - box / 2)} ${f(HEX_H / 2 - box / 2 - HEX_H * 0.04)}) scale(${f(box / 100)})">`
		+ `<path d="${TERRAIN_MARKS[key]}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
	const number = `<text x="${f(HEX_W / 2)}" y="${f(HEX_H * 0.9)}" font-family="Georgia, serif" font-size="${f(HEX_H * 0.11)}" fill="${RULE}" text-anchor="middle">${index + 1}</text>`;
	files[`terrain-${String(index + 1).padStart(2, "0")}.svg`] = svg(HEX_W, HEX_H,
		`<polygon points="${hexPoints}" fill="${TERRAIN_FILLS[index]}" stroke="${RULE}" stroke-width="${2 * SCALE}"/>${mark}${number}`);
});

for (const style of HOLDING_STYLES) {
	files[`holding-${style}.svg`] = svg(300, 300, `<g transform="scale(3)"><path d="${HOLDING_MARKS[style]}" fill="${PAPER}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/></g>`);
}

for (const type of LANDMARK_TYPES) {
	files[`landmark-${type}.svg`] = svg(300, 300, `<circle cx="150" cy="150" r="130" fill="${PAPER}" stroke="${BLOOD}" stroke-width="16"/>`
		+ `<text x="150" y="196" font-family="Georgia, serif" font-size="140" font-weight="bold" fill="${BLOOD}" text-anchor="middle">${LANDMARK_LETTERS[type]}</text>`);
}

for (let number = 1; number <= MYTH_COUNT; number++) {
	files[`myth-${number}.svg`] = svg(300, 300, `<circle cx="150" cy="150" r="130" fill="${INK}" stroke="${BLOOD}" stroke-width="14"/>`
		+ `<text x="150" y="200" font-family="Georgia, serif" font-size="150" fill="${PAPER}" text-anchor="middle">${number}</text>`);
}

files["seat.svg"] = svg(300, 300, `<circle cx="150" cy="150" r="130" fill="${PAPER}" stroke="${INK}" stroke-width="12"/>`
	+ `<path d="M70 200l-10-90 50 40 40-70 40 70 50-40-10 90z" fill="${INK}"/>`);

const RIVER_ENDS = { straight: 4, bend: 3, sharp: 2, end: null };
for (const shape of RIVER_SHAPES) {
	const d = riverPath(RIVER_ENDS[shape]);
	const pool = shape === "end" ? `<circle cx="${f(HEX_W / 2)}" cy="${f(HEX_H / 2)}" r="${f(HEX_H * 0.07)}" fill="${WATER}" stroke="${INK}" stroke-width="${2.5 * SCALE}"/>` : "";
	files[`river-${shape}.svg`] = svg(HEX_W, HEX_H,
		`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${f(8 * SCALE)}" stroke-linecap="butt"/>`
		+ `<path d="${d}" fill="none" stroke="${WATER}" stroke-width="${f(4.5 * SCALE)}" stroke-linecap="butt"/>${pool}`);
}

for (const [name, content] of Object.entries(files)) writeFileSync(join(out, name), content);
console.log(`Wrote ${Object.keys(files).length} placeholders to ${out}`);
