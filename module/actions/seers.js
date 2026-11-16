import { warn } from "../chat/cards.js";
import { seerWords } from "../book-art/npc-pack.js";
import { seerForKnight } from "../rules/creation.js";
import { findByRef, refOf } from "../rules/knight-refs.js";
import { SEER_FLAG, seerActor } from "../rules/seer-npcs.js";
import { SYSTEM_ID } from "../system-id.js";
import { knightIndex } from "./knight-index.js";
import { npcFolder } from "./npc-knights.js";

/**
 * A Seer brought into the world as an NPC of their own, from the stat block
 * the book prints on their Knight's page: the Seer at a Sanctum, or the one
 * who knighted a Knight. Their harm is kept on that NPC, as the Knight sheet's
 * Seer page says, and one Seer is made once however many ask for them.
 */

/**
 * A Seer in the art index: by their ref (knight-refs.js), or else as the Knight
 * they knighted names them, the way that Knight's sheet found them. A Seer the
 * Referee wrote is among them where the index came from knightIndex.
 * @param {object|null} index
 * @param {{roll?: string|null, knight?: {seer?: string, knightType?: string}}} which A roll or a written Seer's ref.
 * @returns {object|null}
 */
export function seerFor(index, { roll = null, knight = null } = {}) {
	return (roll && findByRef(index?.seers, roll)) || (knight && seerForKnight(index, knight)) || null;
}

/**
 * Make a Seer into an NPC and open them, or open the one made already. GMs only.
 * @param {{roll?: string|null, knight?: {seer?: string, knightType?: string}}} which
 * @returns {Promise<Actor|null>} Null where the book gives them no stat block, or Import PDF hasn't read it,
 *   or the Referee wrote them no scores.
 */
export async function makeSeer(which) {
	if (!game.user.isGM) return null;
	const index = await knightIndex();
	const seer = seerFor(index, which);
	if (!seer?.stats) {
		warn("seer.noStatBlock");
		return null;
	}
	const ref = refOf(seer);
	const made = game.actors.find((actor) => actor.getFlag(SYSTEM_ID, SEER_FLAG) === ref);
	if (made) {
		made.sheet.render({ force: true });
		return made;
	}
	const { sort: _sort, ...data } = seerActor(seer, findByRef(index?.knights, ref), seerWords(() => ""));
	const folder = await npcFolder();
	// The Seer flag comes with the data, as it does on the compendium's Seers.
	const actor = await Actor.implementation.create({ ...data, folder: folder?.id ?? null });
	actor?.sheet.render({ force: true });
	return actor ?? null;
}
