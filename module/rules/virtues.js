/**
 * Virtue rules (Basic Rules, p8). Pure functions so they can be tested
 * without Foundry.
 */

/** Virtue keys in sheet order, abbreviated the way the book prints them. */
export const VIRTUES = Object.freeze(["vig", "cla", "spi"]);

/** Virtues "can never go higher than 19 or lower than 0". */
export const VIRTUE_MIN = 0;
export const VIRTUE_MAX = 19;

/**
 * Keep a Virtue inside the range the rules allow.
 * @param {number} value
 * @returns {number}
 */
export function clampVirtue(value) {
	const whole = Math.trunc(Number(value)) || 0;
	return Math.min(VIRTUE_MAX, Math.max(VIRTUE_MIN, whole));
}

/**
 * A Save passes when the d20 shows a number equal to or below the Virtue.
 * @param {number} roll   The d20 result.
 * @param {number} virtue The current value of the Virtue being tested.
 * @returns {boolean}
 */
export function isSavePassed(roll, virtue) {
	return roll <= virtue;
}
