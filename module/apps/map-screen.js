/**
 * Where the Realm's map lies on screen, and how the things held against it are
 * scaled and placed: the rules panels at its edges, the Place the Company
 * button over its top, the Finish button under its foot, and the window a
 * freshly rolled Realm is looked over in. None of these is a window of
 * Foundry's, so each is laid out against the canvas by hand as the map is
 * panned and zoomed. Kept apart from the panels themselves so anything that
 * needs a measurement can take one without loading a window class.
 */
import { textSizeScale } from "../client-settings.js";
import { travelRulesPlacement } from "../rules/travel-rules.js";

/**
 * @returns {{left: number, top: number, right: number, bottom: number}|null} Where the Scene's map is on
 *   screen, in CSS pixels, or null while the canvas isn't ready.
 */
export function mapOnScreen() {
	const rect = canvas?.ready ? canvas.dimensions?.sceneRect : null;
	if (!rect) return null;
	// As Foundry lines its HUD up with the canvas.
	const origin = canvas.primary.getGlobalPosition();
	const zoom = canvas.stage.scale.x;
	return {
		left: origin.x + (rect.x * zoom),
		top: origin.y + (rect.y * zoom),
		right: origin.x + ((rect.x + rect.width) * zoom),
		bottom: origin.y + ((rect.y + rect.height) * zoom)
	};
}

/** @returns {number} The interface scale. Foundry sets it on the body itself, which is cheaper to read on every pan than computed style. */
export const interfaceScale = () => Number.parseFloat(document.body.style.getPropertyValue("--ui-scale")) || 1;

/**
 * Nothing held against the map is a window, so Text Size can't zoom it as it
 * zooms the system's pages: these are scaled where they stand instead, by the
 * same transform that takes Foundry's interface scale. The stylesheet draws
 * them at this scale and the placing reads it back, so they stay against the
 * map's edge however large the writing is.
 * @returns {number}
 */
export const mapPanelScale = () => interfaceScale() * textSizeScale();

/**
 * The top of the hotbar, which nothing held under the map may go below. The
 * bar is measured rather than assumed: a user who has hidden it leaves the
 * foot of the window instead.
 * @returns {number} In CSS pixels.
 */
export function hotbarFloor() {
	const hotbar = document.getElementById("hotbar")?.getBoundingClientRect();
	return hotbar?.height ? hotbar.top : window.innerHeight;
}

/**
 * Hold a panel against one edge of the Realm's map, level with its top and as
 * tall as it.
 * @param {HTMLElement|null|undefined} element
 * @param {"left"|"right"} side
 * @param {ReturnType<typeof mapOnScreen>} [map]
 */
export function placeBesideMap(element, side, map = mapOnScreen()) {
	if (!element || !map) return;
	const scale = mapPanelScale();
	// Layout width, which neither the interface scale nor Text Size changes: both are one transform on it.
	const width = element.offsetWidth;
	const { left, top, maxHeight } = travelRulesPlacement(map, { side, width, scale });

	const { style } = element;
	style.left = `${left}px`;
	style.top = `${top}px`;
	// That scale is a transform, so the height it may grow to is set before scaling.
	style.setProperty("--travel-rules-max-height", `${maxHeight / scale}px`);
}
