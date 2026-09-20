/**
 * Virtue rules (Basic Rules, p8). Pure functions so they can be tested
 * without Foundry.
 */

/** Virtue keys in sheet order, abbreviated the way the book prints them. */
export const VIRTUES = Object.freeze(["vig", "cla", "spi"]);

/** Every score a character can be rolled or harmed in: their Virtues, then GD. */
export const SCORES = Object.freeze([...VIRTUES, "guard"]);

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
 * Conditions marked by hand, and those that follow from a Virtue at 0
 * (Harm & Scars, p9): Exhausted at VIG 0, Exposed at CLA 0, Impaired at SPI 0.
 * @param {object} character
 * @param {Record<string, {value: number}>} character.virtues
 * @param {boolean} character.fatigued
 * @param {boolean} character.exposed     Caught with their guard down.
 * @param {boolean} character.mortalWound
 * @returns {{fatigued: boolean, exhausted: boolean, exposed: boolean, impaired: boolean, mortalWound: boolean}}
 */
export function conditionsFor({ virtues, fatigued, exposed, mortalWound }) {
	return {
		fatigued,
		exhausted: virtues.vig.value === 0,
		exposed: exposed || virtues.cla.value === 0,
		impaired: virtues.spi.value === 0,
		mortalWound
	};
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
