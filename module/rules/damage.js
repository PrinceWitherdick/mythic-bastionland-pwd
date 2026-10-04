/**
 * Damage resolution (Attacks and Damage, p8). Pure so the order of
 * operations can be tested without Foundry.
 */

/**
 * @typedef {"unharmed"|"none"|"evaded"|"scar"|"spared"|"wounded"|"mortal"|"slain"|"destroyed"|"broken"|"warded"} DamageOutcome
 *
 * @typedef {object} DamageResult
 * @property {number} dealt       Damage left after Armour.
 * @property {number} guard       GD after the Attack.
 * @property {number} vigour      VIG after the Attack.
 * @property {number} guardLoss
 * @property {number} vigourLoss
 * @property {DamageOutcome} outcome
 */

/**
 * The Armour an Attack is reduced by. Protective cover adds a point against
 * ranged Attacks (p10), and so does a shieldwall of 3 or more allies all
 * bearing shields (p10). An Attack that ignores Armour ignores those too.
 * @param {object} args
 * @param {number} [args.armour=0]      The target's own total Armour.
 * @param {boolean} [args.ignoreArmour]
 * @param {boolean} [args.cover]        Behind protective cover.
 * @param {boolean} [args.ranged]       The Attack is ranged.
 * @param {boolean} [args.shieldwall]   Part of a shieldwall.
 * @returns {number}
 */
export function armourAgainst({ armour = 0, ignoreArmour = false, cover = false, ranged = false, shieldwall = false }) {
	if (ignoreArmour) return 0;
	return Math.max(0, Math.trunc(Number(armour)) || 0) + (cover && ranged ? 1 : 0) + (shieldwall ? 1 : 0);
}

/**
 * Doom (Scar 11): a Mortal Wound taken in the Season the Scar was, Slays instead.
 * @param {DamageResult} result
 * @param {number} vigourBefore The target's VIG before the Attack.
 * @returns {DamageResult & {doom?: boolean}} `doom` marks a result Doom changed.
 */
export function applyDoom(result, vigourBefore) {
	if (result.outcome !== "mortal") return result;
	return { ...result, vigour: 0, vigourLoss: vigourBefore, outcome: "slain", doom: true };
}

/**
 * Damage taken from SPI rather than VIG, as an Ability may deal it (p68): GD
 * goes as ever, and losing at least half their SPI leaves them broken
 * rather than dying, and never Slain.
 * @param {DamageResult} result resolveDamage's, worked out with their SPI as the score.
 * @returns {DamageResult} `vigour` and `vigourLoss` there are their SPI.
 */
export function spiritOutcome(result) {
	return ["mortal", "slain"].includes(result.outcome) ? { ...result, outcome: "broken" } : result;
}

/** Outcomes an ally's ward takes on themself in the victim's place (p66). */
export const WARDED_OUTCOMES = Object.freeze(["mortal", "slain"]);

/**
 * The blow as it lands on a victim whose ally took the Mortal Wound in their
 * place (p66): their GD goes as it would have, but no VIG.
 * @param {DamageResult} result
 * @param {number} vigourBefore Their VIG before the blow.
 * @returns {DamageResult}
 */
export const wardedResult = (result, vigourBefore) => ({ ...result, vigour: vigourBefore, vigourLoss: 0, outcome: "warded" });

/**
 * Apply one Attack's Damage to a target.
 *
 * Armour is subtracted first. What remains comes off GD: any GD left means the
 * Attack was Evaded, exactly 0GD means a Scar, and anything beyond GD comes off
 * VIG as a Wound. Losing half or more of the VIG the target had is a Mortal
 * Wound, and reaching 0 VIG is Slain.
 *
 * @param {object} args
 * @param {number} args.damage        The Attack's Damage, including any Bolster.
 * @param {number} [args.armour=0]    The target's total Armour.
 * @param {number} args.guard         The target's current GD.
 * @param {number} args.vigour        The target's current VIG.
 * @param {boolean} [args.exposed]    An Exposed target counts as having 0GD.
 *                                    Their real GD is left untouched.
 * @param {boolean} [args.immune]     The Attack can't harm the target at all, as an
 *                                    individual's Attack can't harm a Warband (p11).
 * @param {boolean} [args.structure]  A ship or structure is destroyed at 0GD (p11),
 *                                    and have no VIG to lose.
 * @param {boolean} [args.nonLethal]  Non-lethal Damage leaves at least 1 VIG, so it never Slays.
 * @returns {DamageResult}
 */
export function resolveDamage({ damage, armour = 0, guard, vigour, exposed = false, immune = false, structure = false, nonLethal = false }) {
	const dealt = Math.max(0, Math.trunc(damage) - Math.max(0, Math.trunc(armour)));
	const unchanged = { dealt, guard, vigour, guardLoss: 0, vigourLoss: 0 };

	if (immune) return { ...unchanged, dealt: 0, outcome: "unharmed" };
	if (dealt === 0) return { ...unchanged, outcome: "none" };

	if (structure) {
		if (dealt < guard) return { ...unchanged, guard: guard - dealt, guardLoss: dealt, outcome: "evaded" };
		return { ...unchanged, guard: 0, guardLoss: guard, outcome: "destroyed" };
	}

	const effectiveGuard = exposed ? 0 : guard;

	if (dealt < effectiveGuard) {
		return { ...unchanged, guard: guard - dealt, guardLoss: dealt, outcome: "evaded" };
	}

	const guardAfter = exposed ? guard : 0;
	const guardLoss = guard - guardAfter;

	if (dealt === effectiveGuard) {
		return { ...unchanged, guard: guardAfter, guardLoss, outcome: "scar" };
	}

	const vigourLoss = Math.min(dealt - effectiveGuard, nonLethal ? Math.max(0, vigour - 1) : vigour);
	const vigourAfter = vigour - vigourLoss;
	if (vigourLoss === 0) {
		// Exhausted at VIG 0 by Virtue Loss, Damage past their GD leaves them at 0 by Damage: Slain (p8).
		if (vigour <= 0 && !nonLethal) return { dealt, guard: guardAfter, vigour: 0, guardLoss, vigourLoss, outcome: "slain" };
		// Non-lethal Damage at 1 VIG has nothing left to take, so it leaves no Wound.
		return { dealt, guard: guardAfter, vigour, guardLoss, vigourLoss, outcome: "spared" };
	}

	let outcome = "wounded";
	if (vigourAfter <= 0) outcome = "slain";
	else if (vigourLoss >= vigour / 2) outcome = "mortal";

	return { dealt, guard: guardAfter, vigour: vigourAfter, guardLoss, vigourLoss, outcome };
}
