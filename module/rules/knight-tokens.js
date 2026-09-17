/**
 * Square token pictures for Knights. Each Knight's portrait is tall and
 * narrow, so Import Book Art also saves a square cut from it around the
 * Knight's face, and that square becomes the token.
 */

/** How wide the square is, as a share of the portrait's width. */
export const TOKEN_SIDE = 0.6;

/** Where to centre a portrait whose face hasn't been measured: a head near the top. */
const DEFAULT_FACE = Object.freeze([0.5, 0.3]);

/**
 * The middle of each Knight's face in their portrait, by roll, as shares of
 * the portrait's width and height. Measured by eye across all 72 portraits.
 */
export const KNIGHT_FACES = Object.freeze({
	"1-01": [0.40, 0.29], "1-02": [0.54, 0.335], "1-03": [0.27, 0.42], "1-04": [0.35, 0.29], "1-05": [0.52, 0.25], "1-06": [0.52, 0.30],
	"1-07": [0.58, 0.61], "1-08": [0.52, 0.35], "1-09": [0.42, 0.21], "1-10": [0.41, 0.505], "1-11": [0.45, 0.52], "1-12": [0.57, 0.58],
	"2-01": [0.65, 0.36], "2-02": [0.24, 0.54], "2-03": [0.49, 0.28], "2-04": [0.35, 0.36], "2-05": [0.38, 0.705], "2-06": [0.52, 0.36],
	"2-07": [0.64, 0.53], "2-08": [0.50, 0.34], "2-09": [0.49, 0.13], "2-10": [0.57, 0.27], "2-11": [0.33, 0.30], "2-12": [0.63, 0.22],
	"3-01": [0.40, 0.275], "3-02": [0.52, 0.70], "3-03": [0.72, 0.60], "3-04": [0.45, 0.48], "3-05": [0.41, 0.39], "3-06": [0.87, 0.63],
	"3-07": [0.60, 0.425], "3-08": [0.51, 0.25], "3-09": [0.39, 0.43], "3-10": [0.45, 0.33], "3-11": [0.34, 0.265], "3-12": [0.70, 0.33],
	"4-01": [0.41, 0.20], "4-02": [0.55, 0.44], "4-03": [0.39, 0.25], "4-04": [0.38, 0.235], "4-05": [0.48, 0.25], "4-06": [0.54, 0.275],
	"4-07": [0.60, 0.16], "4-08": [0.45, 0.395], "4-09": [0.46, 0.45], "4-10": [0.39, 0.365], "4-11": [0.42, 0.33], "4-12": [0.59, 0.49],
	"5-01": [0.51, 0.26], "5-02": [0.42, 0.385], "5-03": [0.55, 0.245], "5-04": [0.58, 0.325], "5-05": [0.36, 0.62], "5-06": [0.49, 0.25],
	"5-07": [0.37, 0.22], "5-08": [0.50, 0.08], "5-09": [0.49, 0.26], "5-10": [0.39, 0.345], "5-11": [0.49, 0.26], "5-12": [0.05, 0.56],
	"6-01": [0.44, 0.30], "6-02": [0.42, 0.23], "6-03": [0.60, 0.23], "6-04": [0.52, 0.29], "6-05": [0.61, 0.33], "6-06": [0.45, 0.30],
	"6-07": [0.41, 0.32], "6-08": [0.53, 0.22], "6-09": [0.40, 0.15], "6-10": [0.48, 0.195], "6-11": [0.41, 0.45], "6-12": [0.33, 0.46]
});

/**
 * The square to cut from a Knight's portrait: centred on their face, and
 * moved back inside the picture where the face sits near an edge.
 * @param {{width: number, height: number}} image The portrait's size in pixels.
 * @param {string} roll Such as "3-07".
 * @returns {{x: number, y: number, size: number}} In pixels.
 */
export function tokenCrop({ width, height }, roll) {
	const [faceX, faceY] = KNIGHT_FACES[roll] ?? DEFAULT_FACE;
	const size = Math.max(1, Math.min(Math.round(width * TOKEN_SIDE), width, height));
	const place = (share, length) => Math.min(Math.max(Math.round(share * length - size / 2), 0), length - size);
	return { x: place(faceX, width), y: place(faceY, height), size };
}

/**
 * Each imported portrait's square token, so token art still showing a
 * portrait can be swapped for the square.
 * @param {object[]|undefined} knights The art index's Knights.
 * @returns {Map<string, string>} Portrait path to token path.
 */
export function portraitTokens(knights) {
	return new Map((knights ?? []).filter((entry) => entry?.path && entry.token).map((entry) => [entry.path, entry.token]));
}
