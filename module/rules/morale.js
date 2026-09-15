/**
 * Wavering Morale (p10): individuals who are Wounded, or groups who lose half
 * their number, must pass a SPI Save to avoid rout or surrender. Organised
 * groups roll once using their leader's SPI, and disorganised groups roll for
 * each individual. None of it affects player characters. Pure, so when to ask
 * can be tested without Foundry.
 */

/** What calls for a Morale Save: one individual Wounded, or a group down to half. */
export const MORALE_TRIGGERS = Object.freeze(["wounded", "halved"]);

/** How a group rolls: once on its leader's SPI, or each member on their own. */
export const GROUP_ORDER = Object.freeze(["organised", "disorganised"]);

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
 * @param {{vigour: number, mortalWound?: boolean, defeated?: boolean}} member
 * @returns {boolean} Whether they are out of the fight: Slain, Mortally Wounded or marked defeated.
 */
export const isDown = ({ vigour, mortalWound = false, defeated = false }) => defeated || mortalWound || !(vigour > 0);

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
