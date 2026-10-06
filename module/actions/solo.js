import { t } from "../chat/cards.js";
import { read } from "../client-settings.js";
import { hiddenTilesIn } from "../rules/realm-documents.js";
import { soloRealm } from "../rules/solo.js";
import { SYSTEM_ID } from "../system-id.js";
import { COMPANY_MOVED_HOOK } from "./journey.js";
import { getRealm, isRealmScene, sceneGeometry } from "./realm.js";

/**
 * Solo play: the Referee is the Company too, so the Realm's Myths, Landmarks
 * and Barriers are kept from them until travelling finds them. The rules are
 * in rules/solo.js. Every GM-side screen that would give a secret away asks
 * keptFromMe first.
 */

/** The world setting that turns solo play on. */
export const SOLO_SETTING = "soloPlay";

/** @returns {boolean} Whether this world is played alone. */
export const isSolo = () => read(SOLO_SETTING, false) === true;

/** @returns {boolean} Whether this client is a Referee the Realm's secrets are kept from. */
export const keptFromMe = () => Boolean(game.user?.isGM) && isSolo();

/**
 * @param {object} realm The whole Realm.
 * @returns {object} The Realm as this client may know it.
 */
export const realmKnown = (realm) => (realm && keptFromMe() ? soloRealm(realm) : realm);

/**
 * The Company coming into a Myth's hex finds it: its Tile is shown on the map.
 * GMs only, in solo play.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes The hexes the Company came into.
 * @returns {Promise<object[]>} The Myths found.
 */
async function revealMythsReached(scene, hexes) {
	if (!game.user.isGM || !isSolo() || !isRealmScene(scene) || !hexes?.length) return [];
	const found = hiddenTilesIn(scene.tiles, sceneGeometry(scene), ["myth"], hexes);
	if (!found.length) return [];
	await scene.updateEmbeddedDocuments("Tile", found.map((tile) => ({ _id: tile.id, hidden: false })));
	const myths = getRealm(scene)?.realm.myths.filter((myth) => found.some((tile) => tile.id === myth.id)) ?? [];
	for (const myth of myths) ui.notifications.info(t("solo.mythFound", { number: myth.number }));
	return myths;
}

/**
 * @param {Scene} scene
 * @param {{entered: {col: number, row: number}[]}} move
 */
function noticeMove(scene, { entered }) {
	revealMythsReached(scene, entered).catch((error) => console.error(`${SYSTEM_ID} | Couldn't show the Myth the Company found`, error));
}

/** Draw the map again, and the windows that show the Realm, when solo play is turned on or off. */
function redrawForSolo() {
	for (const layer of [canvas?.tiles, canvas?.drawings]) {
		for (const placeable of layer?.placeables ?? []) placeable.renderFlags.set({ refreshState: true });
	}
	for (const app of foundry.applications.instances.values()) {
		if (app.rendered && app.options?.classes?.includes(SYSTEM_ID)) app.render();
	}
	// The players list carries the Solo Play tag.
	ui.players?.render();
}

/** Register the setting and follow the Company. Called during init. */
export function registerSolo() {
	game.settings.register(SYSTEM_ID, SOLO_SETTING, {
		name: "bastionland.solo.setting.name",
		hint: "bastionland.solo.setting.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		onChange: redrawForSolo
	});
	Hooks.on(COMPANY_MOVED_HOOK, noticeMove);
}
