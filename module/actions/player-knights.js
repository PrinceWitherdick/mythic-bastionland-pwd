/**
 * Players make their own Knights. Foundry leaves Create Actors to Assistant GMs
 * and up, so a world is given it for Players and Trusted Players once, as a
 * world setup step: a GM who takes it away again under Configure Permissions
 * keeps it taken away. The same permission lets a player take a Steed or a
 * Squire, muster a Warband and the rest, which make actors of their own.
 *
 * Create Actors isn't per type, so the Actors directory's Create Actor offers a
 * player a Knight only: the GM Toolkit, Domains, NPCs and Structures are the
 * Referee's to make.
 */

/** World setup step key. */
export const PLAYER_KNIGHTS_STEP = "playerActorCreate";

/** The actor types a player is offered by Create Actor. */
export const PLAYER_ACTOR_TYPES = Object.freeze(["knight"]);

/**
 * The roles holding a permission, reading a world that never set it as core's
 * default: every role from the permission's default role up.
 * @param {object} permissions The core "permissions" setting.
 * @param {string} key
 * @returns {number[]}
 */
export function rolesWith(permissions, key) {
	return permissions?.[key]
		?? Array.fromRange(CONST.USER_ROLES.GAMEMASTER + 1).slice(CONST.USER_PERMISSIONS[key].defaultRole);
}

/** Add Players and Trusted Players to those who may create actors. */
export async function grantPlayerActorCreate() {
	const { PLAYER, TRUSTED } = CONST.USER_ROLES;
	const permissions = foundry.utils.deepClone(game.settings.get("core", "permissions") ?? {});
	const roles = rolesWith(permissions, "ACTOR_CREATE");
	if (roles.includes(PLAYER) && roles.includes(TRUSTED)) return;
	permissions.ACTOR_CREATE = [...new Set([...roles, PLAYER, TRUSTED])].sort((a, b) => a - b);
	await game.settings.set("core", "permissions", permissions);
}

/** Narrow Create Actor to a Knight for players. Called during init. */
export function registerPlayerKnightDialog() {
	// On Actor itself, so a module's subclass of it inherits the same.
	const createDialog = Actor.createDialog;
	Actor.createDialog = function (data, createOptions, options = {}, ...rest) {
		if (!game.user.isGM && !options?.types) options = { ...options, types: [...PLAYER_ACTOR_TYPES] };
		return createDialog.call(this, data, createOptions, options, ...rest);
	};
}
