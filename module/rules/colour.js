/**
 * Colour maths shared by the Realm skins and heraldry, on "#rrggbb" strings.
 * Pure, so it can be tested without Foundry.
 */

/** The ink the system draws its own lines and glyphs in, on the page and on the map. */
export const INK = "#231f1a";

/**
 * A colour as the canvas wants it.
 * @param {string} hex "#rrggbb"
 * @returns {number} Such as 0x231f1a.
 */
export const colourNumber = (hex) => Number(hex.replace("#", "0x"));

/** The same ink for the canvas. */
export const INK_HEX = colourNumber(INK);

/** The paper the Realm's names and marks are lettered on, for the canvas. */
export const PAPER_HEX = 0xf4ecd8;

/** A colour as the painter keeps it: "#" and six lower-case hex digits. */
export const HEX_COLOR = /^#[0-9a-f]{6}$/;

/**
 * @param {string} hex "#rrggbb"
 * @returns {number[]} [r, g, b], each 0 to 255.
 */
export const channels = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));

const toHex = (values) => `#${values.map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0")).join("")}`;

/**
 * @param {string} from "#rrggbb"
 * @param {string} to
 * @param {number} amount 0 is `from`, 1 is `to`.
 * @returns {string}
 */
export function mix(from, to, amount) {
	const a = channels(from);
	const b = channels(to);
	return toHex(a.map((value, index) => value + (b[index] - value) * amount));
}

/** @returns {number} Relative luminance, 0 for black to 1 for white. */
function luminance(hex) {
	const [r, g, b] = channels(hex).map((value) => {
		const share = value / 255;
		return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** @returns {number} WCAG contrast ratio between two colours. */
export function contrast(a, b) {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
}
