/**
 * The profile a die shows when it lands: the outline a chat card draws behind
 * a result, so a d12 is told from a d6 at a glance rather than by reading the
 * "d12" under it. The book rolls d4, d6, d8, d10, d12 and d20, and each is
 * drawn the way it sits on the table — a d8 on its point, a d20 face-on as a
 * hexagon, every corner rounded off the way a die's is.
 *
 * Each comes out as a mask the stylesheet cuts the die out of, since Foundry's
 * server cleans a chat message's HTML against a list of tags that has no `svg`
 * in it: a card can only carry its shape as a style. Pure, so it can be tested
 * without Foundry.
 */

/** The box every profile is drawn in. */
const BOX = 100;

/** How wide the rule that rounds the corners is, in that box. Half of it is the corner's radius. */
const ROUNDING = 13;

/** The corners sit this far from the middle, and the rounding is laid outside them. */
const REACH = 48;

/**
 * A regular polygon's corners, the first one at the top.
 * @param {number} sides
 * @returns {Array<[number, number]>}
 */
function regular(sides) {
	const half = BOX / 2;
	return Array.from({ length: sides }, (_corner, index) => {
		const angle = (index / sides) * 2 * Math.PI - Math.PI / 2;
		return [half + REACH * Math.cos(angle), half + REACH * Math.sin(angle)];
	});
}

/**
 * Each die's outline. The four-sider is the triangle a d4 shows, the eight the
 * rhombus of two faces meeting, the ten its kite; the twelve and the twenty
 * are the pentagon and the hexagon their faces ring.
 * @type {Readonly<Record<number, Array<[number, number]>>>}
 */
export const DIE_SHAPES = Object.freeze({
	4: [
		[50, 6],
		[95, 85],
		[5, 85]
	],
	6: [
		[8, 8],
		[92, 8],
		[92, 92],
		[8, 92]
	],
	8: [
		[50, 2],
		[98, 50],
		[50, 98],
		[2, 50]
	],
	10: [
		[50, 2],
		[96, 38],
		[50, 98],
		[4, 38]
	],
	12: regular(5),
	20: regular(6)
});

/**
 * The corners of the profile a die is drawn with.
 * @param {number} faces How many faces it has.
 * @returns {Array<[number, number]>} A die the book never rolls is drawn as
 *   the regular polygon of its own number of faces, up to the ten past which
 *   one reads as a circle anyway.
 */
export function dieShape(faces) {
	const sides = Math.trunc(Number(faces));
	if (DIE_SHAPES[sides]) return DIE_SHAPES[sides];
	if (!Number.isFinite(sides) || sides < 3) return DIE_SHAPES[6];
	return regular(Math.min(sides, 10));
}

/**
 * The shape drawn in, pulled off the edges by the rule that rounds it so the
 * rounding lands back on them.
 * @param {Array<[number, number]>} corners
 * @returns {string} The `d` of an SVG path.
 */
function path(corners) {
	const pull = 1 - ROUNDING / (2 * REACH);
	const half = BOX / 2;
	return `${corners
		.map(([x, y], index) => {
			const at = (value) => Number((half + (value - half) * pull).toFixed(1));
			return `${index ? "L" : "M"}${at(x)} ${at(y)}`;
		})
		.join("")}Z`;
}

/** The characters a `url()` in a style attribute can't hold as they are. */
const ESCAPED = /[<>"'=()#&?%\s]/g;

/**
 * Every mask drawn so far. A card is drawn a die at a time and the book rolls
 * six of them, so the same handful of shapes would otherwise be laid out,
 * pathed and escaped again for each one.
 * @type {Map<number, string>}
 */
const MASKS = new Map();

/**
 * The profile as a mask the stylesheet can cut a die out of.
 * @param {number} faces How many faces the die has.
 * @returns {string} A `url()` holding the shape, ready for `mask-image`.
 */
export function dieMask(faces) {
	const sides = Math.trunc(Number(faces));
	const drawn = MASKS.get(sides);
	if (drawn) return drawn;
	const svg =
		`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${BOX} ${BOX}'>` +
		`<path d='${path(dieShape(faces))}' fill='black' stroke='black' ` +
		`stroke-width='${ROUNDING}' stroke-linejoin='round'/></svg>`;
	const encoded = svg.replace(ESCAPED, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
	const mask = `url(data:image/svg+xml,${encoded})`;
	if (Number.isFinite(sides)) MASKS.set(sides, mask);
	return mask;
}
