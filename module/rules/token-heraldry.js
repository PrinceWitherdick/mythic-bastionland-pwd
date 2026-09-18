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
 * @returns {{scale: number, width: number, height: number,
 *   outline: {x: number, y: number}, field: {x: number, y: number},
 *   painting: {x: number, y: number, width: number, height: number}}}
 *   The scale the shield's paths are drawn at, the shield's size, where the
 *   outline's and the field's paths start, and the painting's box.
 */
export function heraldryBadge(art, side = Math.min(art.width, art.height)) {
	const outlineWidth = SHIELD_WIDTH + SHIELD_BORDER * 2;
	const outlineHeight = SHIELD_HEIGHT + SHIELD_BORDER * 2;
	const scale = (side * BADGE_SHARE) / outlineHeight;
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

/**
 * A shield path as drawing steps, moved and scaled. It reads the absolute
 * M, L, H, V, Q, C and Z commands the shield's paths use; H and V become L.
 * @param {string} path
 * @param {number} scale
 * @param {number} dx Added to every x once scaled.
 * @param {number} dy Added to every y once scaled.
 * @returns {Array<[string, ...number[]]>} Such as ["M", 0, 7], ["Q", …], ["Z"].
 */
export function pathSteps(path, scale, dx, dy) {
	const steps = [];
	let [x, y] = [0, 0];
	for (const [, command, args] of path.matchAll(/([MLHVQCZ])([^MLHVQCZ]*)/gi)) {
		if (command !== command.toUpperCase()) throw new Error(`Relative path command "${command}" isn't supported`);
		const numbers = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
		if (command === "Z") {
			steps.push(["Z"]);
			continue;
		}
		if (command === "H") [x] = numbers;
		else if (command === "V") [y] = numbers;
		else [x, y] = numbers.slice(-2);
		const points = command === "H" || command === "V" ? [x, y] : numbers;
		const moved = points.map((value, index) => value * scale + (index % 2 === 0 ? dx : dy));
		steps.push([command === "H" || command === "V" ? "L" : command, ...moved]);
	}
	return steps;
}
