/**
 * How a Realm Scene looks: a skin (how each picture is drawn), a colour set
 * (the inks and paper it's drawn in), and any pictures of the GM's own. Every
 * skin is drawn in every colour set by scripts/realm-placeholders.js, and
 * shipped under assets/realm. Pure, so it can be tested without Foundry.
 */
import { ART_ROOT } from "./book-art.js";
import { mix } from "./colour.js";
import { HOLDING_STYLES, LANDMARK_TYPES, MYTH_COUNT, RIVER_SHAPES, TERRAIN } from "./realm.js";
import { SYSTEM_PATH } from "../system-id.js";

/** Where the shipped pictures live, a folder for each skin and a folder in that for each colour set. */
export const REALM_SKIN_ROOT = `${SYSTEM_PATH}/assets/realm`;

/** Where pictures a GM uploads for their Realms are saved. */
export const REALM_CUSTOM_DIR = `${ART_ROOT}/realm-custom`;

/** Names under `bastionland.realm.look.skins`. The first is the default. */
export const REALM_SKINS = Object.freeze(["sheet", "classic", "woodcut", "atlas", "seal", "armorial"]);

/** Skins whose terrain drawing gives way to a Holding in its hex, as on the Blank Realm, rather than lying under it. */
export const HOLDINGS_REPLACE_TERRAIN = Object.freeze(["sheet"]);

/** How a picture of the GM's own for a terrain sits in its hex: filling it, or as an icon inside it. */
export const TERRAIN_FITS = Object.freeze(["hex", "icon"]);

/**
 * The name each picture's file carries, without the extension. Terrain is
 * asked for by its d12 number from 1 and named for its terrain, such as
 * "terrain-marsh"; Myths go by their number from 1.
 */
export const PICTURE_NAME = Object.freeze({
	terrain: (number) => `terrain-${TERRAIN[number - 1]}`,
	holding: (style) => `holding-${style}`,
	landmark: (type) => `landmark-${type}`,
	myth: (number) => `myth-${number}`,
	seat: "seat",
	river: (shape) => `river-${shape}`
});

/** What each terrain picture was called when terrain went by number, as "terrain-05", to its name now. */
const NUMBERED_TERRAIN = new Map(TERRAIN.map((_, index) => [`terrain-${String(index + 1).padStart(2, "0")}`, PICTURE_NAME.terrain(index + 1)]));

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

/** Names under `bastionland.realm.look.palettes`. The first, parchment, is the default. */
export const REALM_PALETTES = Object.freeze([
	palette({
		key: "parchment",
		paper: "#efe8d8", ink: "#3b342c", rule: "#a89f90", accent: "#8b1e1e", water: "#dde8ec",
		ground: { wet: "#9fb49a", dry: "#c7a878", rock: "#9a8f84", green: "#8fb070" },
		tint: 0.3, strong: 0.75,
		// The pale tints the Realm has always had.
		terrain: ["#dfe6d2", "#e8dcc8", "#ddd6cc", "#e3e0dc", "#d6e3c8", "#e2e8cf", "#e6e2c6", "#e4ecc8", "#d8dccb", "#d3e0e6", "#dde9cf", "#efe8d6"]
	}),
	// The Blank Realm sheet itself: black ink and red pen on white, the hexes ruled in grey.
	palette({
		key: "blank",
		paper: "#ffffff", ink: "#111111", rule: "#bfbfbf", accent: "#f93333", water: "#ffffff",
		ground: { wet: "#9fa9ab", dry: "#bab2a2", rock: "#999999", green: "#a4ad98" },
		strong: 0.7,
		terrain: TERRAIN.map(() => "#ffffff")
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
 * @property {{folder: string, terrainFit: string, files: Record<string, string>}} custom Pictures of the GM's own,
 *   by picture name, from `folder`.
 */

/** @returns {RealmLook} */
export const defaultRealmLook = () => ({ skin: REALM_SKINS[0], palette: REALM_PALETTES[0].key, custom: { folder: "", terrainFit: "hex", files: {} } });

/**
 * A saved look with anything unknown put back to the default.
 * @param {object|null|undefined} look
 * @returns {RealmLook}
 */
export function normaliseRealmLook(look) {
	const fallback = defaultRealmLook();
	const custom = look?.custom ?? {};
	// Looks saved when terrain went by number, as "terrain-05", are read under the terrain's name;
	// where a look has both, the terrain's name wins.
	const saved = Object.entries(custom.files ?? {}).filter(([, path]) => typeof path === "string" && path);
	const files = Object.fromEntries([
		...saved.filter(([name]) => NUMBERED_TERRAIN.has(name)).map(([name, path]) => [NUMBERED_TERRAIN.get(name), path]),
		...saved.filter(([name]) => REALM_PICTURES.includes(name))
	]);
	return {
		skin: REALM_SKINS.includes(look?.skin) ? look.skin : fallback.skin,
		palette: realmPalette(look?.palette).key,
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
	...TERRAIN.map((key, index) => [key, PICTURE_NAME.terrain(index + 1)]),
	// The names terrain files went by when it was numbered: "terrain-5", "05-forest", "terrain-05-forest".
	...NUMBERED_TERRAIN,
	...TERRAIN.flatMap((key, index) => {
		const name = PICTURE_NAME.terrain(index + 1);
		const pad = String(index + 1).padStart(2, "0");
		return [[`terrain-${index + 1}`, name], [`${pad}-${key}`, name], [`terrain-${pad}-${key}`, name]];
	}),
	...HOLDING_STYLES.map((style) => [style, PICTURE_NAME.holding(style)]),
	...LANDMARK_TYPES.map((type) => [type, PICTURE_NAME.landmark(type)]),
	...MYTH_NUMBERS.map((number) => [`myth${number}`, PICTURE_NAME.myth(number)]),
	...["seat-of-power", "seatofpower", "crown"].map((alias) => [alias, PICTURE_NAME.seat]),
	...RIVER_SHAPES.map((shape) => [`river${shape}`, PICTURE_NAME.river(shape)])
]);

/**
 * The picture a file stands for, going by its name: "terrain-forest.png",
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
