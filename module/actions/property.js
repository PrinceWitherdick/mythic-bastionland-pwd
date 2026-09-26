import { loadArtIndex } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { knightEntryByType } from "../rules/knight-tables.js";
import { companionActorData, knightCompanions, nameWithoutOwner, ownerOf, possessionDetails, retypedProperty } from "../rules/property.js";
import { BREED_FLAG, steedBreedShown } from "../rules/steeds.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * The world setup step that reads older Knights' Property into weapons and
 * armour, and makes their steeds NPCs they ride.
 */
export const KNIGHT_PROPERTY_STEP = "knightPropertyAndSteeds";

/**
 * The world setup step that takes their Knight's name back off the companions
 * made when a steed was called "Charger (Sir Bardolf)". Their own sheet names
 * their owner now, so the name needn't, and what the book called a steed goes
 * under the name instead.
 */
export const COMPANION_NAMES_STEP = "companionNames";

/**
 * The world setup step that gives Knights made before the Property reader
 * knew counts, restocks, armour conditions, second ways to fight, wood and
 * bucklers, those details from their book lines.
 */
export const POSSESSION_DETAILS_STEP = "possessionDetails";

/** The flag on an NPC made from a Knight's gear: the Knight's id. */
export const COMPANION_FLAG = "companionOf";

/**
 * @typedef {object} MadeCompanions
 * @property {Actor[]} made The NPCs made.
 * @property {string|null} steed The uuid of the one the Knight rides, for their `system.steed`.
 * @property {Set<object>} gone The entries of the items given whose lines go.
 */

/**
 * Make NPCs of the companions a Knight carries as lines of gear, such as
 * their steed and a hawk, with their trample and attacks as weapons. The
 * steed becomes the one the Knight rides, so its trample joins a mounted
 * charge (p10), and its line goes, as the sheet shows the Steed on its own.
 * Each NPC goes in the Knight's folder, owned as the Knight is, and is marked
 * as the Knight's so choosing the Knight again clears them away (see `COMPANION_FLAG`).
 *
 * This runs before the Knight's items are saved, so a line that goes is never
 * made and the steed is set in the same update as everything else: leave the
 * entries in `gone` out, and put `steed` in `system.steed`.
 * @param {{type: string, name: string, system?: object}[]} items The Knight's items, saved or still item data.
 * @param {object} knight Where the NPCs belong; nothing when the Knight isn't made yet.
 * @param {string|null} [knight.folder] The id of the Knight's folder.
 * @param {object} [knight.ownership] The Knight's ownership, which a GM hands on.
 * @param {string} [knight.id] The Knight's id, when already made. Otherwise mark the NPCs with `markCompanions`.
 * @param {object} [options]
 * @param {boolean} [options.steedOnly] Only the steed.
 * @returns {Promise<MadeCompanions>}
 */
export async function makeCompanions(items, { folder = null, ownership, id } = {}, { steedOnly = false } = {}) {
	const none = { made: [], steed: null, gone: new Set() };
	const lines = items.map((item, index) => ({ id: index, type: item.type, name: item.name, system: item.system ?? {} }));
	const carried = knightCompanions(lines, { steedOnly });
	if (!carried.length) return none;
	if (!game.user.can("ACTOR_CREATE")) {
		ui.notifications.warn(t("steed.cannotCreate", { names: carried.map(({ companion }) => companion.name).join(", ") }));
		return none;
	}

	// A player who makes an actor owns it already; only a GM hands it on.
	const handed = game.user.isGM && ownership ? foundry.utils.deepClone(ownership) : undefined;
	const made = await Actor.implementation.create(carried.map(({ companion, steed }) => ({
		...companionActorData(companion, { trampleName: t("steed.trample") }),
		// Its own name only: whose companion it is, its sheet says.
		name: companion.name,
		folder,
		...(handed ? { ownership: handed } : {}),
		flags: {
			[SYSTEM_ID]: {
				// What the book called the steed, kept under a name its Knight gives it later.
				...(steed ? { [BREED_FLAG]: companion.name } : {}),
				...(id ? { [COMPANION_FLAG]: id } : {})
			}
		}
	})));
	return {
		made,
		steed: made[carried.findIndex((entry) => entry.steed)]?.uuid ?? null,
		gone: new Set(carried.filter(({ keepLine }) => !keepLine).map(({ itemId }) => items[itemId]))
	};
}

/**
 * @param {Actor} actor A Knight already made.
 * @returns {{folder: string|null, ownership: object, id: string}} Where their companions belong.
 */
export const knightOwner = (actor) => ({ folder: actor.folder?.id ?? null, ownership: actor.ownership, id: actor.id });

/**
 * Mark NPCs made before their Knight was as that Knight's.
 * @param {Actor[]} made
 * @param {Actor} knight
 * @returns {Promise<unknown>}
 */
export function markCompanions(made, knight) {
	if (!made.length) return Promise.resolve();
	return Actor.implementation.updateDocuments(made.map((npc) => ({ _id: npc.id, [`flags.${SYSTEM_ID}.${COMPANION_FLAG}`]: knight.id })));
}

/**
 * Delete the NPCs made for a Knight from their gear, as their gear is replaced.
 * Those this user can't delete stay.
 * @param {Actor} knight
 * @returns {Promise<string[]>} The uuids of those deleted.
 */
export async function clearCompanions(knight) {
	const made = game.actors.filter((npc) => npc.getFlag(SYSTEM_ID, COMPANION_FLAG) === knight.id && npc.canUserModify(game.user, "delete"));
	if (!made.length) return [];
	await Actor.implementation.deleteDocuments(made.map((npc) => npc.id));
	return made.map((npc) => npc.uuid);
}

/**
 * Read one older Knight's Property, and make the steed they don't ride yet.
 * @param {Actor} actor A Knight.
 * @returns {Promise<boolean>} Whether anything changed.
 */
async function retypeKnight(actor) {
	const items = actor.items.map((item) => ({ id: item.id, type: item.type, name: item.name, sort: item.sort, system: item.system }));
	const retyped = retypedProperty(items);
	let { remove, create } = retyped;
	let steed = null;
	if (!(actor.system.steed && fromUuidSync(actor.system.steed))) {
		// The steed is looked for among the items as they will be once retyped.
		const kept = items.filter((item) => !remove.includes(item.id));
		const companions = await makeCompanions([...kept, ...create], knightOwner(actor), { steedOnly: true });
		steed = companions.steed;
		remove = [...remove, ...kept.filter((item) => companions.gone.has(item)).map((item) => item.id)];
		create = create.filter((item) => !companions.gone.has(item));
	}
	if (create.length) await actor.createEmbeddedDocuments("Item", create);
	if (remove.length) await actor.deleteEmbeddedDocuments("Item", remove);
	if (steed) await actor.update({ "system.steed": steed });
	return Boolean(retyped.remove.length || steed);
}

/**
 * A world setup step. Knights made before their Property was read carry each
 * line of it as one piece of gear, so their mail and shields add no Armour,
 * their weapons roll no dice, and their steed can't charge. Each such line,
 * untouched since, becomes the weapons, armour and gear it lists, and a Knight
 * who rides nothing yet gets their steed as an NPC. Each Knight is read at
 * once, as none depends on another.
 * @returns {Promise<void>}
 */
export async function retypeKnightProperty() {
	const knights = game.actors.filter((candidate) => candidate.type === "knight");
	const changed = await Promise.all(knights.map((actor) => retypeKnight(actor).catch((error) => {
		console.error(`${SYSTEM_ID} | Couldn't read ${actor.uuid}'s Property`, error);
		return false;
	})));
	const count = changed.filter(Boolean).length;
	if (count) ui.notifications.info(t("item.retyped", { count }));
}

/**
 * A world setup step. A Knight's steed and other companions used to carry the
 * Knight's name in brackets, where their own sheet now says who owns them, so
 * take it back off those whose name still ends in it, and put what the book
 * called a steed renamed by its Knight under the name instead. One renamed
 * since keeps the name it was given, as does one that already says what it is,
 * and one this user can't write is left to a GM.
 * @returns {Promise<void>}
 */
export async function dropOwnerFromCompanionNames() {
	const actors = game.actors.contents;
	const knights = actors.filter((actor) => actor.type === "knight");
	const changes = [];
	for (const actor of actors) {
		// Only actors of this world, which can be written in one go.
		if (actor.type === "knight" || actor.pack || !actor.canUserModify(game.user, "update")) continue;
		const owner = ownerOf(knights, { uuid: actor.uuid, companionOf: actor.getFlag(SYSTEM_ID, COMPANION_FLAG) });
		if (!owner) continue;
		const name = nameWithoutOwner(actor.name, owner.name);
		const was = actor.system.epithet;
		const epithet = "epithet" in actor.system && !was ? steedBreedShown(name, actor.getFlag(SYSTEM_ID, BREED_FLAG)) : was;
		const change = {
			...(name === actor.name ? {} : { name }),
			...(epithet && epithet !== was ? { "system.epithet": epithet } : {})
		};
		if (Object.keys(change).length) changes.push({ _id: actor.id, ...change });
	}
	if (!changes.length) return;
	await Actor.implementation.updateDocuments(changes);
	ui.notifications.info(t("item.companionsRenamed", { count: changes.length }));
}

/**
 * A world setup step. Knights made before the Property reader knew how many
 * javelins they carry, which titan beads come back each Season, or that a
 * brutal plate only counts when Wounded, get it from their book lines, where
 * their items don't say otherwise already. A world that hasn't imported the
 * book has no lines to read, and its Knights were written by hand.
 * @returns {Promise<void>}
 */
export async function fillPossessionDetails() {
	const index = await loadArtIndex().catch(() => null);
	if (!index) return;
	for (const actor of game.actors) {
		if (actor.type !== "knight" || !actor.canUserModify(game.user, "update")) continue;
		const entry = knightEntryByType(index, actor.system.knightType);
		if (!entry?.property?.length) continue;
		const updates = possessionDetails(actor.items.contents, entry.property);
		if (updates.length) await actor.updateEmbeddedDocuments("Item", updates).catch((error) => {
			console.error(`${SYSTEM_ID} | Couldn't fill in ${actor.uuid}'s possessions`, error);
		});
	}
}
