import { t } from "../chat/cards.js";
import { hexOpenable } from "../actions/hex-shared.js";
import { isDrawingRealm, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { openPlaces } from "../apps/TravelsPlaces.js";
import { hexAt } from "../rules/realm-geometry.js";
import { onBoard } from "./board.js";
import { takingMapClick } from "./map-click.js";

/**
 * A double-click on open ground of a Realm opens the Company's places with
 * the hex under it chosen. Foundry does nothing with a double-click there on the
 * Token layer, so players can stay on the Token tools; a double-click on a
 * Token still opens its sheet, and every other layer keeps its own. The
 * Company's Token has no sheet, so its own double-click opens the hex it
 * stands in (BastionlandToken).
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
 * Open a hex in the Company's places, or tell players they know nothing of it.
 * A GM opens any hex, to read and change its Lay of the Land.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {Promise<unknown>|null}
 */
function openHexInPlaces(scene, hex) {
	if (!game.user?.isGM && !hexOpenable(scene, hex)) {
		// Not one of their places, so they know it by its column and row alone.
		ui.notifications.info(t("travels.notVisited", { hex: t("realm.hex", hex) }));
		return null;
	}
	return openPlaces({ sceneId: scene.id, hex });
}

/**
 * A double-click on the Company's Token opens the hex it stands in: its
 * centre's, since the square Token reaches past the hex's corners.
 * @param {Token} token The Company's.
 * @returns {Promise<unknown>|null}
 */
export function onCompanyDoubleClick(token) {
	const scene = token.document?.parent;
	if (!isRealmScene(scene) || isDrawingRealm(scene) || takingMapClick()) return null;
	const hex = hexAt(sceneGeometry(scene), token.center);
	return hex ? openHexInPlaces(scene, hex) : null;
}

/**
 * @param {MouseEvent} event
 * @returns {Promise<unknown>|null}
 */
export function onTravelsDoubleClick(event) {
	const found = travelsClickHex(event);
	return found ? openHexInPlaces(found.scene, found.hex) : null;
}

/** Called during init. */
export function registerTravelsClick() {
	window.addEventListener("dblclick", onTravelsDoubleClick);
}
