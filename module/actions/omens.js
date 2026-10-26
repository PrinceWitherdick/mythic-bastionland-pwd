import { REALM_FLAG } from "../rules/realm.js";
import { setOmen } from "../rules/realm-edits.js";
import { completedMythId } from "../rules/season-log.js";
import { SYSTEM_ID } from "../system-id.js";
import { editRealm, editRealmByHand, isRealmScene, sceneGeometry } from "./realm.js";
import { OMENS_OPTION, omensMet, timelineOmens } from "./timeline-events.js";
import { findCompany } from "./wilderness.js";

/**
 * Mark how many of a Myth's Omens have been met, by the Referee's hand. The
 * Tile hooks below write each one met or taken back on the Timeline, where
 * the Company stood.
 * @param {Scene} scene The Realm.
 * @param {number} number The Myth's number.
 * @param {number|((myth: object) => number)} omen How many are met now, or how to tell from the Myth as it stands.
 * @param {object} [options]
 * @param {boolean} [options.byHand] Stepped in Edit this hex, beside the map's Undo, which can take it back.
 * @returns {Promise<boolean>} Whether anything was written.
 */
export async function markMythOmen(scene, number, omen, { byHand = false } = {}) {
	if (!isRealmScene(scene)) return false;
	const { hex } = findCompany(scene, sceneGeometry(scene), { selected: false });
	return (byHand ? editRealmByHand : editRealm)(scene, (realm) => {
		const myth = realm.myths.find((candidate) => candidate.number === number);
		if (!myth) return realm;
		const next = setOmen(realm, number, typeof omen === "function" ? omen(myth) : omen);
		const to = next.myths.find((candidate) => candidate.number === number)?.omen ?? myth.omen;
		return to === myth.omen ? realm : next;
	}, omensMet({ hex }));
}

/**
 * Each Myth's Omen count as it was before an update, carried on its options
 * to after it by the Tile's id. One update can change several Tiles, and
 * Foundry hands every one of them the same options.
 */
const BEFORE_OPTION = "bastionlandOmensBefore";

/**
 * @param {TileDocument} tile
 * @returns {{number: number, d6: number, d12: number, omen?: number}|null} The Myth a Realm's Tile stands for, or null for any other Tile.
 */
function mythOf(tile) {
	const flag = tile.flags?.[SYSTEM_ID]?.[REALM_FLAG];
	return flag?.kind === "myth" && isRealmScene(tile.parent) ? flag : null;
}

/**
 * For `preUpdateTile`: note a Myth's Omen count before a write that may change it.
 * @param {TileDocument} tile
 * @param {object} changes
 * @param {object} options
 */
export function readOmens(tile, changes, options) {
	const myth = changes.flags?.[SYSTEM_ID] ? mythOf(tile) : null;
	// Set or cleared every time, so options passed again to a later update don't carry this one's count.
	const before = options[BEFORE_OPTION] ??= {};
	if (myth) before[tile.id] = { id: completedMythId(tile.parent.id, myth), omen: myth.omen ?? 0 };
	else delete before[tile.id];
}

/**
 * For `updateTile`: a Myth's Omens met or taken back, by whatever wrote them,
 * go on the Timeline: marked by the Referee, met in the Wilderness, heard of
 * at Court, or taken back or put back by Undo and Redo. Where they were met
 * comes in the options, from `omensMet`. Every client hears of an update, but
 * only the one who made it writes, so each Omen is written once. A Tile that
 * stands for another Myth now, as when one is rerolled, writes nothing.
 * @param {TileDocument} tile
 * @param {object} _changes
 * @param {object} options
 * @param {string} userId
 * @returns {Promise<void>|undefined}
 */
export function writeOmens(tile, _changes, options, userId) {
	if (userId !== game.user.id) return;
	const before = options[BEFORE_OPTION];
	const was = before?.[tile.id];
	const myth = was ? mythOf(tile) : null;
	if (!myth || completedMythId(tile.parent.id, myth) !== was.id) return;
	// Written once, even if the hook is heard again.
	delete before[tile.id];
	const to = myth.omen ?? 0;
	if (to !== was.omen) return timelineOmens(tile.parent, myth, { from: was.omen, to, ...options[OMENS_OPTION] });
}
