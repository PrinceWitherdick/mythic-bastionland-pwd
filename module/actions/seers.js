import { findByRoll, loadArtIndex } from "../book-art/art-index.js";
import { warn } from "../chat/cards.js";
import { seerWords } from "../book-art/npc-pack.js";
import { seerForKnight } from "../rules/creation.js";
import { seerActor } from "../rules/seer-npcs.js";
import { SYSTEM_ID } from "../system-id.js";
import { npcFolder } from "./npc-knights.js";

/**
 * A Seer brought into the world as an NPC of their own, from the stat block
 * the book prints on their Knight's page: the Seer at a Sanctum, or the one
 * who knighted a Knight. Their harm is kept on that NPC, as the Knight sheet's
 * Seer page says, and one Seer is made once however many ask for them.
 */

/** The flag marking a Seer's NPC with their roll on the Knights table, such as "3-07". */
export const SEER_FLAG = "seer";

/**
 * A Seer in the art index: by their roll, or else as the Knight they knighted
 * names them, the way that Knight's sheet found them.
 * @param {object|null} index
 * @param {{roll?: string|null, knight?: {seer?: string, knightType?: string}}} which
 * @returns {object|null}
 */
export function seerFor(index, { roll = null, knight = null } = {}) {
	return (roll && findByRoll(index?.seers, roll)) || (knight && seerForKnight(index, knight)) || null;
}

/**
 * Make a Seer into an NPC and open them, or open the one made already. GMs only.
 * @param {{roll?: string|null, knight?: {seer?: string, knightType?: string}}} which
 * @returns {Promise<Actor|null>} Null where the book gives them no stat block, or Import PDF hasn't read it.
 */
export async function makeSeer(which) {
	if (!game.user.isGM) return null;
	const index = await loadArtIndex();
	const seer = seerFor(index, which);
	if (!seer?.stats) {
		warn("seer.noStatBlock");
		return null;
	}
	const made = game.actors.find((actor) => actor.getFlag(SYSTEM_ID, SEER_FLAG) === seer.roll);
	if (made) {
		made.sheet.render({ force: true });
		return made;
	}
	const { sort: _sort, ...data } = seerActor(seer, findByRoll(index?.knights, seer.roll), seerWords(() => ""));
	const folder = await npcFolder();
	const actor = await Actor.implementation.create({ ...data, folder: folder?.id ?? null, flags: { [SYSTEM_ID]: { [SEER_FLAG]: seer.roll } } });
	actor?.sheet.render({ force: true });
	return actor ?? null;
}
