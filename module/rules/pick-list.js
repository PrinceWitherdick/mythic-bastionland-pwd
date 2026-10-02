/**
 * The answer to a dialog drawn with pick-list.hbs: one of a list, or a blank
 * one to fill in. Pure, so it can be tested without Foundry.
 */

/** The value pick-list.hbs gives its blank choice. */
export const PICK_BLANK = "blank";

/**
 * @template {{id: string}} T
 * @param {T[]} list What was offered.
 * @param {unknown} value The form's answer.
 * @returns {T|typeof PICK_BLANK|null} Null for an answer that's none of them.
 */
export const pickedFrom = (list, value) => (value === PICK_BLANK ? PICK_BLANK : list.find((each) => each.id === value) ?? null);
