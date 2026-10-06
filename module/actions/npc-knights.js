import { findByRoll } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { STANDARD_KIT, knightItems, knightUpdate, startFor } from "../rules/creation.js";
import { rollKnightName } from "../rules/knight-names.js";
import { kitWeaponNames } from "./abilities.js";
import { flaggedFolder } from "./folders.js";
import { worldKnights } from "./knights.js";
import { createKnightWithCompanions, rollStartScores } from "./new-knight.js";

/**
 * Knights the Referee plays: one of the book's Knights made into an actor
 * for a part in the Realm, such as ruling a Holding, rather than for a
 * player. They're made as the Knight chooser makes one, rolled with the Ruler
 * Start's dice (p6), and kept in the Actors directory's NPCs folder, apart
 * from the Company.
 */

/** The flag that marks the Actors folder NPCs are kept in, so renaming or moving it is safe. */
export const NPC_FOLDER_FLAG = "npcFolder";

/**
 * The Actors folder for NPCs, made the first time one is needed.
 * @returns {Promise<Folder|null>}
 */
export const npcFolder = () => flaggedFolder("Actor", NPC_FOLDER_FLAG, true, { name: t("npcFolder.name") });

/**
 * Make one of the book's Knights into an actor the Referee plays: a name of
 * their own, Virtues and GD rolled as a Ruler's, and their Property, Ability,
 * Passion, Seer and steed as the book gives them. GMs only.
 * @param {string} roll Their roll on the Knights table, such as "3-07".
 * @param {object|null} index The art index.
 * @returns {Promise<Actor|null>}
 */
export async function makeNpcKnight(roll, index) {
	if (!game.user.isGM) return null;
	const knight = findByRoll(index?.knights, roll);
	const seer = knight ? findByRoll(index?.seers, roll) : null;
	const start = startFor("ruler");
	const { scores } = await rollStartScores(start);
	const update = knightUpdate({ start, virtues: scores, guard: scores.guard, knight, seer });
	const kitNames = Object.fromEntries(STANDARD_KIT.map(({ key }) => [key, t(`chooser.kit.${key}`)]));
	const items = knightItems(knight, kitNames, kitWeaponNames());
	const folder = (await npcFolder())?.id ?? null;
	const name = rollKnightName(Math.random, worldKnights().map((actor) => actor.name));
	return createKnightWithCompanions({ name, update, items, folder });
}
