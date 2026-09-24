/**
 * When a Knight dies (p8): "Even the boldest Knight can die a sudden or
 * ignoble death. Prepare yourself for this. When a Knight dies the player
 * creates a new Knight and they are added to the Company as quickly as
 * possible. Alternatively they may assume control of a Squire or follower."
 *
 * So a fallen Knight leaves their player three ways to carry on, and which of
 * them are open depends on who was riding with them. Their Squire is named on
 * their sheet; their followers are the NPCs made from their Property and kept
 * as theirs, minus the steed, which is a mount rather than somebody to play.
 * Pure, so it can be tested without Foundry.
 */

/** How a player carries on, in the order the book gives them. */
export const FALLEN_PATHS = Object.freeze(["newKnight", "squire", "follower"]);

/**
 * @typedef {object} Companion One actor as this page reads it.
 * @property {string} uuid
 * @property {string} name
 * @property {string} [type]
 * @property {boolean} [isSquire]
 * @property {string} [serves]      The uuid of the Knight they serve.
 * @property {string} [companionOf] The id of the Knight whose Property made them.
 */

/**
 * @typedef {object} FallenKnight
 * @property {string} uuid
 * @property {string} id
 * @property {string} [squire] The uuid of their Squire, as their sheet names it.
 * @property {string} [steed]  The uuid of their steed.
 */

/**
 * @param {FallenKnight} knight
 * @param {Companion[]} actors Every actor in the world.
 * @returns {Companion|null} Their Squire, by the sheet's own link or by who they serve.
 */
export function squireOf(knight, actors) {
	if (!knight) return null;
	return actors.find((actor) => actor.uuid && actor.uuid === knight.squire)
		?? actors.find((actor) => actor.isSquire && actor.serves === knight.uuid)
		?? null;
}

/**
 * Those who rode with a Knight and could be played in their stead: whoever
 * serves them or was made from their Property. Their steed is left out, and so
 * is their Squire, who is taken up by a path of their own.
 * @param {FallenKnight} knight
 * @param {Companion[]} actors
 * @param {Companion|null} [theirSquire] Their Squire, where the caller has already found them.
 * @returns {Companion[]}
 */
export function followersOf(knight, actors, theirSquire = undefined) {
	if (!knight) return [];
	const squire = theirSquire === undefined ? squireOf(knight, actors) : theirSquire;
	return actors.filter((actor) =>
		actor.uuid !== knight.steed
		&& actor.uuid !== squire?.uuid
		&& (actor.companionOf === knight.id || actor.serves === knight.uuid));
}

/**
 * Which ways of carrying on to offer.
 * @param {object} options
 * @param {boolean} options.squire     Whether they left a Squire.
 * @param {number} options.followers   How many followers they left.
 * @param {boolean} [options.canCreate] Whether this user may make a new Knight.
 * @returns {string[]} Some of FALLEN_PATHS, in the book's order.
 */
export function fallenPaths({ squire, followers, canCreate = true }) {
	return FALLEN_PATHS.filter((path) => {
		if (path === "newKnight") return canCreate;
		if (path === "squire") return Boolean(squire);
		return followers > 0;
	});
}

/**
 * Whether a death leaves the table anything to settle: a Knight somebody plays,
 * Slain rather than merely Wounded. A Squire's death is their Knight's grief,
 * not a player's own end, so it isn't offered these paths.
 * @param {object} knight
 * @param {string} knight.type
 * @param {boolean} [knight.isSquire]
 * @param {boolean} [knight.hasPlayerOwner]
 * @param {string} outcome One of the damage outcomes.
 * @returns {boolean}
 */
export const knightHasFallen = ({ type, isSquire = false, hasPlayerOwner = false }, outcome) =>
	outcome === "slain" && type === "knight" && !isSquire && hasPlayerOwner;
