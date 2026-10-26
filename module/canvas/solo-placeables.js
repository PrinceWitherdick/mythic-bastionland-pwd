import { secretsKeptOn } from "../actions/solo.js";
import { realmFlag } from "../rules/realm-documents.js";
import { hidesKind } from "../rules/solo.js";

/**
 * Foundry draws a hidden Tile or Drawing for every GM. In solo play the Referee
 * is the Company too, so a Realm's hidden Myths, Landmarks and Barriers are kept
 * off their map as off a player's. Anything else hidden, by hand or by another
 * module, is drawn for them as ever.
 */

/**
 * @param {TileDocument|DrawingDocument|null|undefined} document
 * @returns {boolean} Whether it's one of a Realm's secrets, hidden.
 */
const hiddenSecret = (document) => Boolean(document?.hidden) && hidesKind(realmFlag(document)?.kind);

/**
 * @param {PlaceableObject} placeable
 * @returns {boolean} Whether solo play keeps it from this client.
 */
const keptSecret = (placeable) => hiddenSecret(placeable.document) && secretsKeptOn(placeable.document?.parent ?? null);

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

/** The Scene collections whose sidebar tabs could list a secret. */
const SECRET_COLLECTIONS = new Set(["tiles", "drawings"]);

/**
 * Foundry v14's sidebar lists a Scene's Tiles and Drawings for a GM, hidden
 * ones included, by name. Played alone, the Realm's secrets are left off that
 * list as off the map. v13 has no such list, so the hook is never called there.
 * @param {{collectionName?: string}} tab
 * @param {HTMLElement} element
 */
export function leaveSecretsOffList(tab, element) {
	if (!SECRET_COLLECTIONS.has(tab?.collectionName) || !secretsKeptOn()) return;
	const documents = canvas?.scene?.[tab.collectionName];
	for (const row of element?.querySelectorAll?.("[data-entry-id]") ?? []) {
		if (hiddenSecret(documents?.get(row.dataset.entryId))) row.remove();
	}
}

/** Draw Realm Tiles and Drawings with solo play's secrets kept. Called during init. */
export function registerSoloPlaceables() {
	CONFIG.Tile.objectClass = keepingSecrets(CONFIG.Tile.objectClass);
	CONFIG.Drawing.objectClass = keepingSecrets(CONFIG.Drawing.objectClass);
	Hooks.on("renderPlaceableTab", leaveSecretsOffList);
}
