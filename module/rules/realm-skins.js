/**
 * How a Realm Scene looks: a skin (how each picture is drawn), a colour set
 * (the inks and paper it's drawn in), whether the icons imported from the
 * GM's Blank Realm PDF are used, and any pictures of the GM's own. Every
 * skin is drawn in every colour set by scripts/realm-placeholders.js, and
 * shipped under assets/realm. Pure, so it can be tested without Foundry.
 */
import { ART_ROOT } from "./book-art.js";
import { contrast, mix } from "./colour.js";
import { HOLDING_STYLES, LANDMARK_TYPES, MYTH_COUNT, RIVER_SHAPES, TERRAIN } from "./realm.js";
import { SYSTEM_PATH } from "../system-id.js";

/** Where the shipped pictures live, a folder for each skin and a folder in that for each colour set. */
export const REALM_SKIN_ROOT = `${SYSTEM_PATH}/assets/realm`;

/** Where pictures a GM uploads for their Realms are saved. */
export const REALM_CUSTOM_DIR = `${ART_ROOT}/realm-custom`;

/** Names under `bastionland.realm.look.skins`. */
export const REALM_SKINS = Object.freeze(["classic", "woodcut", "atlas", "seal"]);

/** How a picture of the GM's own for a terrain sits in its hex: filling it, or as an icon inside it. */
export const TERRAIN_FITS = Object.freeze(["hex", "icon"]);

const pad = (number) => String(number).padStart(2, "0");

/** The name each picture's file carries, without the extension. Terrain and Myths go by their number from 1. */
export const PICTURE_NAME = Object.freeze({
	terrain: (number) => `terrain-${pad(number)}`,
	holding: (style) => `holding-${style}`,
	landmark: (type) => `landmark-${type}`,
	myth: (number) => `myth-${number}`,
	seat: "seat",
	river: (shape) => `river-${shape}`
});

const MYTH_NUMBERS = Array.from({ length: MYTH_COUNT }, (_, index) => index + 1);

/** Every picture a Realm uses, by the name its file carries without the extension. */
export const REALM_PICTURES = Object.freeze([
	...TERRAIN.map((_, index) => PICTURE_NAME.terrain(index + 1)),
	...HOLDING_STYLES.map(PICTURE_NAME.holding),
	...LANDMARK_TYPES.map(PICTURE_NAME.landmark),
	...MYTH_NUMBERS.map(PICTURE_NAME.myth),
	PICTURE_NAME.seat,
	...RIVER_SHAPES.map(PICTURE_NAME.river)
]);

/* -------------------------------------------- */
/*  Colour sets                                 */
/* -------------------------------------------- */

/** Which kind of ground each terrain is, in d12 order, so each colour set tints them alike. */
const TERRAIN_GROUND = Object.freeze({
	marsh: "wet", heath: "dry", crag: "rock", peaks: "rock", forest: "green", valley: "green",
	hills: "dry", meadow: "green", bog: "wet", lake: "water", glade: "green", plains: "dry"
});

/**
 * A colour set. The paper, rule and barrier colours also go on the Scene, as its
 * background, its hex lines and its Barriers. Each terrain is the paper tinted
 * toward its kind of ground, lightly for the pale hexes and strongly for the Seal.
 */
function palette({ key, paper, ink, rule, accent, water, ground, tint, strong, terrain }) {
	const tinted = (amount) => TERRAIN.map((name) => {
		const colour = TERRAIN_GROUND[name] === "water" ? water : ground[TERRAIN_GROUND[name]];
		return mix(paper, colour, Math.min(1, amount));
	});
	return Object.freeze({
		key, paper, ink, rule, accent, water,
		terrain: Object.freeze(terrain ?? tinted(tint)),
		solid: Object.freeze(tinted(strong))
	});
}

/** Names under `bastionland.realm.look.palettes`. The first is the default. */
export const REALM_PALETTES = Object.freeze([
	palette({
		key: "parchment",
		paper: "#efe8d8", ink: "#3b342c", rule: "#a89f90", accent: "#8b1e1e", water: "#dde8ec",
		ground: { wet: "#9fb49a", dry: "#c7a878", rock: "#9a8f84", green: "#8fb070" },
		tint: 0.3, strong: 0.75,
		// The pale tints the Realm has always had.
		terrain: ["#dfe6d2", "#e8dcc8", "#ddd6cc", "#e3e0dc", "#d6e3c8", "#e2e8cf", "#e6e2c6", "#e4ecc8", "#d8dccb", "#d3e0e6", "#dde9cf", "#efe8d6"]
	}),
	palette({
		key: "verdigris",
		paper: "#e9ecdf", ink: "#22362f", rule: "#8fa39a", accent: "#a8702a", water: "#b9d8d2",
		ground: { wet: "#6fa596", dry: "#c4b074", rock: "#8f978c", green: "#5f9454" },
		tint: 0.32, strong: 0.8
	}),
	palette({
		key: "heraldic",
		paper: "#f4efe2", ink: "#1b2a4a", rule: "#9aa3b5", accent: "#b3282d", water: "#b8d0ec",
		ground: { wet: "#5f8fc4", dry: "#d6ae4e", rock: "#9c968c", green: "#4f9a50" },
		tint: 0.34, strong: 0.85
	}),
	palette({
		key: "ochre",
		paper: "#efe0c6", ink: "#3a2418", rule: "#b09878", accent: "#7a2230", water: "#cfd8c8",
		ground: { wet: "#7f9570", dry: "#c9873a", rock: "#977c6a", green: "#86883a" },
		tint: 0.34, strong: 0.8
	}),
	palette({
		key: "ashen",
		paper: "#ecebe7", ink: "#1f1f1f", rule: "#9a9a9a", accent: "#7a1f1f", water: "#d2d8da",
		ground: { wet: "#8f9a9e", dry: "#b3ad9f", rock: "#858585", green: "#98a08d" },
		tint: 0.3, strong: 0.8
	}),
	palette({
		key: "midnight",
		paper: "#1d2230", ink: "#e8dcc0", rule: "#4b5368", accent: "#d8a24a", water: "#35587a",
		ground: { wet: "#2f6a70", dry: "#6e5e38", rock: "#565664", green: "#3a6a44" },
		tint: 0.45, strong: 0.85
	})
]);

/**
 * @param {string} key
 * @returns {object} That colour set, or the default.
 */
export const realmPalette = (key) => REALM_PALETTES.find((entry) => entry.key === key) ?? REALM_PALETTES[0];

/**
 * @param {string} key
 * @returns {{paper: string, grid: string, barrier: string}} The colours a Realm Scene itself is drawn in.
 */
export function sceneColours(key) {
	const { paper, rule, accent } = realmPalette(key);
	return { paper, grid: rule, barrier: accent };
}

/**
 * A few colours to show a colour set by.
 * @param {string} key
 * @returns {string[]}
 */
export function paletteSwatches(key) {
	const p = realmPalette(key);
	return [p.paper, p.terrain[4], p.terrain[9], p.solid[2], p.ink, p.accent];
}

/* -------------------------------------------- */
/*  Drawing                                     */
/* -------------------------------------------- */

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

/**
 * How each skin draws each picture, given a colour set.
 * @type {Record<string, {terrain: Function, holding: Function, landmark: Function, myth: Function, seat: Function, river: Function}>}
 */
const SKINS = {
	/** Pale tinted hexes ruled in ink, lettered roundels, as the Realm Sheet. */
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

/**
 * Every picture of one skin in one colour set.
 * @param {string} skin One of REALM_SKINS.
 * @param {string} paletteKey One of REALM_PALETTES' keys.
 * @returns {Record<string, string>} SVG source by file name, one for each of REALM_PICTURES.
 */
export function drawRealmSet(skin, paletteKey) {
	const draw = SKINS[skin] ?? SKINS.classic;
	const p = realmPalette(paletteKey);
	const files = {};
	TERRAIN.forEach((key, index) => { files[`${PICTURE_NAME.terrain(index + 1)}.svg`] = draw.terrain(key, index, p); });
	for (const style of HOLDING_STYLES) files[`${PICTURE_NAME.holding(style)}.svg`] = draw.holding(style, p);
	for (const type of LANDMARK_TYPES) files[`${PICTURE_NAME.landmark(type)}.svg`] = draw.landmark(type, p);
	for (const number of MYTH_NUMBERS) files[`${PICTURE_NAME.myth(number)}.svg`] = draw.myth(number, p);
	files[`${PICTURE_NAME.seat}.svg`] = draw.seat(p);
	for (const shape of RIVER_SHAPES) files[`${PICTURE_NAME.river(shape)}.svg`] = draw.river(shape, p);
	return files;
}

/**
 * @param {string} skin
 * @param {string} paletteKey
 * @returns {string} The folder that skin's pictures in that colour set are served from.
 */
export const realmSetDir = (skin, paletteKey) => `${REALM_SKIN_ROOT}/${REALM_SKINS.includes(skin) ? skin : REALM_SKINS[0]}/${realmPalette(paletteKey).key}`;

/* -------------------------------------------- */
/*  The world's choice                          */
/* -------------------------------------------- */

/**
 * @typedef {object} RealmLook
 * @property {string} skin
 * @property {string} palette
 * @property {boolean} bookIcons Use the icons imported from the Blank Realm PDF where there are some.
 * @property {{folder: string, terrainFit: string, files: Record<string, string>}} custom Pictures of the GM's own,
 *   by picture name, from `folder`.
 */

/** @returns {RealmLook} */
export const defaultRealmLook = () => ({ skin: REALM_SKINS[0], palette: REALM_PALETTES[0].key, bookIcons: true, custom: { folder: "", terrainFit: "hex", files: {} } });

/**
 * A saved look with anything unknown put back to the default.
 * @param {object|null|undefined} look
 * @returns {RealmLook}
 */
export function normaliseRealmLook(look) {
	const fallback = defaultRealmLook();
	const custom = look?.custom ?? {};
	const files = Object.fromEntries(Object.entries(custom.files ?? {})
		.filter(([name, path]) => REALM_PICTURES.includes(name) && typeof path === "string" && path));
	return {
		skin: REALM_SKINS.includes(look?.skin) ? look.skin : fallback.skin,
		palette: realmPalette(look?.palette).key,
		bookIcons: look?.bookIcons === undefined ? fallback.bookIcons : Boolean(look.bookIcons),
		custom: {
			folder: typeof custom.folder === "string" ? custom.folder : "",
			terrainFit: TERRAIN_FITS.includes(custom.terrainFit) ? custom.terrainFit : fallback.custom.terrainFit,
			files
		}
	};
}

/** File types Foundry shows as images. */
const IMAGE_EXTENSIONS = Object.freeze(["apng", "avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "tiff", "webp"]);

/** Other names a GM's file may go by, to the picture it stands for. */
const ALIASES = new Map([
	...TERRAIN.flatMap((key, index) => {
		const name = PICTURE_NAME.terrain(index + 1);
		return [[key, name], [`terrain-${key}`, name], [`terrain-${index + 1}`, name], [`${pad(index + 1)}-${key}`, name], [`${name}-${key}`, name]];
	}),
	...HOLDING_STYLES.map((style) => [style, PICTURE_NAME.holding(style)]),
	...LANDMARK_TYPES.map((type) => [type, PICTURE_NAME.landmark(type)]),
	...MYTH_NUMBERS.map((number) => [`myth${number}`, PICTURE_NAME.myth(number)]),
	...["seat-of-power", "seatofpower", "crown"].map((alias) => [alias, PICTURE_NAME.seat]),
	...RIVER_SHAPES.map((shape) => [`river${shape}`, PICTURE_NAME.river(shape)])
]);

/**
 * The picture a file stands for, going by its name: "terrain-05.png",
 * "Forest.webp", "holding_castle.jpg", "myth 3.svg" and so on.
 * @param {string} path
 * @returns {string|null} One of REALM_PICTURES.
 */
export function customPictureName(path) {
	let file = String(path ?? "").split(/[\\/]/).at(-1) ?? "";
	try { file = decodeURIComponent(file); } catch { /* A stray "%" in a local file name. */ }
	const dot = file.lastIndexOf(".");
	if (dot <= 0 || !IMAGE_EXTENSIONS.includes(file.slice(dot + 1).toLowerCase())) return null;
	const base = file.slice(0, dot).toLowerCase().trim().replace(/[\s_]+/g, "-");
	if (REALM_PICTURES.includes(base)) return base;
	return ALIASES.get(base) ?? null;
}

/**
 * Match the files in a folder to the pictures they stand for. Where two
 * files stand for the same picture, the one named exactly wins, then the first.
 * @param {string[]} paths
 * @returns {Record<string, string>} Path by picture name.
 */
export function matchCustomFiles(paths) {
	const found = {};
	const exact = new Set();
	for (const path of paths ?? []) {
		const name = customPictureName(path);
		if (!name) continue;
		const file = decodeURIComponent(String(path).split(/[\\/]/).at(-1));
		const isExact = file.slice(0, file.lastIndexOf(".")).toLowerCase() === name;
		if (found[name] && (exact.has(name) || !isExact)) continue;
		found[name] = path;
		if (isExact) exact.add(name);
	}
	return found;
}
