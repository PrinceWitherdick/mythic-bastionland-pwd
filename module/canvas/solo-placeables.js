import { keptFromMe } from "../actions/solo.js";
import { realmFlag } from "../rules/realm-documents.js";
import { hidesKind } from "../rules/solo.js";

/**
 * Foundry draws a hidden Tile or Drawing for every GM. In solo play the Referee
 * is the Company too, so a Realm's hidden Myths, Landmarks and Barriers are kept
 * off their map as off a player's. Anything else hidden, by hand or by another
 * module, is drawn for them as ever.
 */

/**
 * @param {PlaceableObject} placeable
 * @returns {boolean} Whether solo play keeps it from this client.
 */
const keptSecret = (placeable) => Boolean(placeable.document?.hidden) && hidesKind(realmFlag(placeable.document)?.kind) && keptFromMe();

/**
 * @param {typeof PlaceableObject} Base The class Foundry, or a module, draws them with.
 * @returns {typeof PlaceableObject} One that leaves solo play's secrets out.
 */
const keepingSecrets = (Base) =>
	class extends Base {
		/** @override */
		get isVisible() {
			return !keptSecret(this) && super.isVisible;
		}
	};

/** Draw Realm Tiles and Drawings with solo play's secrets kept. Called during init. */
export function registerSoloPlaceables() {
	CONFIG.Tile.objectClass = keepingSecrets(CONFIG.Tile.objectClass);
	CONFIG.Drawing.objectClass = keepingSecrets(CONFIG.Drawing.objectClass);
}
