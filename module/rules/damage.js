/**
 * Damage resolution (Attacks and Damage, p8). Pure so the order of
 * operations can be tested without Foundry.
 */

/**
 * @typedef {"none"|"evaded"|"scar"|"wounded"|"mortal"|"slain"} DamageOutcome
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
 * @param {boolean} [args.exposed]    Exposed targets act as if they have 0GD.
 *                                    Their real GD is left untouched.
 * @returns {DamageResult}
 */
export function resolveDamage({ damage, armour = 0, guard, vigour, exposed = false }) {
	const dealt = Math.max(0, Math.trunc(damage) - Math.max(0, Math.trunc(armour)));
	const unchanged = { dealt, guard, vigour, guardLoss: 0, vigourLoss: 0 };

	if (dealt === 0) return { ...unchanged, outcome: "none" };

	const effectiveGuard = exposed ? 0 : guard;

	if (dealt < effectiveGuard) {
		return { ...unchanged, guard: guard - dealt, guardLoss: dealt, outcome: "evaded" };
	}

	const guardAfter = exposed ? guard : 0;
	const guardLoss = guard - guardAfter;

	if (dealt === effectiveGuard) {
		return { ...unchanged, guard: guardAfter, guardLoss, outcome: "scar" };
	}

	const vigourLoss = Math.min(dealt - effectiveGuard, vigour);
	const vigourAfter = vigour - vigourLoss;

	let outcome = "wounded";
	if (vigourAfter <= 0) outcome = "slain";
	else if (vigourLoss >= vigour / 2) outcome = "mortal";

	return { dealt, guard: guardAfter, vigour: vigourAfter, guardLoss, vigourLoss, outcome };
}
