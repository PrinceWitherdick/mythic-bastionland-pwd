/**
 * Tokens show their picture cropped to a circle unless someone says otherwise.
 * Only the decisions live here, so they can be tested without a canvas.
 */
import { SYSTEM_ID } from "../system-id.js";

/** Token flag: false when the picture is shown whole, square. Unset means round. */
export const ROUND_FLAG = "roundPicture";

/** Where the flag sits in a Token's or prototype Token's data. */
export const ROUND_FLAG_PATH = `flags.${SYSTEM_ID}.${ROUND_FLAG}`;

/** The Ellipse and Rectangle shapes of Foundry's CONST.TOKEN_SHAPES, the same in v13 and v14. */
const SHAPES = { ELLIPSE_1: 0, ELLIPSE_2: 1, RECTANGLE_1: 4, RECTANGLE_2: 5 };

/** Foundry's CONST.GRID_TYPES.SQUARE. */
const SQUARE_GRID = 1;

/**
 * Whether a Token's picture is cropped to a circle. Foundry's own Dynamic Ring
 * already does that, and the Company's Token keeps the picture it was given.
 * @param {{round?: boolean, ringEnabled?: boolean, isCompany?: boolean}} token
 * @returns {boolean}
 */
export function isRoundPicture({ round, ringEnabled = false, isCompany = false }) {
	return round !== false && !ringEnabled && !isCompany;
}

/**
 * The Shape a new Token takes. A Token dropped from an Actor arrives with
 * Foundry's default, Rectangle, filled in, as no Actor keeps a Shape; it's made
 * an Ellipse, so its border and the hexes it covers match its round picture. A
 * Token copied from one whose picture was made square keeps its Shape, and on a
 * square grid Foundry offers only Rectangle, so it's left alone there.
 * @param {{gridType: number, shape?: number, round?: boolean}} token The Token's grid (one of
 *   CONST.GRID_TYPES), and the Shape and Round picture tick it arrived with.
 * @returns {number|undefined} Ellipse, or undefined to keep the Shape it has.
 */
export function newTokenShape({ gridType, shape, round }) {
	if (gridType === SQUARE_GRID || round === false) return undefined;
	return shape === undefined || shape === SHAPES.RECTANGLE_1 ? SHAPES.ELLIPSE_1 : undefined;
}

/**
 * What a change to a Token's Shape does to its picture: a Rectangle shows it
 * square and an Ellipse round, unless the same change also ticks or unticks
 * Round picture on purpose. The Token Config sends the tick with every save, so
 * only a tick that differs from what the Token showed counts.
 * @param {{round?: boolean}} before The Token as it was.
 * @param {{shape?: number, round?: boolean}} changes The Shape and tick in the change, if they're in it.
 * @returns {boolean|undefined} The tick to write, or undefined to leave the change as it is.
 */
export function roundAfterShapeChange(before, changes) {
	if (changes.shape === undefined) return undefined;
	const wasRound = before.round !== false;
	if (changes.round !== undefined && (changes.round !== false) !== wasRound) return undefined;
	if (changes.shape === SHAPES.ELLIPSE_1 || changes.shape === SHAPES.ELLIPSE_2) return true;
	if (changes.shape === SHAPES.RECTANGLE_1 || changes.shape === SHAPES.RECTANGLE_2) return false;
	return undefined;
}
