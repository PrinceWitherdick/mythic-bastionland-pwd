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
 * Make one of a Cast: an NPC, or a Structure for a stat block that is one,
 * marked as belonging to this Myth and wearing its picture.
 * @param {{printed: string, name: string, stats: object|null, lines: string[]}} member
 * @param {object} options
 * @param {string} options.key  Which Cast, from `castKey`.
 * @param {string|null} [options.img] The Myth's picture.
 * @returns {Promise<Actor|null>}
 */
export async function makeCastMember(member, options) {
	return Actor.implementation.create(castMemberData(member, options));
}

/**
 * What one of them is made from, without making them: the whole Cast is made
 * in one go, so the reading of a member has to be had on its own.
 * @param {object} member One of `castToMake`'s.
 * @param {object} options
 * @param {string} options.key Which Cast, from `castKey`.
 * @param {string|null} [options.img] The Myth's picture.
 * @returns {object} The actor to create.
 */
export function castMemberData(member, { key, img = null }) {
	const data = actorData({ name: member.printed, stats: member.stats, lines: member.lines });
	return {
		name: data.name || member.name,
		type: data.type,
		...(img ? { img } : {}),
		system: data.system,
		items: data.items,
		flags: { [SYSTEM_ID]: { [CAST_FLAG]: { myth: key, from: member.printed } } }
	};
}

/**
 * Make everyone in a Cast nobody has been made of yet, in the order the book prints them.
 * @param {object[]} members From `castToMake`.
 * @param {object} options As `makeCastMember` takes.
 * @returns {Promise<number>} How many were made.
 */
export async function makeWholeCast(members, options) {
	if (!members.length) return 0;
	// One write for the whole Cast, rather than a round trip and a redraw each.
	const created = await Actor.implementation.create(members.map((member) => castMemberData(member, options)));
	const made = created?.length ?? 0;
	if (made) ui.notifications.info(t("gmToolkit.cast.madeAll", { count: made }));
	return made;
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
