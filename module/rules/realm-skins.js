/**
 * How a Realm Scene looks: a skin (how each picture is drawn), a colour set
 * (the inks and paper it's drawn in), and any pictures of the GM's own. Every
 * skin is drawn in every colour set by scripts/realm-placeholders.js, and
 * shipped under assets/realm. Pure, so it can be tested without Foundry.
 */
import { ART_ROOT } from "./book-art.js";
import { mix } from "./colour.js";
import { HOLDING_STYLES, LANDMARK_TYPES, MYTH_COUNT, RIVER_SHAPES, TERRAIN } from "./realm.js";
import { SHORE_SHAPES } from "./realm-rivers.js";
import { fileName } from "./text.js";
import { SYSTEM_PATH } from "../system-id.js";

/** Where the shipped pictures live, a folder for each skin and a folder in that for each colour set. */
export const REALM_SKIN_ROOT = `${SYSTEM_PATH}/assets/realm`;

/** Where pictures a GM uploads for their Realms are saved. */
export const REALM_CUSTOM_DIR = `${ART_ROOT}/realm-custom`;

/** Names under `bastionland.realm.look.skins`. The first is the default. */
export const REALM_SKINS = Object.freeze(["sheet", "classic", "woodcut", "atlas", "seal", "armorial"]);

/**
 * @typedef {object} SkinFeatures What a skin draws beyond one picture to a hex.
 * @property {boolean} holdingsGiveWay Its terrain drawing gives way to a Holding in its hex, as on the Blank Realm, rather than lying under it.
 * @property {boolean} joinsLakes It draws a lake inside its hex, so lakes side by side are drawn as one water,
 *   with a shore where they meet land and a mouth where a river runs in.
 * @property {Readonly<Record<string, readonly string[]>>} terrainPlaces The other pictures it has of a terrain besides
 *   its own, by its key, so that a Realm's hexes needn't all look alike: where on the map they were traced from each
 *   stood, as "col,row" in order, so pictures drawn side by side there can be laid side by side again.
 * @property {Readonly<Record<string, readonly (readonly string[])[]>>} terrainGroups Groups of hexes on that map drawn
 *   as one picture of a terrain across the edges they share, as "col,row", by its key. Each hex of a group has a picture
 *   of its own besides those above, which runs on into the others' and so is only ever laid with all of them.
 */

/** @type {Readonly<SkinFeatures>} */
const PLAIN_SKIN = Object.freeze({
	holdingsGiveWay: false,
	joinsLakes: false,
	terrainPlaces: Object.freeze({}),
	terrainGroups: Object.freeze({})
});

/**
 * The hexes of the Realm Sheets' example Realm that scripts/realm-sheet-art.py
 * traced each terrain's other pictures from, in its VARIANTS order. That map
 * is laid out as the book's sheet is, 12 hexes by 12.
 */
const EXAMPLE_PLACES = Object.freeze({
	marsh: ["9,8", "10,8", "11,8"],
	heath: ["6,1", "6,2", "6,3", "7,1", "7,2", "8,1", "8,2", "10,6", "11,6", "11,7"],
	crag: ["9,11", "10,11", "10,12"],
	peaks: ["1,4", "1,5", "1,6", "2,4", "2,5", "2,6", "9,1", "10,1", "11,1", "3,7", "6,12", "7,12"],
	forest: ["1,2", "4,8", "3,9"],
	hills: ["6,6", "6,7", "9,5", "9,6"],
	meadow: ["9,3", "9,4", "10,3", "10,4", "10,10", "12,10", "11,11", "12,11"],
	bog: ["12,8", "8,9", "9,9", "10,9", "11,9", "12,9", "9,10", "11,10"],
	glade: ["4,1", "4,3", "3,4", "10,5", "11,5", "12,5"],
	plains: ["6,4", "5,6", "7,5", "8,5", "7,6", "8,6", "6,9", "4,11", "4,12", "9,7"]
});

/** The example Realm's groups of hexes drawn as one, in scripts/realm-sheet-art.py's GROUPS order. */
const EXAMPLE_GROUPS = Object.freeze({
	marsh: [["9,8", "10,8"], ["10,7", "11,8"]],
	heath: [["12,6", "12,7"]],
	crag: [["9,11", "10,11", "11,12", "12,12"]],
	peaks: [["11,1", "12,1", "11,2", "12,2"], ["1,8", "2,8", "1,9", "2,9", "1,10", "1,11"]],
	forest: [["1,1", "2,1", "3,1", "2,2", "2,3"], ["1,2", "1,3"], ["4,8", "4,9", "3,9"]],
	hills: [["7,3", "8,3", "7,4", "8,4", "9,5"], ["4,5", "3,6", "4,6", "5,7"]],
	meadow: [["10,3", "10,4"]],
	glade: [["3,2", "3,3"], ["3,4", "4,3", "4,4"], ["12,4", "12,5"]]
});

/** @type {Readonly<Record<string, Readonly<SkinFeatures>>>} The skins that draw more than PLAIN_SKIN. */
const SKIN_FEATURES = Object.freeze({
	// The Realm Sheets' example Realm draws each terrain many ways, traced by scripts/realm-sheet-art.py.
	sheet: Object.freeze({
		holdingsGiveWay: true,
		joinsLakes: true,
		terrainPlaces: Object.freeze(Object.fromEntries(Object.entries(EXAMPLE_PLACES).map(([key, places]) => [key, Object.freeze(places)]))),
		terrainGroups: Object.freeze(Object.fromEntries(Object.entries(EXAMPLE_GROUPS)
			.map(([key, groups]) => [key, Object.freeze(groups.map((group) => Object.freeze(group)))])))
	})
});

/**
 * The skin whose other pictures of a terrain a hex's picture roll is matched
 * to its neighbours by. A roll is kept with the Realm whatever skin draws it,
 * and this is the only skin with more than one picture of a terrain.
 */
export const PAIRED_SKIN = "sheet";

/**
 * @param {string} skin
 * @returns {Readonly<SkinFeatures>}
 */
export const skinFeatures = (skin) => SKIN_FEATURES[skin] ?? PLAIN_SKIN;

/** How a picture of the GM's own for a terrain sits in its hex: filling it, or as an icon inside it. */
export const TERRAIN_FITS = Object.freeze(["hex", "icon"]);

/**
 * The name each picture's file carries, without the extension. Terrain is
 * asked for by its d12 number from 1 and named for its terrain, such as
 * "terrain-marsh"; Myths go by their number from 1.
 */
export const PICTURE_NAME = Object.freeze({
	terrain: (number) => `terrain-${TERRAIN[number - 1]}`,
	// A skin's other pictures of a terrain, numbered on from its own, which is the first.
	terrainVariant: (number, variant) => `terrain-${TERRAIN[number - 1]}-${variant}`,
	// A skin's pictures of a terrain drawn on into their neighbours', numbered from 1 through its groups in order.
	terrainJoined: (number, picture) => `terrain-${TERRAIN[number - 1]}-joined-${picture}`,
	holding: (style) => `holding-${style}`,
	landmark: (type) => `landmark-${type}`,
	myth: (number) => `myth-${number}`,
	seat: "seat",
	river: (shape) => `river-${shape}`,
	// The pictures only some skins draw, which a GM's own pictures don't replace.
	water: "lake-water",
	shore: (shape) => `lake-shore-${shape}`,
	mouth: "river-mouth"
});

/**
 * @param {string} skin
 * @param {number} number A terrain's d12 number, from 1.
 * @returns {string[]} The skin's other pictures of that terrain, besides its own.
 */
export const terrainVariantPictures = (skin, number) => Array.from(
	{ length: (skinFeatures(skin).terrainPlaces[TERRAIN[number - 1]] ?? []).length },
	(_, index) => PICTURE_NAME.terrainVariant(number, index + 2)
);

/**
 * @param {string} skin
 * @param {number} number A terrain's d12 number, from 1.
 * @returns {string[]} The skin's pictures of that terrain drawn on into their neighbours', through its groups in order.
 */
export const terrainJoinedPictures = (skin, number) => Array.from(
	{ length: (skinFeatures(skin).terrainGroups[TERRAIN[number - 1]] ?? []).flat().length },
	(_, index) => PICTURE_NAME.terrainJoined(number, index + 1)
);

/**
 * @param {string} skin
 * @param {number} number A terrain's d12 number, from 1.
 * @returns {string[]} All the skin's pictures of that terrain besides its own: those shown on their own, then those drawn on into their neighbours'.
 */
export const terrainExtraPictures = (skin, number) => [...terrainVariantPictures(skin, number), ...terrainJoinedPictures(skin, number)];

/**
 * @param {string} skin
 * @returns {string[]} The pictures that skin draws besides REALM_PICTURES: other pictures of its terrain, and those for joining its lakes up.
 */
export const skinPictures = (skin) => [
	...TERRAIN.flatMap((_, index) => terrainExtraPictures(skin, index + 1)),
	...(skinFeatures(skin).joinsLakes ? [PICTURE_NAME.water, ...SHORE_SHAPES.map(PICTURE_NAME.shore), PICTURE_NAME.mouth] : [])
];

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
	const file = fileName(path);
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
		const file = fileName(path);
		const isExact = file.slice(0, file.lastIndexOf(".")).toLowerCase() === name;
		if (found[name] && (exact.has(name) || !isExact)) continue;
		found[name] = path;
		if (isExact) exact.add(name);
	}
	return found;
}

/* -------------------------------------------- */
/*  Skins of the GM's own                       */
/* -------------------------------------------- */

/**
 * Where skins made from a GM's own pictures are kept, a folder for each with
 * a skin.json in it. It is under Data, not a world, so every world on the
 * server has them.
 */
export const OWN_SKIN_ROOT = `${ART_ROOT}/realm-skins`;

/** The file in each own skin's folder that names it. */
export const OWN_SKIN_MANIFEST = "skin.json";

/**
 * @typedef {object} OwnSkin A skin made from a GM's own pictures.
 * @property {string} folder Its folder under OWN_SKIN_ROOT, which also tells it apart.
 * @property {string} name What the GM called it.
 * @property {string} base The shipped skin drawing the pictures it doesn't give.
 * @property {string} terrainFit
 * @property {Record<string, string>} files Path by picture name.
 */

/**
 * A folder name for a skin, from what the GM called it.
 * @param {string} name
 * @param {string[]} [taken] Folder names already in use.
 * @returns {string}
 */
export function ownSkinSlug(name, taken = []) {
	const base = String(name ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
		.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "skin";
	let slug = base;
	for (let n = 2; taken.includes(slug); n += 1) slug = `${base}-${n}`;
	return slug;
}

/**
 * What an own skin's skin.json says, for writing. Pictures go by their file
 * name in the skin's folder, so the folder can be moved as a whole.
 * @param {{name: string, base: string, terrainFit: string, files: Record<string, string>}} skin
 * @returns {object}
 */
export const ownSkinManifest = ({ name, base, terrainFit, files }) => ({
	name: String(name).trim(),
	base: REALM_SKINS.includes(base) ? base : REALM_SKINS[0],
	terrainFit: TERRAIN_FITS.includes(terrainFit) ? terrainFit : TERRAIN_FITS[0],
	files: Object.fromEntries(Object.entries(files ?? {})
		.filter(([picture, path]) => REALM_PICTURES.includes(picture) && typeof path === "string" && path)
		.map(([picture, path]) => [picture, path.split("/").at(-1)]))
});

/**
 * An own skin as read from its folder's skin.json.
 * @param {object|null} manifest
 * @param {string} folder
 * @returns {OwnSkin|null} Null for a skin removed, or a file that isn't one.
 */
export function readOwnSkin(manifest, folder) {
	if (!manifest || typeof manifest !== "object" || manifest.removed) return null;
	const name = typeof manifest.name === "string" ? manifest.name.trim() : "";
	if (!name) return null;
	const { base, terrainFit, files } = ownSkinManifest({ ...manifest, name });
	return {
		folder,
		name,
		base,
		terrainFit,
		files: Object.fromEntries(Object.entries(files).map(([picture, file]) => [picture, `${folder}/${file}`]))
	};
}

/**
 * The look that draws with an own skin.
 * @param {OwnSkin} skin
 * @param {string} palette
 * @returns {RealmLook}
 */
export const ownSkinLook = (skin, palette) => normaliseRealmLook({
	skin: skin.base,
	palette,
	custom: { folder: skin.folder, terrainFit: skin.terrainFit, files: skin.files }
});

/**
 * @param {RealmLook} look
 * @param {OwnSkin[]} skins
 * @returns {OwnSkin|null} The own skin that look draws with, if any.
 */
export const ownSkinOf = (look, skins) => (Object.keys(look.custom.files).length ? skins.find((skin) => skin.folder === look.custom.folder) ?? null : null);

/**
 * @param {OwnSkin[]} skins
 * @returns {OwnSkin[]} The skins by name, as they are listed.
 */
export const sortOwnSkins = (skins) => [...skins].sort((a, b) => a.name.localeCompare(b.name));

/**
 * The list once a skin is removed.
 * @param {OwnSkin[]} skins
 * @param {OwnSkin} removed
 * @returns {OwnSkin[]}
 */
export const withoutOwnSkin = (skins, removed) => skins.filter((skin) => skin.folder !== removed.folder);

/**
 * The list once a skin is saved: in place of what it was, or added if new.
 * @param {OwnSkin[]} skins
 * @param {OwnSkin} saved
 * @returns {OwnSkin[]}
 */
export const withOwnSkin = (skins, saved) => sortOwnSkins([...withoutOwnSkin(skins, saved), saved]);
