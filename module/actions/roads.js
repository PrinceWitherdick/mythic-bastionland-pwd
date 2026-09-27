import { postCard, t } from "../chat/cards.js";
import { cruiseReach } from "../rules/cruise.js";
import { TERRAIN, terrainAt } from "../rules/realm.js";
import { hexKey, inRealm, parseHexKey } from "../rules/realm-geometry.js";
import { SYSTEM_ID } from "../system-id.js";
import { getRealm, isRealmScene, sceneGeometry } from "./realm.js";

/**
 * The Realm's proper roads (p18), rarely found, which the Referee marks hex by
 * hex, and the Cruise they allow. Kept on the Realm Scene's own flag, apart
 * from the map's drawing, since nothing draws them.
 */

/** The Scene flag listing each road hex by hexKey. */
const ROADS_FLAG = "roads";

/**
 * @param {Scene} scene
 * @returns {string[]} Each road hex, by hexKey, inside the Realm.
 */
export function getRoads(scene) {
	if (!isRealmScene(scene)) return [];
	const g = sceneGeometry(scene);
	const roads = scene.getFlag(SYSTEM_ID, ROADS_FLAG);
	return Array.isArray(roads) ? roads.filter((key) => inRealm(g, parseHexKey(key))) : [];
}

/**
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {boolean} Whether a proper road runs through the hex.
 */
export const hasRoad = (scene, hex) => getRoads(scene).includes(hexKey(hex));

/**
 * Mark a proper road through a hex, or take it away. GMs only.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {boolean} road
 */
export async function setRoad(scene, hex, road) {
	if (!game.user.isGM || !isRealmScene(scene)) return;
	const key = hexKey(hex);
	const roads = getRoads(scene).filter((each) => each !== key);
	if (road) roads.push(key);
	await scene.setFlag(SYSTEM_ID, ROADS_FLAG, roads);
}

/**
 * Where a Cruise can take the Company from a hex in one Phase (p18): 3 Hexes
 * by boat along the rivers and lakes, or by steed along a proper road. Told to
 * the Referee, who moves the Company. GMs only.
 * @param {{scene: Scene, hex: {col: number, row: number}}} where
 * @returns {Promise<object|null>}
 */
export async function cruiseFrom({ scene, hex }) {
	if (!game.user.isGM || !isRealmScene(scene) || !hex) return null;
	const { realm } = getRealm(scene);
	const g = sceneGeometry(scene);
	const reach = cruiseReach(realm, g, hex, getRoads(scene));
	const place = ({ hex: there, steps }) => {
		const terrain = terrainAt(realm, g, there);
		return t("cruise.place", { hex: t("realm.hex", there), terrain: terrain ? t(`realm.terrain.${TERRAIN[terrain - 1]}`) : "", steps });
	};
	const entries = [
		...(reach.boat.length ? [{ name: t("cruise.boat"), lines: reach.boat.map(place) }] : []),
		...(reach.road.length ? [{ name: t("cruise.road"), lines: reach.road.map(place) }] : [])
	];
	await postCard(null, "report", {
		title: t("cruise.title"),
		tagline: t("realm.hex", hex),
		entries,
		hint: entries.length ? t("cruise.hint") : t("cruise.nowhere")
	}, { mode: "gm" });
	return reach;
}
