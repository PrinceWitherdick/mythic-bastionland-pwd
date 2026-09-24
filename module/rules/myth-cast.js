/**
 * A Myth's Cast: the stat blocks the book prints beside its Omens, gathered
 * with whoever the world has made of them.
 *
 * An actor says which Cast it belongs to with a flag naming the Myth and the
 * entry it was made from, so a renamed one stays where it was put. One made
 * before, such as from the NPC chooser, is collected by its name instead.
 * Pure, so it can be tested without Foundry.
 */
import { splitCastName } from "./stat-blocks.js";

/** The flag an actor carries under the system's scope: `{myth, from}`, or `{myth: null}` for one taken out of a Cast. */
export const CAST_FLAG = "cast";

/** The City Quest's Cast (p172) is the one Cast however many Realms there are. */
export const CITY_CAST = "city";

/**
 * @param {string|null|undefined} name
 * @returns {string} Its letters and numbers alone, so "The Wyvern" and "the wyvern" are the same name.
 */
const plain = (name) => String(name ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * @typedef {object} CastActor An actor as the rules read one.
 * @property {string} uuid
 * @property {string} name
 * @property {string|null} [img]
 * @property {boolean} [flagged] Whether it has been put in, or taken out of, a Cast by hand.
 * @property {string|null} [myth] The Cast it was put in: a Myth's roll, or `CITY_CAST`.
 * @property {string|null} [from] The printed Cast entry it was made from.
 */

/**
 * @typedef {object} CastMember One printed Cast entry and whoever has been made of it.
 * @property {number} index Its place in the Cast, as the book prints it.
 * @property {string} printed The whole printed name, "Name, Epithet".
 * @property {string} name
 * @property {string} epithet
 * @property {import("./stat-blocks.js").Stats|null} stats
 * @property {string[]} lines
 * @property {CastActor[]} actors
 */

/**
 * Whether an actor is one of this Cast entry, by the flag it was made with or,
 * failing that, by its name.
 * @param {CastActor} actor
 * @param {{printed: string, name: string}} member
 * @param {string} key Which Myth.
 * @returns {boolean}
 */
function isMember(actor, member, key) {
	if (actor.myth === key && actor.from) return plain(actor.from) === plain(member.printed);
	// A flag is the last word on where an actor belongs: only one never placed is collected by its name.
	if (actor.flagged) return false;
	return [member.printed, member.name].some((name) => plain(actor.name) === plain(name));
}

/**
 * One Myth's Cast: each printed entry with the actors that are it, and after
 * them anyone else put in this Cast by hand.
 * @param {import("./book-art.js").CastEntry[]|null|undefined} cast What the book prints.
 * @param {CastActor[]} actors Every actor that could belong to a Cast.
 * @param {string} key Which Myth: its roll on the Myths table, such as "1-05", or `CITY_CAST`.
 * @returns {{members: CastMember[], extras: CastActor[], made: number, missing: number}}
 */
export function gatherCast(cast, actors, key) {
	const taken = new Set();
	const members = (cast ?? []).map((entry, index) => {
		const { name, epithet } = splitCastName(entry.name);
		const member = { index, printed: String(entry.name ?? ""), name, epithet, stats: entry.stats ?? null, lines: entry.lines ?? [] };
		// An actor stands for one entry only, so two of a name don't fill both.
		const mine = actors.filter((actor) => !taken.has(actor.uuid) && isMember(actor, member, key));
		for (const actor of mine) taken.add(actor.uuid);
		return { ...member, actors: mine };
	});
	const extras = actors.filter((actor) => actor.myth === key && !taken.has(actor.uuid));
	const made = members.filter((member) => member.actors.length).length;
	return { members, extras, made, missing: members.length - made };
}

/**
 * The entries of a Cast nobody has been made of yet, for making the rest of it at once.
 * @param {CastMember[]} members
 * @returns {CastMember[]}
 */
export const castToMake = (members) => members.filter((member) => !member.actors.length);
