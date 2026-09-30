/**
 * Wavering Morale (p10): someone Wounded, or a group down to half its number,
 * makes a SPI Save or routs or surrenders. An organised group rolls once on
 * its leader's SPI, and a disorganised one rolls each member on their own. None of it affects player characters. Pure, so when to ask
 * can be tested without Foundry.
 */

/** What calls for a Morale Save: one individual Wounded, or a group down to half. */
export const MORALE_TRIGGERS = Object.freeze(["wounded", "halved"]);

/** How a group rolls: once on its leader's SPI, or each member on their own. */
export const GROUP_ORDER = Object.freeze(["organised", "disorganised"]);

/**
 * What a failed Morale Save makes of them: they rout, or they surrender. The
 * book leaves which to the Referee, and either takes them out of the fight.
 */
export const MORALE_BREAKS = Object.freeze(["fled", "surrendered"]);

/** The icon for each of MORALE_BREAKS. */
export const BREAK_ICONS = Object.freeze({ fled: "fa-solid fa-person-running", surrendered: "fa-solid fa-hands-bound" });

/**
 * @param {string} broken
 * @returns {boolean} Whether it's one of the ways Morale breaks.
 */
export const isMoraleBreak = (broken) => MORALE_BREAKS.includes(broken);

/**
 * Whether the Damage just taken calls for a Morale Save.
 * @param {object} args
 * @param {import("./damage.js").DamageOutcome} args.outcome
 * @param {number} args.vigourBefore
 * @param {number} args.vigourAfter
 * @param {number} args.vigourMax
 * @param {boolean} [args.playerCharacter] Morale doesn't affect player characters.
 * @param {boolean} [args.structure]       A structure has no nerve to lose.
 * @param {boolean} [args.warband]
 * @returns {"wounded"|"halved"|null} One of MORALE_TRIGGERS, or null.
 */
export function moraleTrigger({ outcome, vigourBefore, vigourAfter, vigourMax, playerCharacter = false, structure = false, warband = false }) {
	if (playerCharacter || structure || outcome !== "wounded") return null;
	if (!warband) return "wounded";
	// A Warband is a group of two dozen or so, whose VIG stands for its number.
	// A Mortal Wound routs it outright, so only a Wound can leave it wavering.
	const half = vigourMax / 2;
	return vigourBefore > half && vigourAfter <= half ? "halved" : null;
}

/**
 * @param {{vigour: number, mortalWound?: boolean, defeated?: boolean, broken?: string}} member
 *   `broken` is one of MORALE_BREAKS once their Morale has failed, or blank.
 * @returns {boolean} Whether they are out of the fight: Slain, Mortally Wounded, fled or
 *   surrendered, or marked defeated.
 */
export const isDown = ({ vigour, mortalWound = false, defeated = false, broken = "" }) =>
	defeated || mortalWound || isMoraleBreak(broken) || !(vigour > 0);

/**
 * isDown, read from an actor.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {boolean} [options.defeated] Whether their Combatant is marked defeated.
 * @param {boolean} [options.morale=true] Whether a broken Morale counts; false asks whether they're down some other way.
 * @returns {boolean}
 */
export const downOf = (actor, { defeated = false, morale = true } = {}) => isDown({
	vigour: actor.system.virtues?.vig.value,
	mortalWound: actor.system.mortalWound,
	defeated,
	broken: morale ? actor.system.moraleBroken : ""
});

/**
 * Whether a turn in the Combat Tracker should be passed over because its
 * character's Morale broke, without passing over every turn there is: with
 * nobody left who hasn't, the tracker is left where it stands.
 * @param {{broken: string}[]} turns Everybody in the turn order, the current one included.
 * @param {number} index The current turn.
 * @returns {boolean}
 */
export function skipsBrokenTurn(turns, index) {
	if (!isMoraleBreak(turns[index]?.broken)) return false;
	return turns.some((turn) => !isMoraleBreak(turn.broken));
}

/**
 * @param {{down: boolean}[]} members Everybody in the group, down or standing.
 * @returns {boolean} Whether half or more of a group of 2 or more are down.
 */
export function groupHalved(members) {
	const down = members.filter((member) => member.down).length;
	return members.length >= 2 && down * 2 >= members.length;
}

/**
 * Who rolls a group's Morale.
 * @template {{down: boolean}} T
 * @param {T[]} members
 * @param {object} options
 * @param {"organised"|"disorganised"} options.order
 * @param {T|null} [options.leader] The organised group's leader.
 * @returns {T[]} The leader alone, or each member still standing.
 */
export function moraleRollers(members, { order, leader = null }) {
	const standing = members.filter((member) => !member.down);
	if (order === "organised") return leader && !leader.down ? [leader] : [];
	return standing;
}
