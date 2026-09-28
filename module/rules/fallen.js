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

/**
 * How a player carries on, in the order the book gives them. p195 adds the
 * successor a Knight named (Succession, p17): "You can make a brand new Knight
 * or you could take on a successor."
 */
export const FALLEN_PATHS = Object.freeze(["newKnight", "successor", "squire", "follower"]);

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
 * @property {string} [successor] The uuid of the Knight or Squire they named to follow them.
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
 * The successor a Knight named on their sheet, whom their player may take up
 * in their stead (p195). A Knight or Squire another player already plays is
 * left to that player, so isn't given.
 * @param {FallenKnight & {players?: string[]}} knight The fallen Knight, with the players who own them.
 * @param {(Companion & {players?: string[]})[]} actors Every actor, each with the players who own them.
 * @returns {Companion|null}
 */
export function successorOf(knight, actors) {
	if (!knight?.successor) return null;
	const heir = actors.find((actor) => actor.uuid === knight.successor && actor.uuid !== knight.uuid && actor.type === "knight");
	if (!heir) return null;
	const theirs = new Set(knight.players ?? []);
	return (heir.players ?? []).every((player) => theirs.has(player)) ? heir : null;
}

/**
 * Those who rode with a Knight and could be played in their stead: whoever
 * serves them or was made from their Property. Their steed is left out, and so
 * is their Squire, who is taken up by a path of their own, and so is their
 * successor, who has one too.
 * @param {FallenKnight} knight
 * @param {Companion[]} actors
 * @param {Companion|null} [theirSquire] Their Squire, where the caller has already found them.
 * @param {Companion|null} [theirSuccessor] Their successor, where one is taken up by a path of their own.
 * @returns {Companion[]}
 */
export function followersOf(knight, actors, theirSquire = undefined, theirSuccessor = null) {
	if (!knight) return [];
	const squire = theirSquire === undefined ? squireOf(knight, actors) : theirSquire;
	return actors.filter((actor) =>
		actor.uuid !== knight.steed
		&& actor.uuid !== squire?.uuid
		&& actor.uuid !== theirSuccessor?.uuid
		&& (actor.companionOf === knight.id || actor.serves === knight.uuid));
}

/**
 * Which ways of carrying on to offer.
 * @param {object} options
 * @param {boolean} options.squire      Whether they left a Squire.
 * @param {number} options.followers    How many followers they left.
 * @param {boolean} [options.successor] Whether they named a successor, other than their Squire, whom their player may take up.
 * @param {boolean} [options.canCreate] Whether this user may make a new Knight.
 * @returns {string[]} Some of FALLEN_PATHS, in the book's order.
 */
export function fallenPaths({ squire, followers, successor = false, canCreate = true }) {
	return FALLEN_PATHS.filter((path) => {
		if (path === "newKnight") return canCreate;
		if (path === "successor") return Boolean(successor);
		if (path === "squire") return Boolean(squire);
		return followers > 0;
	});
}

/**
 * The Glory of the Knights still riding in the Company: every played Knight
 * who isn't a Squire, isn't Slain and has been chosen.
 * @param {{glory?: number, isSquire?: boolean, played?: boolean, slain?: boolean, unchosen?: boolean}[]} knights
 * @returns {{lowest: number, highest: number}|null} Null where nobody rides on.
 */
export function companyGlory(knights) {
	const glories = (knights ?? [])
		.filter((knight) => knight.played && !knight.isSquire && !knight.slain && !knight.unchosen)
		.map((knight) => Math.max(0, Math.trunc(Number(knight.glory)) || 0));
	return glories.length ? { lowest: Math.min(...glories), highest: Math.max(...glories) } : null;
}

/**
 * Whether a Knight made to replace one who fell may start with some Glory,
 * and how much to suggest. "In most cases I'd start the new Knight as a Young
 * Knight-Errant, but if the Company is well-established then it might make
 * sense to start them with some Glory" (p195). The Company counts as well
 * established once somebody in it has more Glory than the Start gives, and the
 * suggestion is the least any of them has, so the newcomer outranks nobody.
 * @param {{lowest: number, highest: number}|null} company From companyGlory.
 * @param {number} startGlory The Glory the chosen Start gives.
 * @returns {{lowest: number, highest: number, suggested: number}|null} Null where nothing is offered.
 */
export function replacementGlory(company, startGlory) {
	const start = Math.max(0, Number(startGlory) || 0);
	if (!company || company.highest <= start) return null;
	return { lowest: company.lowest, highest: company.highest, suggested: Math.max(start, company.lowest) };
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
