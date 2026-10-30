/**
 * Round Token pictures: the Shape new Tokens take, the Shape and the Round
 * picture tick kept in step, and the tick in Foundry's Token windows. The
 * cropping itself is BastionlandToken's.
 */
import { COMPANY_FLAG } from "../actions/company.js";
import { t } from "../chat/cards.js";
import { ROUND_FLAG, ROUND_FLAG_PATH, newTokenShape, roundAfterShapeChange } from "../rules/round-tokens.js";
import { SYSTEM_ID } from "../system-id.js";

/** The circle every round picture is cut with, drawn once. */
let circle = null;

/**
 * A white circle filling its texture, soft at the edge, to mask pictures with.
 * @returns {PIXI.Texture}
 */
export function circleTexture() {
	if (circle?.baseTexture && !circle.baseTexture.destroyed) return circle;
	const size = 512;
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = size;
	const context = canvas.getContext("2d");
	context.fillStyle = "#ffffff";
	context.beginPath();
	context.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
	context.fill();
	circle = PIXI.Texture.from(canvas);
	return circle;
}

/**
 * New Tokens on a hex or gridless Scene take the Ellipse shape, to match their round picture.
 * @param {TokenDocument} document
 * @param {object} data
 */
function shapeNewToken(document, data) {
	if (foundry.utils.getProperty(data, `flags.${SYSTEM_ID}.${COMPANY_FLAG}`)) return;
	const shape = newTokenShape({
		gridType: document.parent?.grid?.type,
		shape: data.shape,
		round: foundry.utils.getProperty(data, ROUND_FLAG_PATH)
	});
	if (shape !== undefined) document.updateSource({ shape });
}

/**
 * Setting a Token's Shape to Rectangle shows its picture square, and back to
 * Ellipse shows it round, unless the same save ticks or unticks Round picture.
 * @param {TokenDocument} document
 * @param {object} changes
 */
function followShape(document, changes) {
	// Most updates, a Token's every move among them, leave its Shape alone.
	if (!("shape" in changes)) return;
	const round = roundAfterShapeChange(
		{ round: document.getFlag(SYSTEM_ID, ROUND_FLAG) },
		{ shape: changes.shape, round: foundry.utils.getProperty(changes, ROUND_FLAG_PATH) }
	);
	if (round !== undefined) foundry.utils.setProperty(changes, ROUND_FLAG_PATH, round);
}

/**
 * Put a Round picture tick under Fit in the Appearance tab of a Token's, or an
 * Actor's prototype Token's, configuration.
 * @param {foundry.applications.api.ApplicationV2} app TokenConfig or PrototypeTokenConfig.
 * @param {HTMLElement} element
 */
function addRoundTick(app, element) {
	const token = app.token;
	const flags = token?.flags?.[SYSTEM_ID] ?? {};
	if (flags[COMPANY_FLAG]) return;
	const fit = element.querySelector("[name='texture.fit']")?.closest(".form-group");
	if (!fit || element.querySelector(`[name='${ROUND_FLAG_PATH}']`)) return;

	const id = `${app.id}-${ROUND_FLAG}`;
	const group = document.createElement("div");
	group.className = "form-group slim";
	group.innerHTML = `<label for="${id}"></label><div class="form-fields"><input type="checkbox" id="${id}"></div><p class="hint"></p>`;
	group.querySelector("label").textContent = t("tokenShape.round");
	// A prototype Token has no Shape to set.
	group.querySelector(".hint").textContent = t(app.isPrototype ? "tokenShape.roundHintPrototype" : "tokenShape.roundHint");
	const input = group.querySelector("input");
	input.name = ROUND_FLAG_PATH;
	input.checked = flags[ROUND_FLAG] !== false;
	fit.after(group);
}

export function registerRoundTokenHooks() {
	Hooks.on("preCreateToken", shapeNewToken);
	Hooks.on("preUpdateToken", followShape);
	Hooks.on("renderTokenApplication", addRoundTick);
}
