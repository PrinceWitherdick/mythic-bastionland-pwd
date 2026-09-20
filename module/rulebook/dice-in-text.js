import { t } from "../chat/cards.js";
import { diceKey, findDiceText } from "../rules/dice-text.js";
import { leaveAlone, wrapMatches } from "./text-marks.js";

/**
 * A die printed in the rules, rolled where it stands: clicking the "d12" in
 * "clusters of d12 hexes" gives the GM a cluster size to paint without
 * leaving the page. Unlike the page links and the rule-word tips, this is
 * asked for window by window rather than marked everywhere, since most dice
 * in the system's text already have a roll button of their own.
 */

/** Every die marked in the text, so none is marked twice. */
export const DICE_CLASS = "bastionland-dice";

/** What the roll gave, printed after the die. */
const RESULT_CLASS = "bastionland-dice__result";

/** The class that flashes a result as it lands, and only then. */
const LANDING = "is-landing";

const LEAVE_ALONE = leaveAlone(DICE_CLASS);

/**
 * Wrap every die printed under an element in a button that rolls it. The
 * window answers the clicks with its own `rollDice` action.
 * @param {HTMLElement} root
 * @returns {HTMLElement[]} The dice marked, in the order they're printed.
 */
export function markDice(root) {
	const seen = new Map();
	const marked = [];
	wrapMatches(root, {
		rejects: (element) => element.matches(LEAVE_ALONE),
		find: (node) => findDiceText(node.nodeValue),
		make: (document, match, words) => {
			const at = seen.get(match.formula) ?? 0;
			seen.set(match.formula, at + 1);
			const die = document.createElement("button");
			die.type = "button";
			die.className = DICE_CLASS;
			die.dataset.action = "rollDice";
			die.dataset.formula = match.formula;
			// The shape drawn before the words: a d12 is printed with a d12.
			die.dataset.faces = String(match.faces);
			die.dataset.die = diceKey(match.formula, at);
			die.dataset.tooltip = t("dice.roll", { dice: words });
			die.textContent = words;
			marked.push(die);
			return die;
		}
	});
	return marked;
}

/**
 * Print what a die gave beside it, in place of any earlier roll.
 * @param {HTMLElement} die A die marked by markDice.
 * @param {number|null} total Null takes an earlier roll away.
 * @param {object} [options]
 * @param {boolean} [options.landing] Flash it, for a roll just made rather than one drawn again.
 */
export function showDiceRoll(die, total, { landing = false } = {}) {
	const shown = die.nextElementSibling;
	if (shown?.classList?.contains(RESULT_CLASS)) shown.remove();
	const dice = die.textContent;
	if (total === null || total === undefined) {
		delete die.dataset.rolled;
		die.dataset.tooltip = t("dice.roll", { dice });
		return null;
	}
	const result = die.ownerDocument.createElement("span");
	result.className = landing ? `${RESULT_CLASS} ${LANDING}` : RESULT_CLASS;
	result.textContent = t("dice.result", { total });
	die.after(result);
	die.dataset.rolled = String(total);
	die.dataset.tooltip = t("dice.again", { dice, total });
	return result;
}

/**
 * Print each die's last roll again after its window drew, so a suggestion
 * stays on the page while the GM works with it.
 * @param {HTMLElement[]} dice From markDice.
 * @param {Map<string, number>} rolls Keyed by each die's `data-die`.
 */
export function restoreDiceRolls(dice, rolls) {
	for (const die of dice) {
		const total = rolls.get(die.dataset.die);
		if (total !== undefined) showDiceRoll(die, total);
	}
}
