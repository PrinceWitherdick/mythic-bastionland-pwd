import { t } from "../chat/cards.js";
import { hexOpenable } from "../actions/hex-shared.js";
import { isDrawingRealm, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { openTravelsHex } from "../apps/TravelsHex.js";
import { hexAt } from "../rules/realm-geometry.js";
import { onBoard } from "./board.js";
import { takingMapClick } from "./map-click.js";

/**
 * A double-click on open ground of a Realm opens what the Company knows of
 * the hex under it. Foundry does nothing with a double-click there on the
 * Token layer, so players can stay on the Token tools; a double-click on a
 * Token still opens its sheet, and every other layer keeps its own.
 */

/**
 * @returns {boolean} Whether a Token, or anything the layer in hand has under the pointer, would take the double-click.
 */
function somethingUnderPointer() {
	if (canvas.activeLayer?.hover || canvas.tokens?.hover) return true;
	const { x, y } = canvas.mousePosition ?? {};
	return (canvas.tokens?.placeables ?? []).some((token) => token.visible && token.bounds?.contains?.(x, y));
}

/**
 * The hex a double-click opens, or why it opens nothing.
 * @param {Event} event
 * @returns {{scene: Scene, hex: {col: number, row: number}}|null}
 */
export function travelsClickHex(event) {
	if (!onBoard(event) || !canvas?.ready) return null;
	const scene = canvas.scene;
	if (!isRealmScene(scene) || isDrawingRealm(scene)) return null;
	// Only on the Token tools, which do nothing with it on open ground; other layers, such as the
	// Journal Notes', and the GM's own Realm tools, have uses of their own for it.
	if (!canvas.tokens || canvas.activeLayer !== canvas.tokens) return null;
	if (takingMapClick() || somethingUnderPointer()) return null;
	const hex = hexAt(sceneGeometry(scene), canvas.mousePosition);
	return hex ? { scene, hex } : null;
}

/**
 * @param {MouseEvent} event
 * @returns {Promise<unknown>|null}
 */
export function onTravelsDoubleClick(event) {
	const found = travelsClickHex(event);
	if (!found) return null;
	const { scene, hex } = found;
	if (!hexOpenable(scene, hex)) {
		ui.notifications.info(t("travels.notVisited", { hex: t("realm.hex", hex) }));
		return null;
	}
	return openTravelsHex({ scene, hex });
}

/** Called during init. */
export function registerTravelsClick() {
	window.addEventListener("dblclick", onTravelsDoubleClick);
}
