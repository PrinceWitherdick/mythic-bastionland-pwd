/**
 * Virtue rules (Basic Rules, p8). Pure functions so they can be tested
 * without Foundry.
 */

/** Virtue keys in sheet order, abbreviated the way the book prints them. */
export const VIRTUES = Object.freeze(["vig", "cla", "spi"]);

/** Every score a character can be rolled or harmed in: their Virtues, then GD. */
export const SCORES = Object.freeze([...VIRTUES, "guard"]);

/** Hirelings and other folk of the Realm have d12+d6 in each Virtue (Service, p13). */
export const FOLK_VIRTUE_ROLL = "1d12+1d6";

/** The score every NPC's Virtues start at, until something gives it its own. */
export const DEFAULT_VIRTUE = 10;

/**
 * Whether a character still has the Virtues every NPC starts with, so nothing
 * has given it any: a hireling fresh from the book, whose entry gives only GD.
 * @param {{virtues?: Record<string, {value: number, max: number}>}} system
 * @returns {boolean}
 */
export const hasUnrolledVirtues = (system) => VIRTUES.every((key) => system?.virtues?.[key]?.value === DEFAULT_VIRTUE && system.virtues[key].max === DEFAULT_VIRTUE);

/** Virtues stay between 0 and 19 (p8). */
export const VIRTUE_MIN = 0;
export const VIRTUE_MAX = 19;

/** The update that leaves somebody dead outright: VIG 0 and Slain, past any Mortal Wound. */
export const SLAIN_UPDATE = Object.freeze({ "system.virtues.vig.value": 0, "system.slain": true, "system.mortalWound": false });

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
 * VIG 0 by Damage Slays (p8), but Virtue Loss never does (p9), so Slain is a
 * mark of its own and only those not Slain at VIG 0 are Exhausted.
 * @param {object} character
 * @param {Record<string, {value: number}>} character.virtues
 * @param {boolean} character.fatigued
 * @param {boolean} character.exposed     Caught with their guard down.
 * @param {boolean} character.mortalWound
 * @param {boolean} [character.wounded]   Marked when Damage last went past their GD.
 * @param {boolean} [character.mounted]
 * @param {boolean} [character.slain]     Marked when Damage took them to VIG 0.
 * @returns {{fatigued: boolean, exhausted: boolean, exposed: boolean, impaired: boolean, mortalWound: boolean, wounded: boolean, mounted: boolean, slain: boolean}}
 */
export function conditionsFor({ virtues, fatigued, exposed, mortalWound, wounded = false, mounted = false, slain = false }) {
	return {
		fatigued,
		exhausted: virtues.vig.value === 0 && !slain,
		exposed: exposed || virtues.cla.value === 0,
		impaired: virtues.spi.value === 0,
		mortalWound,
		// Wounded lasts until VIG is restored, however that comes about.
		wounded: Boolean(wounded) && virtues.vig.value < virtues.vig.max,
		mounted: Boolean(mounted),
		slain: Boolean(slain)
	};
}

/**
 * Why somebody can't act at all: Slain, or Mortally Wounded and so down and
 * dying until patched up (p8).
 * @param {{slain?: boolean, mortalWound?: boolean}} system
 * @returns {"slain"|"mortalWound"|null} A condition key, or null when they can act.
 */
export function downBy(system) {
	if (system?.slain) return "slain";
	if (system?.mortalWound) return "mortalWound";
	return null;
}

/**
 * Whether an update brings a Slain character's VIG back above 0, so the mark
 * goes: the dead don't heal, so whoever does it is undoing the death, such as
 * a GM taking back a blow.
 * @param {{slain?: boolean}} system As it stands.
 * @param {object} changes An Actor update, expanded.
 * @returns {boolean}
 */
export function revives(system, changes) {
	const update = changes?.system;
	if (!system?.slain || !update || "slain" in update) return false;
	const value = update.virtues?.vig?.value;
	return value !== undefined && value > 0;
}

/**
 * Whether an update marks a Mortally Wounded character Slain, so the wound
 * goes: the dead are no longer dying, however the mark was made.
 * @param {{mortalWound?: boolean}} system As it stands.
 * @param {object} changes An Actor update, expanded.
 * @returns {boolean}
 */
export function endsMortalWound(system, changes) {
	const update = changes?.system;
	return Boolean(system?.mortalWound) && update?.slain === true && !("mortalWound" in update);
}

/**
 * Whether an update restores a Wounded character's VIG, so the mark can go:
 * Wounded lasts until then, and a stale mark would Wound them again with the
 * next VIG they lost, however they lost it.
 * @param {{wounded?: boolean, virtues: {vig: {value: number, max: number}}}} system As it stands.
 * @param {object} changes An Actor update, expanded.
 * @returns {boolean}
 */
export function healsWound(system, changes) {
	const update = changes?.system;
	if (!system?.wounded || !update || "wounded" in update) return false;
	const vig = { ...system.virtues.vig, ...update.virtues?.vig };
	return vig.value >= vig.max;
}

/**
 * Clear the marks an update leaves behind, writing it into the update itself:
 * Wounded once VIG is whole again, Slain once VIG is above 0, and a Mortal
 * Wound once they're Slain.
 * @param {object} system As it stands.
 * @param {object} changes An Actor update, expanded.
 */
export function clearOutgrownMarks(system, changes) {
	if (healsWound(system, changes)) changes.system.wounded = false;
	if (revives(system, changes)) changes.system.slain = false;
	if (endsMortalWound(system, changes)) changes.system.mortalWound = false;
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

/**
 * A d20 face a player rolled at the table and typed into a form, or null when
 * the box was left empty for the dice to be rolled here instead.
 * @param {unknown} value
 * @returns {number|null}
 */
export function typedD20(value) {
	if (value === null || value === undefined || value === "") return null;
	const face = Number(value);
	return Number.isInteger(face) && face >= 1 && face <= 20 ? face : null;
}
