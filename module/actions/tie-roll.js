import { t } from "../chat/cards.js";
import { keptFromMe } from "./solo.js";

/**
 * Roll between several that fit equally, such as Myths as near as each other.
 * Played alone, the die is kept off the card, since its size would count Myths
 * or Landmarks not yet met. Kept apart from solo.js so a test standing in for
 * `keptFromMe` stands in for it here too.
 * @param {number} choices
 * @returns {Promise<{pick: number, roll: Roll|null, shown: Roll|null}>} The index picked, the die
 *   (none for one choice or fewer), and the die again if it may go on the card.
 */
export async function rollBetween(choices) {
	if (choices <= 1) return { pick: 0, roll: null, shown: null };
	const roll = await new Roll(`1d${choices}`).evaluate();
	return { pick: roll.total - 1, roll, shown: keptFromMe() ? null : roll };
}

/**
 * The line telling which Myths a die chose between, or null when played alone,
 * where it would number Myths not yet met.
 * @param {{number: number}[]} myths
 * @returns {string|null}
 */
export const tiedHint = (myths) => (keptFromMe() ? null : t("realm.wilderness.tied", { numbers: myths.map((myth) => myth.number).join(", ") }));
