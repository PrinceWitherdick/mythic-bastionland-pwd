import { inputDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { deletionEntry } from "../compat.js";
import { hiddenTilesIn } from "../rules/realm-documents.js";
import { directionNames, hexKey } from "../rules/realm-geometry.js";
import { MAX_SIGHTED_NOTE, SIGHTED_FLAG, normaliseSighted, sightable, sightedAt, sightingChanges } from "../rules/sighted.js";
import { SYSTEM_ID } from "../system-id.js";
import { COMPANY_MOVED_HOOK } from "./journey.js";
import { hexHiddenByHand, isRealmScene, sceneGeometry } from "./realm.js";
import { keptFromMe } from "./solo.js";

/**
 * Seen from afar (p183, p197, p199): the Referee marks on the players' map
 * that something stands in a neighbouring hex, without saying what, and the
 * Company finds it once it gets there. The rules are in rules/sighted.js, and
 * canvas/sighted-marks.js draws the marks.
 */

/** The kinds of Realm Tile a mark stands for, and that reaching it shows: the Seat's badge goes with its Holding. */
const SIGHTED_KINDS = Object.freeze(["landmark", "holding", "seat"]);

/**
 * @param {Scene|null|undefined} scene
 * @returns {import("../rules/sighted.js").Sightings} The marks on a Realm's map.
 */
export const getSighted = (scene) => normaliseSighted(scene?.flags?.[SYSTEM_ID]?.[SIGHTED_FLAG]);

/**
 * @param {Scene} scene
 * @returns {(hex: {col: number, row: number}) => {holding: boolean}} What the GM hid by hand in each hex.
 */
const handHiddenOn = (scene) => (hex) => hexHiddenByHand(scene, hex);

/**
 * Write the marks that changed, one hex at a time, so a mark set elsewhere at
 * the same moment isn't written over. GMs only.
 * @param {Scene} scene
 * @param {{set: import("../rules/sighted.js").Sightings, drop: string[]}} changes
 * @returns {Promise<boolean>} Whether anything was written.
 */
export async function writeSightings(scene, { set = {}, drop = [] }) {
	if (!game.user.isGM || (!Object.keys(set).length && !drop.length)) return false;
	const path = (key) => `flags.${SYSTEM_ID}.${SIGHTED_FLAG}.${key}`;
	await scene.update(Object.fromEntries([
		...Object.entries(set).map(([key, mark]) => [path(key), mark]),
		...drop.map((key) => deletionEntry(path(key)))
	]));
	return true;
}

/**
 * @param {object} g
 * @param {{direction: number, hex: object, landmark: object|null, holding: object|null}} step
 * @returns {string} A hex seen from afar, as the Referee's window names it: which way, where, and what stands there.
 */
function sightingLabel(g, { direction, hex, landmark, holding }) {
	const what = [
		landmark && [t(`realm.landmarks.${landmark.type}`), landmark.name].filter(Boolean).join(": "),
		holding && (holding.name || t(`realm.holdings.${holding.style}`))
	].filter(Boolean).join(", ");
	return t("seenFromAfar.row", {
		direction: t(`realm.directions.${directionNames(g)[direction]}`),
		hex: t("realm.readout.coordinates", hex),
		// Played alone, the Referee makes out no more than the Company does.
		what: keptFromMe() ? t("solo.somethingThere") : t("realm.readout.hidden", { name: what })
	});
}

/**
 * From a vantage point, offer to mark each neighbouring hex where something
 * stands hidden, as seen from afar (p197): ticked, with room for the few words
 * the Company can make out. Unticking a hex already marked takes its mark away.
 * Nothing is asked where nothing stands hidden around. GMs only.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {import("../rules/realm.js").Realm} options.realm
 * @param {object} options.g
 * @param {{col: number, row: number}} options.where Where the Company stands.
 * @returns {Promise<{set: object, drop: string[]}|null>} What changed, or null when nothing was asked or the window was closed.
 */
export async function offerSightings({ scene, realm, g, where }) {
	if (!game.user.isGM || !isRealmScene(scene)) return null;
	const seen = sightable(realm, g, where, handHiddenOn(scene));
	if (!seen.length) return null;
	const sighted = getSighted(scene);

	const data = await inputDialog({
		title: t("seenFromAfar.title"),
		icon: "fa-solid fa-binoculars",
		template: "sighted",
		context: {
			intro: t("seenFromAfar.intro"),
			rule: t("seenFromAfar.rule"),
			placeholder: t("seenFromAfar.placeholder"),
			maxLength: MAX_SIGHTED_NOTE,
			hexes: seen.map((step, index) => ({
				index,
				label: sightingLabel(g, step),
				note: sightedAt(sighted, step.hex)?.note ?? "",
				noteLabel: t("seenFromAfar.noteLabel", { hex: t("realm.readout.coordinates", step.hex) })
			}))
		},
		ok: { label: t("seenFromAfar.ok"), icon: "fa-solid fa-map-location-dot" }
	});
	if (!data) return null;

	const changes = sightingChanges(sighted, seen.map((step, index) => ({
		hex: step.hex,
		marked: Boolean(data[`sight-${index}`]),
		note: data[`note-${index}`]
	})));
	if (await writeSightings(scene, changes)) {
		const count = Object.keys(changes.set).length;
		if (count) ui.notifications.info(t("seenFromAfar.marked", { count }));
	}
	return changes;
}

/**
 * The Company reaching a hex it saw something in from afar finds what stands
 * there: its Tiles are shown on the players' map, and the mark is taken away.
 * GMs only.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes The hexes the Company came into.
 * @returns {Promise<{col: number, row: number}[]>} Those it found something in.
 */
export async function revealSighted(scene, hexes) {
	if (!game.user.isGM || !isRealmScene(scene) || !hexes?.length) return [];
	const sighted = getSighted(scene);
	const reached = hexes.filter((hex) => sightedAt(sighted, hex));
	if (!reached.length) return [];

	const updates = hiddenTilesIn(scene.tiles, sceneGeometry(scene), SIGHTED_KINDS, reached).map((tile) => ({ _id: tile.id, hidden: false }));
	if (updates.length) await scene.updateEmbeddedDocuments("Tile", updates);
	await writeSightings(scene, { drop: [...new Set(reached.map(hexKey))] });
	if (updates.length) ui.notifications.info(t("seenFromAfar.reached"));
	return reached;
}

/**
 * Notice the Company coming into a hex it saw something in from afar. Heard on
 * the active GM's client alone.
 * @param {Scene} scene
 * @param {{entered: {col: number, row: number}[]}} move
 */
function noticeMove(scene, { entered }) {
	revealSighted(scene, entered).catch((error) => console.error(`${SYSTEM_ID} | Couldn't show what the Company saw from afar`, error));
}

/** Follow the Company to what it saw from afar. Called during init. */
export function registerSightings() {
	Hooks.on(COMPANY_MOVED_HOOK, noticeMove);
}
