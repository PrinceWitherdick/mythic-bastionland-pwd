import { t } from "../chat/cards.js";
import { seerFolders } from "../rules/seer-npcs.js";
import { loadArtIndex } from "./art-index.js";
import { fillPack } from "./packs.js";

/**
 * The world compendium holding every Seer as an NPC. It's only ever a
 * compendium: nothing copies it into the Actors directory, so a GM drags in
 * the Seers they meet. Players can't open it, as it's the Referee's.
 */
export const SEERS_PACK = Object.freeze({
	name: "bastionland-seers",
	type: "Actor",
	label: "seersPack.label",
	ownership: Object.freeze({ PLAYER: "NONE", TRUSTED: "INHERIT", ASSISTANT: "OWNER" })
});

/** The world setup step that fills it for a world that imported the book before it existed. */
export const SEERS_PACK_STEP = "seersPack";

/**
 * Fill the Seers compendium from the art index, replacing whatever an earlier
 * import put there. GMs only.
 * @param {object|null} index
 * @returns {Promise<number>} How many Seers it holds.
 */
export async function fillSeersPack(index) {
	const folders = seerFolders(index, {
		folder: (d6) => t(`seersPack.folders.${d6}`),
		knighted: (knight, page) => t("seersPack.knighted", { knight, page }),
		attackName: t("attack.title")
	});
	const count = folders.reduce((total, folder) => total + folder.documents.length, 0);
	if (!count) return 0;
	const { label, ...metadata } = SEERS_PACK;
	await fillPack({ ...metadata, label: t(label) }, folders);
	return count;
}

/**
 * A world setup step: fill the Seers compendium once, from the book this world
 * already imported. Import PDF fills it itself from then on, so this is only
 * for a world that imported before the compendium existed.
 * @returns {Promise<boolean>} Always done: there is nothing for a later load to do.
 */
export async function seedSeersPack() {
	if (game.packs.get(`world.${SEERS_PACK.name}`)) return true;
	const index = await loadArtIndex();
	// An index without seer stats can't fill it, and the next Import PDF fills it
	// itself, so the step is finished either way rather than fetching the index again every load.
	if (!index?.seers?.some((seer) => seer.stats)) return true;
	const count = await fillSeersPack(index);
	if (count) ui.notifications.info(t("seersPack.seeded", { count, pack: t(SEERS_PACK.label) }));
	return true;
}
