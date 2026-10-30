import { INK_HEX } from "../rules/colour.js";
import { SHIELD_OUTLINE_PATH, SHIELD_PATH, coverFit } from "../rules/heraldry.js";
import { pathSteps } from "../rules/token-heraldry.js";

/**
 * The heraldry shield drawn on the canvas: on a Knight's Token, and on the
 * Holdings a Knight rules on the Realm map.
 */

/**
 * Trace a shield path onto a Graphics, already begun with a fill or line.
 * @param {PIXI.Graphics} graphics
 * @param {string} path
 * @param {number} scale
 * @param {{x: number, y: number}} at
 */
function traceShield(graphics, path, scale, at) {
	for (const [command, ...points] of pathSteps(path, scale, at.x, at.y)) {
		if (command === "M") graphics.moveTo(...points);
		else if (command === "L") graphics.lineTo(...points);
		else if (command === "Q") graphics.quadraticCurveTo(...points);
		else if (command === "C") graphics.bezierCurveTo(...points);
		else graphics.closePath();
	}
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
	const outline = container.addChild(new PIXI.Graphics());
	outline.beginFill(INK_HEX);
	traceShield(outline, SHIELD_OUTLINE_PATH, badge.scale, badge.outline);
	outline.endFill();

	const area = badge.painting;
	const box = fit === "cover" ? coverFit(texture, { width: area.width, height: area.height }) : { ...area, x: 0, y: 0 };
	const painting = container.addChild(new PIXI.Sprite(texture));
	painting.position.set(area.x + box.x, area.y + box.y);
	painting.width = box.width;
	painting.height = box.height;
	const field = container.addChild(new PIXI.Graphics());
	field.beginFill(0xffffff);
	traceShield(field, SHIELD_PATH, badge.scale, badge.field);
	field.endFill();
	painting.mask = field;
}
