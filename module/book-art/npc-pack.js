import { t } from "../chat/cards.js";
import { castDetailUpdates, castNotes, cityCastActors, countDocuments, documentsIn, eitherUpdates, mythCastFolders } from "../rules/cast-npcs.js";
import { CAST_FLAG } from "../rules/myth-cast.js";
import { seerFolders } from "../rules/seer-npcs.js";
import { SYSTEM_ID } from "../system-id.js";
import { loadArtIndex } from "./art-index.js";
import { fillPack } from "./packs.js";

/**
 * The world compendium holding the book's NPCs: every Seer, every Myth's Cast
 * and the City Quest's, each in a folder of their own. It's only ever a
 * compendium: nothing copies it into the Actors directory, so a GM drags in
 * whoever the Company meets. Players can't open it, as it's the Referee's.
 */
export const NPC_PACK = Object.freeze({
	name: "bastionland-npcs",
	type: "Actor",
	label: "npcPack.label",
	ownership: Object.freeze({ PLAYER: "NONE", TRUSTED: "INHERIT", ASSISTANT: "OWNER" })
});

/**
 * Open the NPCs compendium, where the Choose from Book window used to be.
 * A world that hasn't imported the book yet has none to open.
 * @returns {CompendiumCollection|null} The compendium, if the world has it.
 */
export function openNpcPack() {
	const pack = game.packs.get(`world.${NPC_PACK.name}`) ?? null;
	pack?.render(true);
	return pack;
}

/** The Seers had a compendium of their own before this one took them in. */
const OLD_PACKS = Object.freeze(["bastionland-seers"]);

/** The world setup step that fills it for a world that imported the book before it existed. */
export const NPC_PACK_STEP = "npcPack";

/** The world setup step that reads attacks printed with "or" as one or the other, for a world imported before. */
export const OR_ATTACKS_STEP = "npcOrAttacks";

/** The world setup step that gives a world imported before them the swarms' scale and the Cast notes. */
export const CAST_DETAILS_STEP = "npcCastDetails";

/** Whether this load has filled the compendium already, so the step above needn't again. */
let filledThisLoad = false;

/**
 * The compendium's folders: the Seers by d6, the Myths by d6 and then by
 * Myth, and the City Quest.
 * @param {object|null} index
 * @returns {{folders: object[], seers: number, cast: number}}
 */
function npcFolders(index) {
	const d6 = (roll) => t(`npcPack.d6.${roll}`);
	const attackName = t("attack.title");
	const seers = seerFolders(index, {
		folder: d6,
		knighted: (knight, page) => t("npcPack.knighted", { knight, page }),
		attackName
	});
	const castWords = {
		folder: d6,
		unnamedMyth: (roll) => t("realm.key.unnamedMyth", { roll }),
		cityQuest: t("cityQuest.title"),
		castOf: (myth, page) => t("npcPack.castOf", { myth, page }),
		attackName
	};
	const myths = mythCastFolders(index, castWords);
	const city = cityCastActors(index, castWords);
	return {
		folders: [
			{ name: t("npcPack.folders.seers"), documents: [], folders: seers },
			{ name: t("npcPack.folders.myths"), documents: [], folders: myths },
			{ name: t("cityQuest.title"), documents: city }
		],
		seers: countDocuments(seers),
		cast: countDocuments(myths) + city.length
	};
}

/**
 * Delete the compendiums this one replaced, now that what they held is in it.
 * They were only ever filled from the book, so nothing is lost that another
 * Import PDF couldn't bring back.
 */
async function dropOldPacks() {
	for (const name of OLD_PACKS) {
		const pack = game.packs.get(`world.${name}`);
		if (!pack) continue;
		try {
			await pack.deleteCompendium();
		} catch (error) {
			console.error(`${SYSTEM_ID} | Couldn't delete the old ${pack.title} compendium`, error);
		}
	}
}

/**
 * Fill the NPCs compendium from the art index, replacing whatever an earlier
 * import put there. GMs only.
 * @param {object|null} index
 * @returns {Promise<{seers: number, cast: number}>} How many of each it holds.
 */
export async function fillNpcPack(index) {
	const { folders, seers, cast } = npcFolders(index);
	if (!seers && !cast) return { seers, cast };
	const { label, ...metadata } = NPC_PACK;
	await fillPack({ ...metadata, label: t(label) }, folders);
	filledThisLoad = true;
	await dropOldPacks();
	return { seers, cast };
}

/**
 * A world setup step: fill the NPCs compendium once, from the book this world
 * already imported. Import PDF fills it itself from then on, so this is only
 * for a world that imported before the compendium existed.
 * @returns {Promise<boolean>} Always done: there is nothing for a later load to do.
 */
export async function seedNpcPack() {
	if (game.packs.get(`world.${NPC_PACK.name}`)) return true;
	const index = await loadArtIndex();
	// An index without their text can't fill it, and the next Import PDF fills it
	// itself, so the step is finished either way rather than fetching the index again every load.
	if (!index) return true;
	const counts = await fillNpcPack(index);
	if (counts.seers || counts.cast) ui.notifications.info(t("npcPack.seeded", { ...counts, pack: t(NPC_PACK.label) }));
	return true;
}

/**
 * A world setup step for a world that imported the book before attacks printed
 * with "or" were read as one or the other, as "Stamp (2d10) or swipe (d10 blast)".
 * The NPCs compendium is filled again from the book's text, and each of a
 * Cast already brought into the world has those attacks marked, keeping
 * everything else about them as it is.
 * @returns {Promise<boolean>} Always done: a world without the book's text has none to mark.
 */
export function markOrAttacks() {
	return patchWorldCast(async (actor, data) => {
		const updates = eitherUpdates([...actor.items], data.items);
		if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
	});
}

/**
 * A world setup step for a world that imported the book before a swarm was
 * one (p61) and before each of a Cast carried what the book says about the
 * whole Cast. The NPCs compendium is filled again, and each of a Cast already
 * in the world is given what it's owed, keeping everything else as it is.
 * @returns {Promise<boolean>} Always done: a world without the book's text has nothing to give.
 */
export function fillCastDetails() {
	let notes = null;
	return patchWorldCast(async (actor, data, index) => {
		notes ??= castNotes(index);
		const update = castDetailUpdates(actor, data, notes.get(actor.getFlag(SYSTEM_ID, CAST_FLAG).myth));
		if (update) await actor.update(update);
	});
}

/**
 * Fill the NPCs compendium again from the book this world imported, unless
 * this load has already, then patch each of a Cast already brought into the
 * world against its stat block as the book gives it now.
 * @param {(actor: Actor, printed: object, index: object) => Promise<void>} patch
 * @returns {Promise<boolean>} Always done: a world without the book's text has none to patch.
 */
async function patchWorldCast(patch) {
	const index = await loadArtIndex();
	if (!index) return true;
	if (!filledThisLoad && game.packs.get(`world.${NPC_PACK.name}`)) await fillNpcPack(index);
	const key = ({ myth, from }) => `${myth}|${from}`;
	const printed = new Map(documentsIn(npcFolders(index).folders)
		.filter((data) => data.flags?.[SYSTEM_ID]?.[CAST_FLAG])
		.map((data) => [key(data.flags[SYSTEM_ID][CAST_FLAG]), data]));
	// Each patches an actor of its own, so they needn't wait on one another.
	await Promise.all(game.actors.map((actor) => {
		const flag = actor.getFlag(SYSTEM_ID, CAST_FLAG);
		const data = flag?.from ? printed.get(key(flag)) : null;
		return data ? patch(actor, data, index) : null;
	}));
	return true;
}
