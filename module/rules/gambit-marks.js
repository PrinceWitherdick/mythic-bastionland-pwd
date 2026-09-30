/**
 * What a landed Gambit leaves on the foe (Gambits, p10). Five of the eight are
 * over the moment they are declared: Bolster changes the Damage, Move, Repel
 * and Dismount move somebody, and Other is the Referee's to judge. Three reach
 * into the turns that follow, so somebody has to remember them:
 *
 *   Impair  one of their weapons, for their next turn
 *   Stop    their moving, on their next turn
 *   Trap    their shield, until your next turn
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
 * @property {import("./attack.js").ImpairedWeapon|null} [weapon] The one weapon an Impair holds,
 *   or null for the foe's whole next Attack.
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
 * Whoever performed a Gambit: whoever rolled the die it spent, in a joint
 * Attack, or whoever Focused for it, and otherwise the attacker. A Trap holds
 * until *their* next turn (p10), so the mark is theirs.
 * @param {import("./attack.js").AttackState} attack
 * @param {import("./attack.js").Gambit} gambit
 * @returns {{uuid: string|null, name: string|null}}
 */
export function gambitPayer(attack, gambit) {
	const uuid = (gambit.die === null ? gambit.payer : attack.dice?.[gambit.die]?.actor) || attack.attacker || null;
	if (!uuid || uuid === attack.attacker) return { uuid, name: attack.attackerName ?? null };
	return { uuid, name: (attack.joined ?? []).find((entry) => entry.actor === uuid)?.name ?? null };
}

/**
 * The marks one Attack card still holds over whoever it targeted. A Gambit the
 * foe Saved against, one taken back, and one already cleared leave nothing.
 * Each mark is its payer's, named for them and, for a Trap, timed by their turn.
 * @param {import("./attack.js").AttackState} attack
 * @param {object} [turns] As `lapsePlace` takes them.
 * @param {number|null} [turns.ownTurn]
 * @param {(uuid: string|null) => number|null} [turns.turnOf] Anybody's place in the turn order.
 * @returns {Mark[]}
 */
export function attackMarks(attack, { ownTurn = null, turnOf = () => null } = {}) {
	const laid = attack.place ?? null;
	return attack.gambits.flatMap((gambit, index) => {
		if (!MARK_GAMBITS.includes(gambit.key) || gambit.dismissed || gambit.save?.passed) return [];
		const payer = gambitPayer(attack, gambit);
		return [{
			key: gambit.key,
			index,
			by: payer.name,
			combat: laid?.combat ?? null,
			lapse: lapsePlace(gambit.key, laid, { ownTurn, attackerTurn: turnOf(payer.uuid) }),
			weapon: gambit.weapon ?? null
		}];
	});
}

/**
 * Whether an Impair's weapon is this item: by its id, or by its name where the
 * foe attacks from another copy of their sheet than the one the Gambit read,
 * as an unlinked Token's is.
 * @param {import("./attack.js").ImpairedWeapon} weapon
 * @param {{id: string, name: string}} item
 * @returns {boolean}
 */
export function isImpairedWeapon(weapon, item) {
	if (!weapon || !item) return false;
	return weapon.id === item.id || weapon.name.trim().toLowerCase() === String(item.name ?? "").trim().toLowerCase();
}

/**
 * @typedef {object} ShownWeapons What an actor has been seen attacking with.
 * @property {Set<string>} ids The items their dice were rolled for.
 * @property {Set<string>} labels Lower-cased labels of dice that name no item, rolled before dice did.
 */

/**
 * What an actor has been seen attacking with, from the dice they rolled on
 * these Attack cards, by themselves or into another's.
 * @param {import("./attack.js").AttackState[]} attacks The cards somebody can see.
 * @param {string} uuid The actor.
 * @returns {ShownWeapons}
 */
export function shownWeapons(attacks, uuid) {
	const shown = { ids: new Set(), labels: new Set() };
	for (const attack of attacks) {
		for (const die of attack?.dice ?? []) {
			if ((die.actor ?? attack.attacker) !== uuid) continue;
			if (die.item) shown.ids.add(die.item);
			else shown.labels.add(String(die.label ?? "").trim().toLowerCase());
		}
	}
	return shown;
}

/**
 * Whether a weapon has been shown: a die was rolled for it, or, on a card
 * from before dice named their item, labelled with its name or its name and
 * how it was used, as "Bolt-guisarme, shot" or "Axe, specialist".
 * @param {ShownWeapons} shown From shownWeapons.
 * @param {{id: string, name: string}} item
 * @returns {boolean}
 */
export function weaponShown(shown, item) {
	if (shown.ids.has(item.id)) return true;
	const own = String(item.name ?? "").trim().toLowerCase();
	if (!own) return false;
	return [...shown.labels].some((label) => label === own || label.startsWith(`${own}, `));
}

/**
 * Whether a landed Impair holds somebody's whole next Attack: one that named
 * no weapon, which is how it always read before a weapon could be named.
 * @param {Mark[]} marks
 * @returns {boolean}
 */
export const impairsWhole = (marks) => marks.some((mark) => mark.key === "impair" && !mark.weapon);

/**
 * The first of these items a landed Impair holds, which Impairs any Attack
 * made with it (p10), as p186's crocodile has its jaw Impaired and could still
 * fight with its tail.
 * @param {Mark[]} marks
 * @param {{id: string, name: string}[]} items What the Attack is made with.
 * @returns {string|null} The Impaired item's name, or null when none is.
 */
export function impairedItem(marks, items) {
	for (const mark of marks) {
		if (mark.key !== "impair" || !mark.weapon) continue;
		const held = items.find((item) => isImpairedWeapon(mark.weapon, item));
		if (held) return held.name;
	}
	return null;
}
