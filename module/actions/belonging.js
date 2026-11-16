import { askActiveGMOrWarn } from "../ask-gm-warn.js";
import { gmAsker } from "../gm-asker.js";
import { stillServes } from "../rules/squires.js";
import { isKnight } from "../rules/knight-types.js";
import { SYSTEM_ID } from "../system-id.js";
import { playersOf } from "./knights.js";
import { registerQuery } from "../queries.js";

/**
 * Who belongs with a Knight or Domain, and the ownership that follows: a
 * Squire, steed, companion, follower, Domain or Warband is shared with
 * whoever plays the one it belongs with. The Referee shares it as they make
 * the link; a player who makes one asks the active GM to.
 */

/** The flag on an NPC made from a Knight's gear, or taken on as their follower: the Knight's id. */
export const COMPANION_FLAG = "companionOf";

/** Marks a Warband as one a Domain has raised. Kept as its id, as companions are. */
export const MUSTERED_FLAG = "musteredBy";

/**
 * @param {string} [uuid] A link one actor keeps to another, such as a Squire's or a steed's.
 * @returns {Actor|null} The actor it names, if it still exists.
 */
export function linkedActor(uuid) {
	const actor = uuid ? fromUuidSync(uuid) : null;
	return actor?.documentName === "Actor" ? actor : null;
}

/**
 * The Squire a Knight's sheet names, while they still serve that Knight: not
 * Knighted since, nor taken by another Knight, nor, unless the dead are
 * wanted too, Slain.
 * @param {Actor} knight
 * @param {object} [options] As stillServes takes them.
 * @returns {Actor|null}
 */
export function servingSquire(knight, options) {
	const squire = linkedActor(knight?.system?.isSquire ? "" : knight?.system?.squire);
	return squire && stillServes(squire.system, knight.uuid, options) ? squire : null;
}

/**
 * The ownership a Squire, steed, follower or Warband is made with: whatever the
 * Knight or Domain it belongs with has, so those who see them see it. Only a GM
 * may hand ownership to others; a player who makes one asks after (shareMade).
 * @param {Actor} from The Knight or Domain it belongs with.
 * @returns {{ownership?: object}} Part of the creation data, empty for a player.
 */
export const madeOwnership = (from) => (game.user.isGM ? { ownership: foundry.utils.deepClone(from.ownership) } : {});

/**
 * The ownership a Knight's companion is given when the Referee links them:
 * what they had, raised to whatever the Knight's players have, so a player
 * can see and play the Squire, steed or follower their Knight was given.
 * @param {Actor} companion
 * @param {Actor} knight
 * @returns {object} An update, empty for a player, who can't hand ownership on.
 */
export function sharedOwnership(companion, knight) {
	if (!game.user.isGM) return {};
	const ownership = raisedOwnership(companion.ownership, knight.ownership);
	return ownership ? { ownership } : {};
}

/**
 * Ownership raised so each user has at least what another gives them. The
 * default is left as it is: only the users named are raised.
 * @param {Record<string, number>} [ownership]
 * @param {Record<string, number>} [to]
 * @returns {Record<string, number>|null} The raised ownership, or null where nobody rises.
 */
function raisedOwnership(ownership = {}, to = {}) {
	const raised = { ...ownership };
	let changed = false;
	for (const [user, level] of Object.entries(to ?? {})) {
		if (user === "default" || (raised[user] ?? 0) >= level) continue;
		raised[user] = level;
		changed = true;
	}
	return changed ? raised : null;
}

/**
 * @param {Actor} domain
 * @returns {Actor[]} The Knights sitting in its Circle.
 */
const circleKnights = (domain) => (domain.system?.council?.circle ?? []).map((id) => game.actors.get(id)).filter(isKnight);

/**
 * The ownership a Domain is founded with: its ruler's, and a look for the
 * players of each Knight in its Circle, who sit alongside the ruler (p20).
 * @param {Actor} knight The ruler.
 * @param {Actor[]} circle
 * @returns {Record<string, number>}
 */
export function domainOwnership(knight, circle) {
	const { OBSERVER } = CONST.DOCUMENT_OWNERSHIP_LEVELS;
	const ownership = foundry.utils.deepClone(knight.ownership ?? {});
	for (const user of circle.flatMap(playersOf)) ownership[user] = Math.max(ownership[user] ?? ownership.default ?? 0, OBSERVER);
	return ownership;
}

/**
 * Whether an actor belongs with a Knight or Domain, so the Referee may share
 * it as they do: a Squire serving the Knight, the steed they or their Squire
 * ride, a companion from their gear or a follower, the Domain they rule, or a
 * Warband the Domain mustered.
 * @param {Actor} actor
 * @param {Actor} from
 * @returns {boolean}
 */
function belongsWith(actor, from) {
	if (from.type === "domain") return actor.getFlag?.(SYSTEM_ID, MUSTERED_FLAG) === from.id;
	if (!isKnight(from)) return false;
	if (actor.type === "domain") return from.system.domain === actor.uuid;
	if (actor.system?.isSquire) return actor.system.serves === from.uuid;
	if (from.system.steed === actor.uuid || actor.getFlag?.(SYSTEM_ID, COMPANION_FLAG) === from.id) return true;
	return servingSquire(from, { living: false })?.system.steed === actor.uuid;
}

/**
 * @param {Actor} actor
 * @param {Actor} from The Knight or Domain it belongs with.
 * @returns {Record<string, number>|null} The ownership the Referee would have given it, where that's more than it has.
 */
function ownershipFrom(actor, from) {
	const to = actor.type === "domain" ? domainOwnership(from, circleKnights(actor)) : from.ownership;
	return raisedOwnership(actor.ownership, to);
}

/** The query a player sends for what they've made, so it's shared as the Referee would have shared it. */
const SHARE_QUERY = `${SYSTEM_ID}.shareOwnership`;

/**
 * A player who makes a Squire, steed, companion, Warband or Domain owns it
 * alone, since only a GM may hand ownership on. Ask the active GM to share it
 * as they would have, so whoever else plays the Knight, or sits in the
 * Domain's Circle, sees it too. Nothing is asked where there's nothing more to share.
 * @param {(Actor|null)[]} actors Those made or taken, each belonging with `from`.
 * @param {Actor|null} from The Knight or Domain they belong with.
 * @returns {Promise<boolean>} Whether all there was to share was shared.
 */
export async function shareMade(actors, from) {
	if (game.user.isGM || !from) return true;
	const shared = actors.filter((actor) => actor && ownershipFrom(actor, from));
	if (!shared.length) return true;
	const asked = { fromId: from.id, actorIds: shared.map((actor) => actor.id) };
	const notice = { absent: "share.needsReferee", data: { names: shared.map((actor) => actor.name).join(", ") } };
	return Boolean(await askActiveGMOrWarn(SHARE_QUERY, asked, `Couldn't share what belongs with ${from.name}`, notice));
}

/**
 * A player's Squire, steed, companion, Warband or Domain, shared by the GM who
 * was asked: only where the asker owns both it and the Knight or Domain it
 * belongs with, and only as far as the Referee would have shared it.
 * @param {{fromId?: string, actorIds?: string[]}} data
 * @param {object} context
 * @returns {Promise<boolean>}
 */
export async function onShareQuery(data = {}, context = {}) {
	const asker = gmAsker(context);
	if (!asker) return false;
	const from = game.actors.get(String(data?.fromId ?? ""));
	if (!from?.testUserPermission(asker, "OWNER")) return false;
	const actors = (Array.isArray(data?.actorIds) ? data.actorIds : []).map((id) => game.actors.get(String(id)));
	if (!actors.length || actors.some((actor) => !actor?.testUserPermission(asker, "OWNER") || !belongsWith(actor, from))) return false;
	const updates = actors.flatMap((actor) => {
		const ownership = ownershipFrom(actor, from);
		return ownership ? [{ _id: actor.id, ownership }] : [];
	});
	if (updates.length) await Actor.implementation.updateDocuments(updates);
	return true;
}

/** Answer players' sharing of what they've made. Called during init, with the other companion queries. */
export function registerShareQuery() {
	registerQuery(SHARE_QUERY, onShareQuery);
}
