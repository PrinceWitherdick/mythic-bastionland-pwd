import { INK } from "../rules/colour.js";
import { PAINT_MARGIN, PAINTING_HEIGHT, PAINTING_WIDTH, SHIELD_BORDER, SHIELD_OUTLINE_PATH, SHIELD_PATH, coverFit } from "../rules/heraldry.js";

/**
 * The heraldry shield drawn on the canvas: on a Knight's Token, and on the
 * Holdings a Knight rules on the Realm map.
 *
 * It's painted once into a 2D canvas and shown as a picture, not drawn with
 * PIXI shapes and a mask: Foundry's canvas doesn't smooth the edges of shapes
 * or masks, so those came out jagged, and the 2D canvas smooths both the edge
 * and the heraldry shrunk to fit.
 */

/**
 * Canvas pixels painted for each Scene pixel of the shield: enough to stay sharp
 * zoomed in, few enough that shrinking it, zoomed out, keeps its edge smooth.
 */
const PAINT_RESOLUTION = 3;

/** The tallest the painted shield gets, in canvas pixels, however large it's drawn. */
const MAX_PAINT_HEIGHT = 1024;

/**
 * Paint a shield, its ink border and its field painted with a picture, into a 2D canvas.
 * @param {PIXI.Texture} texture The picture.
 * @param {ReturnType<import("../rules/token-heraldry.js").heraldryBadge>} badge Its size.
 * @param {"fill"|"cover"} fit
 * @returns {{canvas: HTMLCanvasElement, perPixel: number}} The canvas, and its pixels to each Scene pixel.
 */
function paintShield(texture, badge, fit) {
	const perPixel = Math.min(PAINT_RESOLUTION, MAX_PAINT_HEIGHT / badge.height);
	// The shield's paths are in their own units, `badge.scale` Scene pixels each.
	const perUnit = badge.scale * perPixel;
	const canvas = document.createElement("canvas");
	canvas.width = Math.ceil(badge.width * perPixel);
	canvas.height = Math.ceil(badge.height * perPixel);
	const context = canvas.getContext("2d");
	context.imageSmoothingQuality = "high";
	context.scale(perUnit, perUnit);
	context.fillStyle = INK;
	context.fill(new Path2D(SHIELD_OUTLINE_PATH));

	const source = texture.baseTexture?.resource?.source;
	if (source) {
		context.translate(SHIELD_BORDER, SHIELD_BORDER);
		context.clip(new Path2D(SHIELD_PATH));
		const area = { width: PAINTING_WIDTH, height: PAINTING_HEIGHT };
		const box = fit === "cover" ? coverFit(texture, area) : { ...area, x: 0, y: 0 };
		const frame = texture.frame ?? { x: 0, y: 0, width: texture.width, height: texture.height };
		context.drawImage(source, frame.x, frame.y, frame.width, frame.height,
			box.x - PAINT_MARGIN, box.y - PAINT_MARGIN, box.width, box.height);
	}
	return { canvas, perPixel };
}

/**
 * Draw a shield, its ink border and its field painted with a picture, into a container.
 * @param {PIXI.Container} container
 * @param {PIXI.Texture} texture
 * @param {ReturnType<import("../rules/token-heraldry.js").heraldryBadge>} badge Where it goes.
 * @param {object} [options]
 * @param {"fill"|"cover"} [options.fit="fill"] "fill" for heraldry painted to the shield's box; "cover" for
 *   any other picture, which keeps its shape and is cut to the shield.
 */
export function drawShield(container, texture, badge, { fit = "fill" } = {}) {
	const { canvas, perPixel } = paintShield(texture, badge, fit);
	// Not mipmapped: the GPU's mipmaps blurred it more than shrinking it straight from the painting.
	const painted = new PIXI.Texture(new PIXI.BaseTexture(canvas, { mipmap: PIXI.MIPMAP_MODES.OFF, scaleMode: PIXI.SCALE_MODES.LINEAR }));
	const shield = container.addChild(new PIXI.Sprite(painted));
	shield.position.set(badge.outline.x, badge.outline.y);
	shield.width = canvas.width / perPixel;
	shield.height = canvas.height / perPixel;
	// Painted for this shield alone, so it goes with it.
	shield.on("destroyed", () => painted.destroy(true));
}
