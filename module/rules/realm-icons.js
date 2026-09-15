/**
 * The legend icons printed on the Blank Realm sheet, and how Import Book Art
 * saves them for Realm Scenes. Nothing from the sheet ships with the system:
 * the GM supplies their own PDF. Pure, so it can be tested without Foundry.
 *
 * The first page of the Blank Realm PDF paints each icon as its own picture.
 * Along the bottom run the twelve terrain icons, in d12 order from left to
 * right, then the four Holdings. The six Landmarks run down the right-hand
 * column, in the order the sheet lists them.
 */
import { ART_ROOT } from "./book-art.js";
import { HOLDING_STYLES, LANDMARK_TYPES, TERRAIN } from "./realm.js";

/** Folder under Foundry's Data path the icons are saved to. */
export const REALM_ICON_DIR = `${ART_ROOT}/realm`;

export const REALM_INDEX_FILE = "index.json";

const REALM_INDEX_VERSION = 1;

export const REALM_ICON_KINDS = Object.freeze(["terrain", "holding", "landmark"]);

/** Why an icon needs a second look. */
export const REALM_ICON_PROBLEMS = Object.freeze(["notFound", "extra", "decode", "upload"]);

/** The Blank Realm PDF is a handful of pages; anything longer is some other book. */
export const REALM_SHEET_MAX_PAGES = 4;

/** Pictures whose top is this far down the page are in the legend along the bottom. */
const LEGEND_TOP = 0.83;

/** In the legend, pictures from this far across are Holdings, the rest terrain. */
const HOLDINGS_LEFT = 0.68;

/** The Landmarks sit in the right half of the page. */
const LANDMARKS_LEFT = 0.5;

const multiply = (m, n) => [
	m[0] * n[0] + m[2] * n[1],
	m[1] * n[0] + m[3] * n[1],
	m[0] * n[2] + m[2] * n[3],
	m[1] * n[2] + m[3] * n[3],
	m[0] * n[4] + m[2] * n[5] + m[4],
	m[1] * n[4] + m[3] * n[5] + m[5]
];

/**
 * Every picture a page paints, with the transform it's painted through, by
 * following pdf.js's operator list.
 * @param {number[]} fnArray From `page.getOperatorList()`.
 * @param {any[]} argsArray
 * @param {object} OPS pdf.js operator codes.
 * @returns {{key: string|null, width: number, height: number, inline?: object, matrix: number[]}[]}
 */
export function trackImageTransforms(fnArray, argsArray, OPS) {
	let matrix = [1, 0, 0, 1, 0, 0];
	const stack = [];
	const images = [];
	fnArray.forEach((fn, index) => {
		const args = argsArray[index];
		switch (fn) {
			case OPS.save:
				stack.push(matrix);
				break;
			case OPS.restore:
				matrix = stack.pop() ?? matrix;
				break;
			case OPS.transform:
				matrix = multiply(matrix, args);
				break;
			case OPS.paintFormXObjectBegin:
				stack.push(matrix);
				if (Array.isArray(args?.[0])) matrix = multiply(matrix, args[0]);
				break;
			case OPS.paintFormXObjectEnd:
				matrix = stack.pop() ?? matrix;
				break;
			case OPS.paintImageXObject:
				images.push({ key: args[0], width: args[1], height: args[2], matrix });
				break;
			case OPS.paintInlineImageXObject:
				images.push({ key: null, width: args[0].width, height: args[0].height, inline: args[0], matrix });
				break;
			default:
				break;
		}
	});
	return images;
}

/**
 * Where a picture lands on the page, as fractions of the page measured from its top left.
 * @param {number[]} matrix The transform a picture's unit square is painted through.
 * @param {number[]} view The page's `view`: [x0, y0, x1, y1] in PDF units, y upwards.
 * @returns {{left: number, top: number, width: number, height: number}}
 */
export function imageBox(matrix, [x0, y0, x1, y1]) {
	const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [
		matrix[0] * u + matrix[2] * v + matrix[4],
		matrix[1] * u + matrix[3] * v + matrix[5]
	]);
	const xs = corners.map(([x]) => x);
	const ys = corners.map(([, y]) => y);
	const pageWidth = x1 - x0;
	const pageHeight = y1 - y0;
	return {
		left: (Math.min(...xs) - x0) / pageWidth,
		top: (y1 - Math.max(...ys)) / pageHeight,
		width: (Math.max(...xs) - Math.min(...xs)) / pageWidth,
		height: (Math.max(...ys) - Math.min(...ys)) / pageHeight
	};
}

/**
 * Sort a page's pictures into the icons of the Realm Sheet's legend.
 * @param {{key: string|null, box: {left: number, top: number}}[]} images From `listPageImages` with boxes.
 * @returns {{terrain: Record<number, object|null>, holding: Record<string, object|null>,
 *   landmark: Record<string, object|null>, problems: {kind: string, reason: string}[]}}
 */
export function classifyRealmIcons(images) {
	const seen = new Set();
	const unique = images.filter((image) => {
		if (!image.box) return false;
		if (image.key == null) return true;
		if (seen.has(image.key)) return false;
		seen.add(image.key);
		return true;
	});

	const byLeft = (a, b) => a.box.left - b.box.left;
	const legend = unique.filter((image) => image.box.top >= LEGEND_TOP);
	const found = {
		terrain: legend.filter((image) => image.box.left < HOLDINGS_LEFT).sort(byLeft),
		holding: legend.filter((image) => image.box.left >= HOLDINGS_LEFT).sort(byLeft),
		landmark: unique.filter((image) => image.box.top < LEGEND_TOP && image.box.left >= LANDMARKS_LEFT).sort((a, b) => a.box.top - b.box.top)
	};

	const problems = [];
	const assign = (kind, keys) => {
		const list = found[kind];
		if (list.length < keys.length) problems.push({ kind, reason: "notFound" });
		else if (list.length > keys.length) problems.push({ kind, reason: "extra" });
		return Object.fromEntries(keys.map((key, index) => [key, list[index] ?? null]));
	};

	return {
		terrain: assign("terrain", TERRAIN.map((_, index) => index + 1)),
		holding: assign("holding", HOLDING_STYLES),
		landmark: assign("landmark", LANDMARK_TYPES),
		problems
	};
}

/**
 * @param {{key: string|null, box: object}[]} images The first page's pictures, with boxes.
 * @returns {boolean} Whether the page is the Blank Realm sheet's legend.
 */
export const looksLikeRealmSheet = (images) => classifyRealmIcons(images).problems.length === 0;

/**
 * Turn a picture printed on white into one that is see-through where it was
 * white, keeping its colours: laid back over white, it looks as it did.
 * @param {Uint8ClampedArray} pixels RGBA.
 * @returns {Uint8ClampedArray} New RGBA pixels.
 */
export function whiteToAlpha(pixels) {
	const out = new Uint8ClampedArray(pixels.length);
	for (let index = 0; index < pixels.length; index += 4) {
		const [red, green, blue, alpha] = [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
		const ink = (255 - Math.min(red, green, blue)) / 255;
		if (ink <= 0) continue;
		const unmix = (channel) => 255 - (255 - channel) / ink;
		out[index] = unmix(red);
		out[index + 1] = unmix(green);
		out[index + 2] = unmix(blue);
		out[index + 3] = Math.round(ink * alpha);
	}
	return out;
}

/**
 * Where one icon is saved.
 * @param {"terrain"|"holding"|"landmark"} kind
 * @param {number|string} key The d12 result for terrain; the style or type otherwise.
 * @param {string} [extension]
 * @returns {{dir: string, fileName: string, file: string}} `file` is relative to ART_ROOT.
 */
export function realmIconFile(kind, key, extension = "webp") {
	const name = kind === "terrain" ? `terrain-${String(key).padStart(2, "0")}-${TERRAIN[key - 1]}` : `${kind}-${key}`;
	const fileName = `${name}.${extension}`;
	return { dir: REALM_ICON_DIR, fileName, file: `realm/${fileName}` };
}

/**
 * The index written beside the icons, which Realm Scenes read their pictures from.
 * @param {object} data
 * @param {{kind: string, key: number|string, file: string, path: string|null, width?: number, height?: number}[]} data.entries
 * @param {{kind: string, key?: string, reason: string}[]} [data.problems]
 * @param {string} data.importedAt
 * @param {string} data.systemVersion
 * @param {string} data.source The PDF's file name.
 * @param {number} data.pdfPages
 * @returns {object}
 */
export function buildRealmIconIndex({ entries, problems = [], importedAt, systemVersion, source, pdfPages }) {
	const pick = (kind, keys, field) => keys.map((key) => {
		const entry = entries.find((candidate) => candidate.kind === kind && candidate.key === key);
		return { [field]: key, file: entry?.file ?? realmIconFile(kind, key).file, path: entry?.path ?? null, width: entry?.width ?? null, height: entry?.height ?? null };
	});
	return {
		version: REALM_INDEX_VERSION,
		systemVersion,
		importedAt,
		source,
		pdfPages,
		root: REALM_ICON_DIR,
		terrain: pick("terrain", TERRAIN.map((_, index) => index + 1), "terrain"),
		holdings: pick("holding", HOLDING_STYLES, "style"),
		landmarks: pick("landmark", LANDMARK_TYPES, "type"),
		problems
	};
}
