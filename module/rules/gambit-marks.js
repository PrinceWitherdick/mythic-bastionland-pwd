/**
 * What a landed Gambit leaves on the foe (Gambits, p10). Five of the eight are
 * over the moment they are declared: Bolster changes the Damage, Move, Repel
 * and Dismount move somebody, and Other is the Referee's to judge. Three reach
 * into the turns that follow, so somebody has to remember them:
 *
 *   Impair  a weapon on their next turn
 *   Stop    a foe from moving next turn
 *   Trap    a shield until your next turn
 *
 * A mark is read back off the Attack card that bought it rather than written
 * onto the foe, so taking the Gambit back, or Saving against it, takes the mark
 * with it. While a Combat is running the card remembers where in the turn order
 * it was rolled and the mark lapses on its own; without one it stands until
 * somebody clears it by hand. Pure, so the reckoning can be tested without Foundry.
 */

/** The Gambits that outlast the Attack that bought them. */
export const MARK_GAMBITS = Object.freeze(["impair", "stop", "trap"]);

/** Marks that run through the foe's own next turn, rather than the attacker's. */
const OWN_TURN_MARKS = Object.freeze(["impair", "stop"]);

/**
 * @typedef {object} Place Where a Combat stands: the round, and how far through the turn order.
 * @property {number} round
 * @property {number} turn  Index into the turn order.
 *
 * @typedef {object} Mark What one landed Gambit holds over a foe.
 * @property {string} key          One of MARK_GAMBITS.
 * @property {number} index        Which of the card's Gambits it came from.
 * @property {string|null} by      The attacker's name, or null on a card rolled before names were kept.
 * @property {string|null} combat  Id of the Combat it was laid in, or null when none was running.
 * @property {Place|null} lapse    Where it stops holding, or null when only a hand can clear it.
 */

/**
 * @param {Place} a
 * @param {Place} b
 * @returns {number} Below zero when `a` comes first, as a sort comparator reads.
 */
export const comparePlaces = (a, b) => a.round - b.round || a.turn - b.turn;

/**
 * The next time the combatant at `turn` comes round, counting from `laid`.
 * Their own turn counts as passed, since an Attack is made on somebody's turn.
 * @param {Place} laid
 * @param {number} turn
 * @returns {Place}
 */
export function nextTurn(laid, turn) {
	return turn > laid.turn ? { round: laid.round, turn } : { round: laid.round + 1, turn };
}

/**
 * Where a mark stops holding: the first place in the turn order at which it is gone.
 * @param {string} key One of MARK_GAMBITS.
 * @param {Place|null} laid Where the Attack was rolled.
 * @param {object} [turns]
 * @param {number|null} [turns.ownTurn]      The marked foe's place in the turn order.
 * @param {number|null} [turns.attackerTurn] The attacker's place in it.
 * @returns {Place|null} Null when the turn order can't say, so it lasts until cleared.
 */
export function lapsePlace(key, laid, { ownTurn = null, attackerTurn = null } = {}) {
	if (!laid) return null;
	if (OWN_TURN_MARKS.includes(key)) {
		// It holds through the foe's next turn, and is gone once that turn has passed.
		if (!Number.isInteger(ownTurn)) return null;
		const theirs = nextTurn(laid, ownTurn);
		return { round: theirs.round, turn: theirs.turn + 1 };
	}
	// A Trapped shield comes free as the attacker's next turn begins.
	if (!Number.isInteger(attackerTurn)) return null;
	return nextTurn(laid, attackerTurn);
}

/**
 * @param {Mark} mark
 * @param {(Place & {combat: string})|null} now Where the running Combat stands, or null when none is.
 * @returns {boolean}
 */
export function markLapsed(mark, now) {
	// Laid outside a Combat: nothing but a hand can clear it.
	if (!mark.combat) return false;
	// The fight it was laid in is over, or another has begun.
	if (!now || now.combat !== mark.combat) return true;
	if (!mark.lapse) return false;
	return comparePlaces(now, mark.lapse) >= 0;
}

/**
 * The marks one Attack card still holds over whoever it targeted. A Gambit the
 * foe Saved against, one taken back, and one already cleared leave nothing.
 * @param {import("./attack.js").AttackState} attack
 * @param {object} [turns] As `lapsePlace` takes them.
 * @param {number|null} [turns.ownTurn]
 * @param {number|null} [turns.attackerTurn]
 * @returns {Mark[]}
 */
export function attackMarks(attack, { ownTurn = null, attackerTurn = null } = {}) {
	const laid = attack.place ?? null;
	return attack.gambits.flatMap((gambit, index) => {
		if (!MARK_GAMBITS.includes(gambit.key) || gambit.dismissed || gambit.save?.passed) return [];
		return [{
			key: gambit.key,
			index,
			by: attack.attackerName ?? null,
			combat: laid?.combat ?? null,
			lapse: lapsePlace(gambit.key, laid, { ownTurn, attackerTurn })
		}];
	});
}
