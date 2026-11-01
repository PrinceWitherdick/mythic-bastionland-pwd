/**
 * The badge a Knight's Token wears at its top right: the shield from their
 * sheet, painted with their heraldry. Only the geometry lives here, so it can
 * be tested without a canvas.
 */
import { PAINT_MARGIN, PAINTING_HEIGHT, PAINTING_WIDTH, SHIELD_BORDER, SHIELD_HEIGHT, SHIELD_WIDTH } from "./heraldry.js";

/** The shield's height, as a share of the Token's shorter side. */
export const BADGE_SHARE = 0.36;

/** How far the shield hangs past the picture's top and right edges, as a share of its width. */
export const BADGE_OVERHANG = 0.1;

/**
 * Where the badge goes on a Token, in the Token's own pixels: at the top
 * right of the picture it shows, which can be narrower than the Token.
 * @param {{x: number, y: number, width: number, height: number}} art The picture's box.
 * @param {number} [side] The Token's shorter side, which sizes the shield.
 * @param {{share?: number}} [size] The shield's height as a share of `side`: a Token's by default.
 * @returns {{scale: number, width: number, height: number,
 *   outline: {x: number, y: number}, field: {x: number, y: number},
 *   painting: {x: number, y: number, width: number, height: number}}}
 *   The scale the shield's paths are drawn at, the shield's size, where the
 *   outline's and the field's paths start, and the painting's box.
 */
export function heraldryBadge(art, side = Math.min(art.width, art.height), { share = BADGE_SHARE } = {}) {
	const outlineWidth = SHIELD_WIDTH + SHIELD_BORDER * 2;
	const outlineHeight = SHIELD_HEIGHT + SHIELD_BORDER * 2;
	const scale = (side * share) / outlineHeight;
	const overhang = outlineWidth * scale * BADGE_OVERHANG;
	const outline = { x: art.x + art.width - outlineWidth * scale + overhang, y: art.y - overhang };
	const field = { x: outline.x + SHIELD_BORDER * scale, y: outline.y + SHIELD_BORDER * scale };
	const painting = {
		x: field.x - PAINT_MARGIN * scale,
		y: field.y - PAINT_MARGIN * scale,
		width: PAINTING_WIDTH * scale,
		height: PAINTING_HEIGHT * scale
	};
	return { scale, width: outlineWidth * scale, height: outlineHeight * scale, outline, field, painting };
}
