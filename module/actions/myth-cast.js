/**
 * Keeping a Myth's Cast: making the book's stat blocks into actors marked as
 * that Myth's, and putting an actor of the GM's own in or out of one.
 */
import { t } from "../chat/cards.js";
import { isTableRoll } from "../rules/book-art.js";
import { CAST_FLAG, CITY_CAST } from "../rules/myth-cast.js";
import { mythReference } from "../rules/realm.js";
import { SYSTEM_ID } from "../system-id.js";
import { actorData } from "./npc.js";

export { CITY_CAST };

/** The actor types a Cast is made of, which are collected by name as well as by their flag. */
const CAST_TYPES = ["npc", "structure"];

/**
 * Which Cast an actor would belong to: the Myth's roll on the Myths table, or,
 * for a Myth whose dice aren't one, its place in the Realm it belongs to.
 * @param {Scene|null} scene The Realm.
 * @param {{number: number, d6: number, d12: number}} myth
 * @returns {string}
 */
export const castKey = (scene, myth) => (isTableRoll(myth) ? mythReference(myth).roll : `${scene?.id ?? ""}:${myth.number}`);

/**
 * @param {Actor} actor
 * @returns {boolean} Whether it could be in a Cast, so a change to it redraws them.
 */
export const couldJoinCast = (actor) => CAST_TYPES.includes(actor?.type) || Boolean(actor?.getFlag?.(SYSTEM_ID, CAST_FLAG));

/**
 * Every actor a Cast could gather, as the rules read one.
 * @returns {import("../rules/myth-cast.js").CastActor[]}
 */
export function castActors() {
	return game.actors.filter(couldJoinCast).map((actor) => {
		const flag = actor.getFlag(SYSTEM_ID, CAST_FLAG) ?? null;
		return {
			uuid: actor.uuid,
			name: actor.name,
			img: actor.img ?? null,
			flagged: Boolean(flag),
			myth: flag?.myth ?? null,
			from: flag?.from ?? null
		};
	});
}

/**
 * The Actors folder a Cast is kept in, named after its Myth and made when it's
 * missing. It's found by the Cast's flag, so a GM may rename or move it and
 * whoever is made next still lands in it. A folder nobody may make (a player
 * pressing the button) leaves the actor unfiled rather than unmade.
 * @param {string} key Which Cast, from `castKey`.
 * @param {string|null} name What to call the folder: the Myth's name.
 * @returns {Promise<Folder|null>}
 */
async function castFolder(key, name) {
	const found = game.folders.find((folder) => folder.type === "Actor" && folder.getFlag(SYSTEM_ID, CAST_FLAG) === key);
	if (found) return found;
	if (!name) return null;
	try {
		return await foundry.utils.getDocumentClass("Folder").create({
			name,
			type: "Actor",
			flags: { [SYSTEM_ID]: { [CAST_FLAG]: key } }
		});
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't make a folder for the Cast of ${name}`, error);
		return null;
	}
}

/**
 * Make one of a Cast: an NPC, or a Structure for a stat block that is one,
 * marked as belonging to this Myth, wearing its picture and filed in its folder.
 * @param {{printed: string, name: string, stats: object|null, lines: string[]}} member
 * @param {object} options
 * @param {string} options.key  Which Cast, from `castKey`.
 * @param {string|null} [options.img] The Myth's picture.
 * @param {string|null} [options.myth] The Myth's name, which its folder takes.
 * @returns {Promise<Actor|null>}
 */
export async function makeCastMember(member, { key, img = null, myth = null }) {
	const folder = await castFolder(key, myth);
	return Actor.implementation.create(castMemberData(member, { key, img, folder: folder?.id ?? null }));
}

/**
 * What one of them is made from, without making them.
 * @param {object} member One of `gatherCast`'s members.
 * @param {object} options
 * @param {string} options.key Which Cast, from `castKey`.
 * @param {string|null} [options.img] The Myth's picture.
 * @param {string|null} [options.folder] The folder to file them in.
 * @returns {object} The actor to create.
 */
function castMemberData(member, { key, img = null, folder = null }) {
	const data = actorData({ name: member.printed, stats: member.stats, lines: member.lines });
	return {
		name: data.name || member.name,
		type: data.type,
		...(img ? { img } : {}),
		...(folder ? { folder } : {}),
		system: data.system,
		items: data.items,
		flags: { [SYSTEM_ID]: { [CAST_FLAG]: { myth: key, from: member.printed } } }
	};
}

/**
 * Count an actor of the GM's own among a Myth's Cast.
 * @param {Actor} actor
 * @param {string} key
 * @param {string} myth What to call the Myth in the note that says so.
 * @returns {Promise<Actor|null>}
 */
export async function addToCast(actor, key, myth) {
	if (actor.pack) {
		ui.notifications.warn(t("gmToolkit.cast.fromDirectory"));
		return null;
	}
	await actor.setFlag(SYSTEM_ID, CAST_FLAG, { myth: key, from: null });
	ui.notifications.info(t("gmToolkit.cast.added", { name: actor.name, myth }));
	return actor;
}

/**
 * Take an actor out of a Cast. The flag stays, saying they belong to none, so
 * one the book names isn't gathered again by their name.
 * @param {Actor} actor
 * @returns {Promise<Actor>}
 */
export const removeFromCast = (actor) => actor.setFlag(SYSTEM_ID, CAST_FLAG, { myth: null, from: null });
